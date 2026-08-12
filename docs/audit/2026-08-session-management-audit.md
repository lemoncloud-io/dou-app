# 2026-08 세션 관리 점검 (리프레시 폭주·장기 방치 만료·core/runtime 경계)

> 작성: 2026-08-11 · 대상: `libs/web-core` · `libs/app-runtime` · SDK(`@lemoncloud/chatic-sockets-lib`) · `@lemoncloud/lemon-web-core` · apps(web/admin-v2/desktop-web 참조)
>
> 입력 증상:
>
> 1. 소켓 백그라운드 → 포그라운드 복귀 시 리프레시 요청 폭주(시그니처 오류 무한 리트라이)가 간헐 발생
> 2. 어드민/클라이언트를 장시간 방치하면 세션이 만료되는 케이스 존재 — 자동 리프레시 동작 점검 필요
> 3. ClientSocketAuth(SDK `AuthController`)를 auth SSoT로: web-core는 서명 계산 등 순수 작업만, 토큰은 주입받아 수행. 리프레시는 전부 ClientSocketAuth에서.
> 4. core(web-core)/runtime(app-runtime) 로직이 부적절하게 확장된 곳 판단 + 리팩터링 준비

---

## 0. TL;DR (판정 요약)

1. **리프레시 엔진이 아직 3개다.** SDK `AuthController`(의도된 SSoT) 외에, ① `lemon-web-core` 내부 자동 refresh(`init()`/`isAuthenticated()`가 만료 시 각자 HTTP refresh — 캡·single-flight·백오프 없음, 실패해도 상태를 안 바꿈), ② web-core 서비스 refresh(`refreshRelaySession`/`refreshCloudSession` — 로그인/전환 플로우 한정)가 살아 있다. ①은 **relayCore/SDK로 역전파가 없어서** 소켓 서명 재료를 stale로 만들 수 있는, "web-core 쪽 리프레시가 꼬이는" 바로 그 경로다.
2. **"무수히 많은 리프레시 + 시그니처 오류"는 재연결 무한루프 × 인증 실패의 결합이 유력하다.** SDK 백오프는 3회 초과 시 `expired` 터미널로 멈추게 설계돼 있으나, (a) 재연결은 **무한**(maxAttempts=0)이고, (b) 우리 게이트(`bootstrapSocketConnection`)가 `device.save:ok`마다 **무조건 `start()`** 해 터미널 상태의 컨트롤러를 되살린다. 서버가 인증 실패 소켓을 끊는 환경이면 "재연결 → device.save → auth.update/refresh 실패 → 끊김 → 재연결"이 무한 반복된다. 같은 증상의 필드 증거가 desktop-web에 있다(`useSocketWedgeReload`: "token refresh 400 loop" → 25초 후 자동 리로드로 덮음).
3. **장기 방치 만료의 실체:** relay 소켓이 터미널 `expired`에 도달하면 **복구 경로가 없다**(정책: warn-only, 수동 로그아웃/리로드만). 그런데 `isAuthenticated` 플래그는 만료로 안 뒤집히므로 UI는 로그인 상태처럼 보이는 좀비가 된다. apps/web은 admin-v2의 30초 가드 같은 HTTP 크레덴셜 보수 장치도, desktop-web의 wake-kick도 없다.
4. **경계 위반/드리프트 다수:** web-core가 `alert()`+강제 리다이렉트(`handleAuthError`), 게스트 자동로그인 정책 훅, 죽은 export(`refreshActiveCloudSession`)를 품고 있고, web-core/app-runtime에 **동명 세션 훅 3쌍**이 공존하며 admin-v2가 소켓을 모르는 web-core판 로그아웃을 쓰고 있다. 문서·주석 드리프트(서명 authId, same-wss 전환, "expired→로그아웃" 오기)도 여러 곳.
5. **개선 방향은 §6:** 리프레시 발사권을 SDK로 단일화(‌lemon 자동 refresh 차단 + 명시적 `requestSessionRefresh`), 서명 재료를 스토어 라이브 조회 대신 **kind별 AuthMaterial 스냅샷 주입**으로, `expired`를 이벤트 계약으로 승격해 앱별 복구 정책을 명시.

---

## 1. 현재 리프레시 지형 (누가 언제 토큰을 갱신하는가)

| #   | 엔진                                                            | 트리거                                                                                                                             | 대상 저장소                                                                             | 직렬화/캡                                                               | 근거                                                |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | **SDK `AuthController`** (relay/cloud 슬롯당 1)                 | `expiresIn×0.8`, 없으면 **5분 fallback**; 재연결 시 `auth.update`; 실패 백오프                                                     | SDK 메모리 → `onTokenRefresh` writeback으로 relayCore(+lemon credential 캐시)/cloudCore | epoch 직렬화, **maxFailures 3 → `expired` 터미널**                      | `SocketManager.ts:36`, `auth-controller.js`         |
| 2   | **lemon-web-core 내부 자동 refresh**                            | `webTransport.init()` / `isAuthenticated()` / `getCredentials()` 호출 시 `expired_time` 경과면 각자 `POST /oauth/{authId}/refresh` | **lemon 자체 저장소(@project.\*)만** — relayCore·SDK 미전파                             | **없음** (single-flight 없음, 백오프 없음, 실패 시 null 반환·상태 유지) | lemon-web-core 번들 `AWSWebCore.refreshCachedToken` |
| 3   | **web-core 서비스** `refreshRelaySession`/`refreshCloudSession` | 로그인 플로우(OAuth 하이드레이션), 사이트 전환                                                                                     | relayCore/cloudCore + lemon credential 캐시 (이중 쓰기)                                 | 서비스 레벨 single-flight 있음                                          | `services.ts:199-237,394-519`                       |
| 4   | **admin-v2 `useRelaySessionGuard`**                             | 30초 인터벌 + visibilitychange(visible)                                                                                            | (엔진 2를 트리거)                                                                       | inFlight ref 1개                                                        | `apps/admin-v2/.../useRelaySessionGuard.ts`         |
| 5   | 부팅 `initializeRelaySession`                                   | 앱 시작 1회(+실패 3회 재시도)                                                                                                      | (엔진 2를 트리거 가능)                                                                  | 1회성                                                                   | `services.ts:109-127`, `useInitWebCore.ts`          |

- 과거의 60초 HTTP 주기 루프(`useTokenRefresh`)는 **삭제 완료**(재생성 금지, ADR-0028). 단 그 흔적 주석("periodic refresh loop", "periodic 60s happy path")이 `services.ts:43,49,205,507`에 남아 있다.
- `refreshActiveCloudSession`은 **호출자 없는 죽은 export**다(테스트만 사용, `services.ts:530`).
- 삭제된 `useTokenRefresh`의 주석이 중요한 사실을 기록하고 있다: _"A parallel HTTP refresh would race the socket refresh on the **shared device-keyed auth model** and 403"_ — **HTTP refresh와 소켓 refresh가 서버의 같은 auth 모델을 공유하며, 경쟁하면 403이 난다**는 것이 과거에 실측·문서화된 사실이다. 엔진 2가 살아있는 한 이 경쟁은 지금도 성립 가능하다.

### 토큰 사본 3벌 문제

relay 기준으로 토큰/서명 재료가 **세 곳**에 있다:

1. SDK `AuthController._token` (메모리, 소켓 인증용)
2. `relayCore`(`chatic-relay-token`) — 소켓 register/sign 재료(`$auth.id`, `Token.accountId/identityId`), 바인딩 identityToken
3. lemon-web-core 저장소(`@<project>.*`) — AWS SigV4 크레덴셜 + HTTP refresh 재료(`auth_id` 등)

동기화는 **단방향만 존재**한다: SDK refresh → `commitServerRefreshedToken` → 2+3 갱신(정상). 그러나 **엔진 2(lemon 자동 refresh)가 돌면 3만 갱신되고 2·SDK는 stale**이 된다. 이때 소켓의 다음 `auth.refresh` 서명은 옛 재료로 계산된다 → 서버 검증 실패(시그니처 오류) → SDK 백오프 → `expired`. 사용자가 지적한 "리프레시를 web-core 쪽에서 하면 꼬인다"의 구체적 메커니즘이 이것이다.

---

## 2. 증상 1 — 포그라운드 복귀 시 리프레시 폭주(시그니처 오류)

### 2-1. 확인된 사실 (클라이언트 코드)

- **SDK 백오프는 유한하다**: refresh/reauth 실패 시 `failures++`, 3회 초과면 `expired` + `active=false`로 정지(`auth-controller.js handleFailed`). 즉 SDK 단독으로는 "무한" 리트라이가 불가능.
- **재연결은 무한이다**: `AutoReconnectController` 기본 `maxAttempts=0`(포기 없음), 연결이 5초 이상 유지되면 attempt가 0으로 리셋(`minStableMs`) — 서버가 연결을 늦게 끊는 패턴이면 재연결 간격이 계속 최소(~0.5s)로 돌아온다. keep-alive는 30초 ping, pong 2회 유실 시 강제 close → 재연결.
- **우리 게이트가 SDK의 터미널 안전장치를 우회한다**: `bootstrapSocketConnection`은 `device.save:ok`마다 **무조건 `gate.start()`** 한다([bootstrapSocketConnection.ts:109-115](../../libs/app-runtime/src/socket/auth/bootstrapSocketConnection.ts)). `start()`는 `expired`로 내려간(active=false) 컨트롤러도 되살려 `auth.update`를 발사한다(failures는 리셋 안 됨 → 실패 시 즉시 재-`expired`). 재연결이 무한이므로, **연결당 1회 이상의 인증 시도가 무한히 반복**될 수 있다.
- **`failures` 리셋은 `register()`뿐이다**: `SocketBinder` 재부팅(rebootKey 변경/리마운트)이나 `reauthenticateActiveSocket`(binding 토큰 변경)이 일어나면 failures=0에서 refresh 사이클(서명 리트라이 ≤3회 포함)이 새로 시작된다. 토큰 저장소가 흔들리는 환경(멀티 창/웹뷰가 localStorage 공유, 엔진 2의 개입)에서는 이 리셋이 반복될 수 있다.
- **HTTP 쪽 리트라이 부스터**: `withRetry`는 `throwIfApiError`가 만든 status 없는 Error(서명 오류 문구 포함 가능)를 `UNKNOWN → shouldRetry=true`로 분류해 지수 백오프 재시도한다(`transport/error.ts:85-91`, `utils.ts:23-62`). 엔진 2는 아예 분류·캡 없이 호출자마다 재시도한다.
- **iOS WebView 특성**: 백그라운드에서 JS 타이머 정지 → 복귀 시 밀린 타이머 일괄 flush(`shared-timer-scheduler`는 단일 setTimeout 재무장 방식). 좀비 소켓 위에서 refresh 요청은 408 타임아웃(10s) → 백오프 재시도 → keep-alive가 소켓을 닫을 때까지(최대 ~40-80초) 소켓당 최대 4회 인증 시도. relay+cloud 두 슬롯이 각자 수행.

### 2-2. 필드 증거 (같은 증상의 선례)

- desktop-web [`useSocketWedgeReload.ts`](../../apps/desktop-web/src/app/shared/hooks/useSocketWedgeReload.ts): _"After a long sleep the cloud token refresh 400s and the socket sticks at isVerified=false … it loops forever"_ — 슬립 복귀 후 **cloud 토큰 refresh 400 무한 루프**가 실측됐고, 25초 grace 후 **렌더러 자동 리로드**(5분 가드)로 덮었다. 커밋 5eb37066도 "the underlying socket wedge (token refresh 400 loop)"라고 명시.
- 풀 리로드가 복구되는 이유가 주석에 기록돼 있다: _"a full page reload recovers because it re-bootstraps AWSCore credentials"_ — 즉 **저장소 간 불일치(§1 토큰 3벌)가 리로드로 재정렬되면 refresh가 다시 통과**한다. 루프의 원인이 자료 분기임을 뒷받침한다.

### 2-3. 메커니즘 판정 (가능성 순)

| 순위 | 메커니즘                                                                                                                                                                                                  | 무한성              | 시그니처 오류        | 상태                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------- | ----------------------------------------------------------------------------- |
| 1    | **재연결 무한루프 × 인증 실패**: 서버가 미인증/실패 소켓을 끊음 → 재연결 → `device.save`+`auth.update`(+failures 소진 전 서명 refresh ≤3회) → 실패 → 끊김 → 반복. `gate.start()`의 무조건 재활성화가 결합 | 무한                | 초기 사이클마다 발생 | **유력** — 서버 끊김 정책 확인 필요(§8)                                       |
| 2    | **이중 엔진 자료 분기**: 엔진 2(부팅/가드/`startWebCoreInit`)가 lemon 저장소만 회전 → 소켓 서명 재료 stale → 소켓 refresh 400/403 반복; 또는 SDK가 회전한 뒤 lemon 재시도가 옛 재료로 반복 실패           | 트리거 반복 시 무한 | **직접 원인**        | **유력** — "shared device-keyed auth model → 403"은 과거 실측 주석으로 확인됨 |
| 3    | **register 리셋 반복**: 멀티 인스턴스(멀티 창/웹뷰 localStorage 공유)나 반복적 토큰 커밋이 `reauthenticateActiveSocket`의 `logout→register`를 반복 유발(상호 세션 revoke 포함)                            | 조건부 무한         | 가능                 | 가설 — 인스턴스 수 확인 필요                                                  |
| 4    | **wake 직후 좀비 소켓 버스트**: 밀린 refresh 타이머 flush + 408 백오프. 소켓당 ≤4회로 유한하나 relay+cloud 동시, HTTP 403 폭주와 겹치면 "폭주"로 관측됨                                                   | 유한(버스트)        | 403/408              | 확정(항상 발생하는 배경 소음)                                                 |

> 판정: "무수히 많은"은 1(또는 3)의 무한 루프가 2의 시그니처 오류와 결합된 상태로 보는 것이 코드·필드 증거와 가장 정합적이다. §8의 계측 로그로 1↔2↔3을 분리 확인한 뒤 §7 Phase 1 방어(서킷브레이커)를 먼저 넣는 순서를 권장.

---

## 3. 증상 2 — 장시간 방치 시 세션 만료 (앱별 현재 동작)

공통 전제: AWS 크레덴셜 수명 ~1h(lemon `expired_time` = Expiration−5min), 소켓 auth 응답에 `expiresIn` 부재 → SDK는 5분 fallback 주기로 refresh(`SocketManager.ts:24-35`). **소켓이 살아있는 동안은** writeback이 HTTP 크레덴셜까지 계속 신선하게 유지한다(설계 의도). 문제는 소켓이 죽어있는 동안이다.

| 앱                            | HTTP 크레덴셜 유지                                                                                    | 소켓 만료 복구                                                                                                                                                                                                                                                                    | 방치 시 실제 결말                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **apps/web** (모바일 WebView) | **소켓 writeback뿐** — 가드 없음                                                                      | 재연결 재인증(서명 refresh)이 유일 경로. 실패 3회 → relay `expired` 터미널 = **복구 없음**(정책: warn-only, [sessionDelegate.ts:27-38](../../libs/app-runtime/src/socket/auth/sessionDelegate.ts)). 포그라운드 소켓 kick 없음(복구 개시가 keep-alive 사멸 감지까지 ~40-80초 지연) | 성공 경로면 복귀 수십 초 내 자동 복구. 실패 경로면 **좀비 세션**: `isAuthenticated`는 true(플래그는 만료에 안 뒤집힘), 소켓 dead, HTTP 403 — 리로드/재로그인 전까지 지속. cloud 슬롯은 `expired` 시 `logoutCloudSession()`으로 **조용히 클라우드 이탈** |
| **admin-v2**                  | `useRelaySessionGuard`(30s+visible)가 엔진 2로 보수 — HTTP는 살아있음                                 | 소켓(RuntimeAuthHost)은 apps/web과 동일하게 터미널 후 복구 없음. **가드의 lemon refresh가 소켓 재료를 갱신하지 않으므로(§1) 오히려 소켓 서명 오염 가능**                                                                                                                          | HTTP 콘솔 기능은 유지되나 소켓 의존 기능은 죽은 채 지속. 가드가 refresh 실패를 감지하면 `logoutRelaySession()` — 단 **일시 네트워크 오류도 false로 수렴해 즉시 로그아웃**하는 과격함 있음(엔진 2가 모든 예외를 null로 삼킴)                             |
| **desktop-web** (참조만)      | RuntimeConnectionHost + wake-kick(`useSocketWakeRecovery`: 포그라운드 시 좀비 소켓 강제 close→재연결) | 실패 시 `useSocketWedgeReload`가 25초 후 **자동 리로드**(대증요법)                                                                                                                                                                                                                | 사용자 체감 복구는 되나 리로드 기반 — 근본 원인(자료 분기) 미해결                                                                                                                                                                                       |
| **apps/admin (레거시)**       | 리프레시 전무. 존재하지 않는 export(`useWebCoreStore`)를 import — 사실상 미유지 코드                  | 없음                                                                                                                                                                                                                                                                              | 방치 = 만료. 정리 대상(§5-8)                                                                                                                                                                                                                            |

**결론: "자동 리프레시가 잘 이루어지는가?"** — 소켓이 건강한 동안은 예(SDK 5분 주기 + writeback). 그러나 (a) 소켓 터미널 만료의 무복구 정책, (b) 만료돼도 안 뒤집히는 `isAuthenticated`, (c) apps/web의 wake-kick 부재, (d) 가드/부팅의 엔진 2가 소켓 재료를 오염시킬 수 있는 구조 때문에 **장기 방치 후의 복구는 보장되지 않는다**. 이는 버그 하나가 아니라 정책 공백이다(§6-3에서 계약화 제안).

---

## 4. ClientSocketAuth ↔ web-core 토큰 주입 구조 평가

### 현재 구조

- SDK sign 콜백은 stateless: `sign(token, ctx)` — SDK가 자기 토큰을 주입하지만 lemon hmac은 토큰 문자열에 의존하지 않아 **무시**되고, `signServerAuth(kind)`가 **호출 시점에 web-core 스토어를 재조회**해 `$auth.id`/`accountId`/`identityId`로 서명한다(`services.ts:583-612`).
- register 시드(`getServerAuthRegistration`)도 스토어 라이브 조회(`services.ts:562-576`).
- writeback(`commitServerRefreshedToken`)은 kind 라우팅 + relay 이중 쓰기(크레덴셜 캐시+스토어)로 잘 설계돼 있다(`services.ts:623-646`).

### 문제

스토어 라이브 조회 = **스토어가 제2의 SSoT**라는 뜻이다. 스토어를 SDK 외의 누군가(엔진 2, 다른 인스턴스, 수동 플로우)가 건드리는 순간 SDK가 보유한 인증 세션과 서명 재료가 분기한다. 시그니처 오류의 구조적 원인.

### 제안 — "주입식" 재료 공급 (SDK 변경 없이 가능)

1. **kind별 `AuthMaterial` 스냅샷**을 app-runtime(delegate 계층)이 소유한다: `{ authId, accountId, identityId, identityToken }`.
    - 갱신 주체는 딱 둘: ① 부팅/재인증 시 `getAuthRegistration`이 시드, ② `onTokenRefresh` writeback.
    - `signAuth(kind)`는 스토어 대신 **이 스냅샷으로 서명**한다. web-core는 `calcSignature`(이미 순수, `awsSigning.ts:25-32`)와 `deriveAuthMaterial(view)` 같은 순수 헬퍼만 제공.
    - 효과: 서명 재료의 수명이 SDK 인증 세션과 함께 움직인다 — "SDK가 주입한 것만으로 서명"과 등가. 스토어는 읽기 모델로 강등.
2. **리프레시 발사권 단일화**: 엔진 2의 자동 refresh를 차단한다.
    - `initializeRelaySession`의 `webTransport.isAuthenticated()`를 "읽기 전용 판정"(hasCachedToken + shouldRefreshToken 조회)으로 교체하고, 만료 상태면 refresh를 **하지 않고** 소켓 부팅에 맡긴다(소켓 재인증이 성공하면 writeback이 크레덴셜을 재발급).
    - HTTP-만-필요한 소비자(admin 가드 등)를 위해 app-runtime에 `requestSessionRefresh(kind)`를 신설: 소켓이 있으면 SDK 경유(아래 옵션), 없으면 예외적으로 서비스 refresh(엔진 3, single-flight 유지) 1회.
    - SDK에 "지금 refresh" 공개 API가 없으므로 옵션: (a) SDK에 `refreshNow()` 추가(권장, SDK 레포 작업), (b) 임시로 `register()` 재시드(=failures 리셋+`auth.update` 재발사), (c) desktop-web wake-kick 패턴(강제 close→재연결 재인증)의 일반화. 단기에는 (c)가 무변경으로 가장 안전.
3. **장기(SDK 레포)**: sign 콜백 시그니처에 SDK가 보유한 컨텍스트(등록 시 받은 authId 등)를 함께 주입하도록 확장하면 콜백이 완전 순수해진다. + `refreshNow()`/`onTerminal` 공개.

---

## 5. 결함·리스크 목록 (심각도순)

| #   | 심각도   | 내용                                                                                                                                                                                                                                                                            | 위치                                                                                                                                                                                |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **높음** | `gate.start()`가 `expired` 터미널을 무시하고 컨트롤러 재활성화 → 무한 재연결과 결합 시 인증 요청 무한 반복(§2). 터미널 후에는 start를 억제하거나 재연결 자체를 중단해야 함                                                                                                      | [bootstrapSocketConnection.ts:109-115](../../libs/app-runtime/src/socket/auth/bootstrapSocketConnection.ts)                                                                         |
| 2   | **높음** | lemon-web-core 자동 refresh(엔진 2)가 relayCore/SDK에 역전파 없음 → 소켓 서명 재료 오염(시그니처 오류의 구조적 원인). 트리거: 부팅 `isAuthenticated()`, admin-v2 가드, `startWebCoreInit` 재실행 경로                                                                           | `services.ts:120`, `useRelaySessionGuard.ts:35`, lemon 번들                                                                                                                         |
| 3   | **높음** | relay `expired` 터미널 = 무복구 + `isAuthenticated` 플래그 불변 → 좀비 세션(UI는 로그인 상태, 소켓/HTTP 죽음). apps/web에 wake-kick·가드 없음                                                                                                                                   | [sessionDelegate.ts:27-38](../../libs/app-runtime/src/socket/auth/sessionDelegate.ts), 정책 공백                                                                                    |
| 4   | 중간     | admin-v2 가드: 엔진 2가 모든 예외를 null로 삼켜 **일시 장애도 즉시 `logoutRelaySession()`** (온라인 판정은 navigator.onLine뿐)                                                                                                                                                  | `useRelaySessionGuard.ts:36-40`                                                                                                                                                     |
| 5   | 중간     | `handleAuthError`: 코어 라이브러리가 `alert()` + `window.location.href='/auth/logout'` 강제 — UI/네비게이션 정책이 core에 하드코딩, 403 1회에 즉시 발동                                                                                                                         | [error.ts:153-165](../../libs/web-core/src/transport/error.ts)                                                                                                                      |
| 6   | 중간     | `withRetry` 분류: status 없는 서명 오류 계열이 UNKNOWN→재시도됨(폭주 부스터). `signature`/`invalid` 문구 계열의 AUTH 분류 보강 필요                                                                                                                                             | [error.ts:85-91](../../libs/web-core/src/transport/error.ts)                                                                                                                        |
| 7   | 중간     | same-wss cloud 전환 재인증 경로 사망: `useRuntimeBinding` cloudSlot에 `identityToken` 미탑재(a535055a에서 "cloud 전환=wss 변경" 가정으로 의도 제거)인데 `SocketReauthBinder`/주석은 여전히 커버를 주장. 가정이 깨지는 배포(두 클라우드가 wss 공유)면 이전 클라우드 신원 잔존    | [useRuntimeBinding.ts:37-40](../../libs/app-runtime/src/runtime/useRuntimeBinding.ts), [SocketReauthBinder.tsx:33-41](../../libs/app-runtime/src/connection/SocketReauthBinder.tsx) |
| 8   | 중간     | 동명 세션 훅 3쌍(web-core vs app-runtime: `useSessionLogout`/`useLogoutCloudSession`/`useSiteSwitch`). admin-v2 LogoutPage·socket-lab Sidebar가 **web-core판**(소켓 `auth.logout` 미통지) 사용 — RuntimeAuthHost로 소켓 세션이 생겼는데 로그아웃이 소켓을 모름 → 서버 세션 잔존 | `apps/admin-v2/.../LogoutPage.tsx:4`, `socket-lab/.../Sidebar.tsx:4`                                                                                                                |
| 9   | 낮음     | 죽은 코드/스테일: `refreshActiveCloudSession`(호출자 없음), "periodic refresh loop"/"60s" 주석들, apps/web 주석 2곳이 "expired→로그아웃/redirect·request 401 self-heal"을 주장(실제는 warn-only·self-heal 제거됨)                                                               | `services.ts:530,43,49,205,507`, `useBackgroundSync.ts:155-166`, `useForegroundChatRefresh.ts:52-57`                                                                                |
| 10  | 낮음     | 문서 드리프트: signing.md 표는 cloud authId=`$auth.id`라 하나 코드는 `Token.authId`(a535055a에서 변경)                                                                                                                                                                          | [signing.md §1](../../libs/app-runtime/docs/socket/auth/signing.md), `services.ts:567,589`                                                                                          |
| 11  | 낮음     | 레거시 잔재: `apps/admin`·`libs/socket`이 존재하지 않는 web-core export(`useWebCoreStore`, `webCore`) 참조 — 빌드 대상 여부 확인 후 처분 결정 필요                                                                                                                              | `apps/admin/src/app/routes/guards/AuthGuard.tsx:3`, `libs/socket/src/hooks/useInitWebSocket.ts:5`                                                                                   |
| 12  | 낮음     | `useRelaySessionKeepAlive`(게스트 자동로그인 정책)가 web-core에 위치 — 런타임 오케스트레이션 성격, app-runtime 이동 후보                                                                                                                                                        | [useRelaySessionKeepAlive.ts](../../libs/web-core/src/hooks/app/useRelaySessionKeepAlive.ts)                                                                                        |

---

## 6. 목표 아키텍처 (리팩터링 방향)

```
[SDK AuthController(kind별)] ← 리프레시 발사권 유일 소유 (만료·재연결·백오프·switch/logout)
        │ onTokenRefresh (유일한 토큰 유입)
        ▼
[app-runtime delegate]
  ├─ AuthMaterial 스냅샷(kind별) ← register 시드 + writeback만 갱신, sign은 여기서만 읽음
  ├─ commitServerRefreshedToken → web-core 스토어(읽기 모델) + lemon 크레덴셜 캐시
  ├─ requestSessionRefresh(kind)  ← HTTP 소비자가 "갱신 필요"를 알리는 유일 창구
  └─ onAuthTerminal(kind) 이벤트 ← 앱 정책 주입 지점 (web: 리부트스트랩 1회→로그인 유도 / admin: 로그인 화면)
        ▼
[web-core] 순수 계산(calcSignature·deriveAuthMaterial) + 스토어 + 로그인/전환 서비스(엔진 3, 명시 플로우 한정)
[lemon-web-core] 서명/전송만 사용 — 자동 refresh 경로 봉인(읽기 전용 만료 판정으로 대체)
```

핵심 계약 4가지:

1. **발사권 단일화** — 자동 refresh는 SDK만. 엔진 2 봉인, 엔진 3은 사용자 플로우(로그인/전환)에서만.
2. **재료 주입** — 서명·시드는 AuthMaterial 스냅샷에서. 스토어 라이브 조회 금지(부팅 시드 제외).
3. **터미널 계약화** — `expired`는 이벤트로 앱에 전달, 정책(복구 시도 횟수·로그아웃·UI)은 앱이 소유. `isAuthenticated`와 별개로 `sessionHealth`(healthy/degraded/expired) 파생 상태 노출.
4. **루프 서킷브레이커는 인증 레이어에만 건다** — `gate.start()`가 터미널 컨트롤러를 되살리는 것을 스로틀하고, 회복은 명시적 재시드(`register`)로만. **재연결은 무한을 유지한다**: 네트워크 단절은 모바일에서 예외가 아니라 정상 상태이므로(지하철·엘리베이터·슬립) 몇 시간 뒤 복귀해도 자동으로 붙어야 하고, `maxAttempts` 캡은 SDK `giveUp()`이 `active=false`로 내려앉아 **스스로 재개하지 못하게** 만들어 복구 책임을 앱(수동 리로드/wake-kick)으로 떠넘길 뿐이다. 비용도 백오프(0.5s→30s 상한 + 지터)가 이미 통제한다. 폭주의 원인은 재연결 자체가 아니라 `재연결 무한 × 연결마다 무조건 인증 재개`의 **결합**이므로, 절단면은 인증 쪽이 맞다. transport churn이 문제로 확인되면(§8) 캡이 아니라 **auth 터미널 동안 재연결 백오프의 하한을 올리는 방향**(`minStableMs` 상향 등 — 연결 복구 능력은 보존)으로 다룬다.

---

## 7. 리팩터링 로드맵 (준비)

> **처리 현황 (2026-08-12): Phase 0·1 구현 완료.** 이 브랜치에서 반영된 것:
>
> - **Phase 0 계측**: 슬롯별 재연결 카운터 로그(`SocketManager` `[SocketManager] reconnected {kind, connectCount}`), 만료-재개 시도 warn 로그(`bootstrapSocketConnection`). 폭주 재발 시 이 두 로그로 §2-3의 메커니즘 1(재연결 루프)을 즉시 판별할 수 있다.
> - **결함 1 — 설계 변경으로 처리**: 하드 no-op 대신 **지수 쿨다운(30s→최대 5분, `authenticated` 시 리셋)** 으로 만료-재개를 스로틀. 이유: `expired`는 일시 장애(웨이크 직후 좀비 소켓의 408 연쇄)로도 도달하는데, 무조건 차단하면 그 케이스의 자동 복구(다음 재연결에서 auth.update 성공)까지 죽는다. 쿨다운은 폭주를 시간당 소켓별 ~12회로 캡하면서 자동 복구를 보존한다. **재연결은 의도적으로 손대지 않았다**(§6-4): 무한 재연결은 모바일에서 필수 기능이고 `maxAttempts` 캡은 복구 불능 상태를 만든다 — 폭주는 재연결이 아니라 그 위에 얹힌 무조건 인증 재개가 만들었고, 그 지점만 끊었다. transport churn이 §8에서 실제 문제로 확인되면 백오프 하한 상향으로 다룬다.
> - **신규 발견(수정 포함)**: `reauthenticateActiveSocket`이 **연결 안 된 소켓**에 register하면 컨트롤러가 active로 남아 다음 `connected`에서 SDK가 `device.save:ok` **이전에** `auth.update`를 자동 발사 → 최초 update 실패는 재시도되지 않아 터미널 `expired`로 직행하는 선재 레이스. register 후 미연결이면 게이트를 재폐쇄하도록 수정.
> - **결함 3 부분 처리**: apps/web에 포그라운드 wake-kick 추가 — app-runtime `recoverUnverifiedSockets()`(미검증 슬롯 강제 재연결 + 터미널 `expired`면 register 재시드로 failures 리셋, 시드는 게이트 닫은 채 수행해 device.save:ok 순서 보존) + apps/web `useSocketWakeRecovery`(5s 스로틀, `useAppForeground` 신호). 좀비 소켓 복구가 keep-alive 대기(~40-80s)에서 즉시로 단축되고, **relay 터미널 만료의 실복구 경로가 처음 생겼다**. `sessionHealth` 파생 상태·터미널 이벤트 계약은 Phase 2 잔여.
> - **결함 4**: admin-v2 가드에 연속 실패 임계(3회, ~90s) 도입 — 일시 장애 즉시 로그아웃 제거.
> - **결함 6**: status 없는 서명 오류(`invalid signature`/`mismatch`/`not valid`/`no auth model`)를 AUTHENTICATION·재시도 금지·로그아웃 없음으로 분류(403·`signature timeout`의 기존 로그아웃 정책은 유지).
> - **결함 8 부분 처리**: admin-v2 `LogoutPage`·socket-lab `Sidebar`를 app-runtime판 `useSessionLogout`(소켓 `auth.logout` 통지 포함)으로 교체. desktop-web 마이그레이션·web-core판 deprecate는 Phase 3 잔여.
> - **결함 9·10 문서 정정**: apps/web 스테일 주석 2곳(expired→로그아웃 오기, request 401 self-heal 오기), services.ts의 사라진 "주기 루프" 주석 3곳 + `refreshActiveCloudSession` DEAD EXPORT 표기, signing.md cloud authId(`Token.authId`) 정정, SocketReauthBinder/useRuntimeBinding의 same-wss 모순 주석 현실화(§5-7 결정은 Phase 3).
> - 검증: app-runtime 201 · web-core 101 · apps/web 1665 · admin-v2 81 테스트 전부 통과, 4개 프로젝트 타입체크 통과(웹 앱 자체 구성; web-ui-kit의 워크트리 환경성 실패는 본 변경과 무관한 선재 부채).
>
> 잔여는 Phase 2(SSoT: AuthMaterial 스냅샷·엔진 2 봉인·`requestSessionRefresh`·터미널 이벤트 계약)와 Phase 3(경계 정리) — 아래 원문 유지.
>
> **처리 현황 2차 (2026-08-12): Phase 2-2·2-3 구현 완료.**
>
> - **엔진 2 봉인(Phase 2-2, 결함 2 해소)**: `startWebTransportInit`이 lemon `init()` 대신 sealed init(initLemonConfig + `buildCredentialsByStorage`, refresh 없음)을 수행. `initializeRelaySession`은 `webTransport.isAuthenticated()`(내부 refresh 발사) 대신 읽기 전용 프로브 `hasStoredRelaySession()`으로 auth 플래그를 세운다 — 플래그 의미가 "세션 존재"로 확정되어, 크레덴셜만 만료된 복귀 유저·오프라인 부팅이 로그인 상태로 부팅된다(구버전은 refresh 실패 → 미인증 취급 → apps/web에선 게스트 keep-alive가 기존 세션을 덮을 수 있었음). 클라우드 복구 경로(`runRefreshCloudSession` catch)의 `resetWebCoreInit/startWebCoreInit` 재부트스트랩은 명시적 `refreshRelaySession()`(일관 이중 쓰기)으로 대체. 이로써 **lemon 자동 refresh를 발사하는 프로덕션 경로가 0개**가 됐다(desktop-web 포함 — 전 앱이 sealed 부팅 공유).
> - **`requestSessionRefresh(kind)` 신설(Phase 2-3)**: "크레덴셜이 stale하다 → 신선하게"의 유일 창구(app-runtime). 1순위 소켓 경로 — connected+authenticated 컨트롤러의 `runRefresh`(SDK impl 메서드, start/stop과 같은 인터페이스 확장 캐스트 — SDK에 `refreshNow()` 공개되면 교체)를 강제 발사하고 `onTokenRefresh` writeback으로 성공 판정(10s 타임아웃). 2순위 HTTP 폴백 — 서비스 refresh(single-flight, 이중 쓰기; 소켓이 핸드셰이크 중이어도 SocketReauthBinder의 토큰 변경 재인증으로 수렴). 부수 효과: 재연결 직후 `auth.update` 성공은 `onTokenRefresh`를 방출하지 않아 최대 5분(다음 예약 refresh까지) 크레덴셜이 stale한 갭이 있는데, 이 창구가 그 갭도 즉시 메운다.
> - **admin-v2 가드 전환**: `isAuthenticated()` 호출 제거 → `hasStoredRelaySession`/`isStoredSessionExpired` 읽기 전용 프로브 + stale일 때만 `requestSessionRefresh('relay')` 위임(신선하면 스토리지 읽기 몇 번이 전부 — 기존 저비용 상시 감시 유지). 연속 3회 실패 임계는 유지.
> - `refreshActiveCloudSession`은 삭제 예정에서 **`requestSessionRefresh('cloud')`의 HTTP 폴백**으로 역할 변경(아래 Phase 3 목록의 "삭제" 항목은 이 결정으로 대체) — 폴링 호출자 금지 주석 유지.
> - 검증: app-runtime 209 · web-core 103 · apps/web 1665 · admin-v2 83 테스트 전부 통과, 타입체크 3종(app-runtime+의존/admin-v2/web) 통과.
>
> **Phase 2 잔여**: 2-1(AuthMaterial 스냅샷 주입), 2-4(터미널 이벤트 계약 + `sessionHealth` — 결함 3·5의 본체), 2-5(services.ts 분할).

### Phase 0 — 계측 (코드 변경 최소, 즉시)

- refresh 발사 지점 전부에 구조화 로그 태그: `{engine: sdk|lemon|service, kind, trigger, failures}` — SDK는 `onAuthState`/`onTokenRefresh` 구독부에서, 엔진 2는 wrapper에서.
- 재연결 사이클 카운터(연결당 auth 시도 수, 사이클 주기) — `SocketManager.bindEntry`의 onState에서.
- 목적: §2-3 표의 1/2/3 중 실제 발생 메커니즘 확정. §8 재현 시나리오와 병행.

### Phase 1 — 출혈 차단 (소규모 패치 묶음)

| 변경                                                                                                                 | 파일                                                                               | 효과                         |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| `expired` 터미널 컨트롤러의 재개를 스로틀(재연결은 무한 유지 — §6-4)                                                 | `bootstrapSocketConnection.ts`, `SocketManager.ts`                                 | 결함 1 — 무한 인증 루프 차단 |
| 서명 오류 계열 재시도 금지 분류 추가                                                                                 | `transport/error.ts`                                                               | 결함 6                       |
| admin-v2 가드: 연속 실패 임계(N회) 후에만 로그아웃, transient는 유지                                                 | `useRelaySessionGuard.ts`                                                          | 결함 4                       |
| admin-v2 로그아웃을 app-runtime판으로 교체                                                                           | `LogoutPage.tsx`, `socket-lab/Sidebar.tsx`                                         | 결함 8                       |
| apps/web에 wake-kick 추가(포그라운드 시 미검증 소켓 강제 close→재연결; desktop-web 패턴 일반화해 app-runtime 훅으로) | 신규 `app-runtime/connection/useSocketWakeRecovery.ts`                             | 증상 2 복구 지연 해소        |
| 스테일 주석/문서 정정(§5-9,10)                                                                                       | `useBackgroundSync.ts`, `useForegroundChatRefresh.ts`, `signing.md`, `services.ts` | 오판 방지                    |

### Phase 2 — SSoT 정리 (구조 변경)

1. **AuthMaterial 스냅샷 도입**: `sessionDelegate`가 kind별 스냅샷 보유, `signServerAuth`/`getServerAuthRegistration`을 스냅샷 인자를 받는 순수 함수로 개편(web-core), 스토어 조회는 부팅 시드 1곳으로 축소.
2. **엔진 2 봉인**: `initializeRelaySession`에서 `isAuthenticated()` 대신 읽기 전용 만료 판정(신규 `webTransport` wrapper) — 만료여도 refresh 발사 금지, 소켓 재인증에 위임. admin-v2 가드는 `requestSessionRefresh('relay')`로 전환.
3. **`requestSessionRefresh(kind)` 신설**(app-runtime): 소켓 living → wake-kick(단기) 또는 SDK `refreshNow()`(SDK 레포 후속) / 소켓 없음 → 서비스 refresh 1회(single-flight).
4. **터미널 이벤트 계약**: `onAuthExpired`를 delegate 콜백에서 앱 구독 이벤트로 승격, `sessionHealth` 파생 상태 추가(readers). desktop-web 리로드 훅은 이 이벤트 기반으로 단순화 가능(별도 트랙).
5. web-core `session/services.ts`(647줄) 분할: 로그인/전환 서비스 vs SDK 브리지(`serverAuthBridge.ts`) — export 표면은 유지.

### Phase 3 — 경계 정리 (정돈)

- `useRelaySessionKeepAlive` → app-runtime 이동(결함 12). (~~`refreshActiveCloudSession` 삭제~~ — Phase 2-3에서 `requestSessionRefresh('cloud')`의 HTTP 폴백으로 역할 변경되어 존치.)
- 동명 훅 정리: web-core 액션 3종 deprecate → desktop-web/admin 마이그레이션 후 제거(결함 8 잔여).
- same-wss cloud 전환 지원 여부 결정: 지원 안 하면 `SocketReauthBinder`의 cloud 감시·주석 제거, 지원하면 cloudSlot에 identityToken 복원(결함 7).
- 레거시 처분: `apps/admin`·`libs/socket` 빌드 대상 확인 후 삭제 or 격리(결함 11).
- 문서 동기화: 이 감사 문서 반영해 `socket/auth/README.md`·`signing.md`·`session-scenarios.md` 갱신.

### 검증 계획

- 단위: `services.test.ts`(writeback/서명 재료 스냅샷화 반영), `bootstrapSocketConnection` 게이트 테스트(터미널 후 start 억제), 재연결×인증 실패 시뮬(가짜 client로 사이클 카운트 상한 검증).
- 통합 재현: 가짜 스토리지로 만료 세션 심기(admin-v2 재현법 — 저장된 토큰의 `expired_time`/`$auth` 조작) → 가드/부팅/소켓 각 경로의 요청 횟수 계측. iOS 시뮬레이터 background→foreground에서 refresh 요청 수 상한 확인.
- 릴리즈 게이트: Phase 1 후 프로덕션 로그에서 `engine=lemon` refresh 발생률과 재연결 사이클 카운터가 기준치 이하인지 확인 후 Phase 2 진행.

---

## 8. 부록 — 확인용 체크리스트

**서버 로그에서 확인할 것** (메커니즘 1↔2 분리):

- [ ] 폭주 시점의 요청 종류 비율: socket `auth.refresh` vs HTTP `POST /oauth/{authId}/refresh` vs `auth.update` — HTTP가 섞여 있으면 엔진 2 개입 확정.
- [ ] 같은 deviceId의 WS 연결 수립/종료 주기 — 수 초 간격 반복이면 재연결 루프(메커니즘 1) 확정.
- [ ] 서버가 인증 실패/미인증 소켓을 능동적으로 끊는지(끊는다면 몇 초 후인지). **5초 이상이면 최악 케이스**: `minStableMs=5000` 때문에 백오프 카운터가 매번 0으로 리셋돼 재연결이 계속 최소 간격(~0.5s)으로 돌아온다. 인증은 쿨다운에 막혀 있으므로 리프레시 폭주는 아니지만 배터리·서버 부하로 남는다 → 이 경우의 처방은 `maxAttempts` 캡이 아니라 백오프 하한 상향(§6-4).
- [ ] refresh 시 서버가 auth 모델/서명 재료를 회전시키는지(HTTP와 socket refresh가 서로를 무효화하는지) — 과거 주석("shared device-keyed auth model → 403")의 현재 유효성 재확인.

**클라이언트에서 확인할 것**:

- [ ] 폭주 재현 시 `[delegate] relay auth expired` warn 로그 유무(터미널 도달 여부) 및 그 이후에도 요청이 계속되는지(= gate.start() 우회 확정).
- [ ] 모바일 앱에서 WebView 인스턴스가 동시에 2개 이상 뜨는 순간이 있는지(메커니즘 3).
- [ ] admin-v2에서 가드 refresh 성공 직후 소켓 refresh가 실패로 전환되는지(엔진 2 오염 관측).
