# 멀티소켓 세션 + client.auth 전면 위임 — 총합 설계 (다음 스텝)

Date: 2026-07-02
Status: 설계 검토중 · 구현 대기

> 이전 스텝([implementation.md](./implementation.md): SDK `AuthController` **단일 소켓** 채택 —
> register/refresh/state 위임)을 **기반(Phase 0)** 으로, 다음 스텝을 설계한다:
> (1) relay/cloud **듀얼 소켓** 동시 운영, (2) 로그인 `register` · 사이트전환 `switch` · 로그아웃
> `logout` 을 **client.auth로 전면 위임**, (3) **HTTP 만료 갭 완화**.
>
> - implementation.md의 단일 소켓 **배선 불변식(§3)** 은 그대로 유효하며 여기서 계승·확장한다.
> - 계약 배경: [README.md](./README.md)(소유·상태머신) · [usage.md](./usage.md)(사용) · [signing.md](./signing.md)(서명/writeback).
> - **충돌 시 우선순위**: 이 문서(다음 스텝 총합) > implementation.md(이전 스텝) > README/usage/signing(도입 가이드).

---

## 0. 이전 스텝 vs 이번 스텝

|                  | Phase 0 — 이전 스텝 (implementation.md)    | Phase 1·2 — 이번 스텝 (이 문서)                            |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------- |
| 소켓             | **단일** (activeServer 종류 바뀌면 재생성) | **듀얼** (relay 상시 + cloud 활성시)                       |
| register         | SocketBinder config-diff **부수효과**      | **로그인 흐름에서 명시 호출**                              |
| 토큰 refresh     | SDK 소유 + writeback (완료)                | 유지 + **per-socket 라우팅**                               |
| 사이트 전환      | web-core HTTP 재발급                       | **`auth.switch`**                                          |
| 로그아웃         | web-core 저장소 정리만                     | **`auth.logout`** + 정리 콜백                              |
| HTTP 토큰 신선도 | writeback 의존                             | **소켓 상시 연결 가정 → 항상 fresh** (별도 갭 완화 불필요) |
| web-core 헬퍼    | active-server-aware (활성 1개)             | **per-server(kind) 분기**                                  |

이번 스텝은 Phase 0가 확정한 "SDK가 소켓 인증 SSoT, web-core는 writeback read-model" 원칙을
**소켓 종류별(relay/cloud)로 복제**하고, 아직 web-core HTTP에 남아 있던 switch/logout/login을 SDK로
옮기는 작업이다.

---

## 1. 요구사항 (개정)

**[전제]**

1. 모든 기능은 `ClientSocketAuth`(SDK AuthController)에게 위임한다.
2. web-core에서 토큰 리프레시 관리를 하지 않고 client.auth에게 위임한다.
3. **desktop-web 및 admin 코드는 변경하지 않는다.**
4. 변경 과정에서 불필요해진 코드는 제거한다.

**[멀티소켓 세션 관리]**

1. 소켓 세션을 두 개 띄운다 (중계서버(relay) 소켓 / 클라우드(cloud) 소켓).
2. 클라우드 소켓은 클라우드 활성화 시에만 띄워진다.
3. 클라우드 세션을 로그아웃하면 중계서버 세션만 유지된다.
4. 중계서버 소켓을 로그아웃하면 모든 세션이 종료되고 저장소를 클리어한다 (그 사이 게스트 로그인 및 `auth.register` 자동 수행).
5. 클라우드 소켓은 1개만 띄운다. 클라우드 전환 시 소켓 세션은 `auth.logout → auth.register` 과정을 거친다.

**[동작별]**

1. 로그인 시(게스트/소셜/클라우드접속 모든 케이스) `auth.register`(`AuthRegisterOptions`) 후 `ready()`. 서명은 web-core 제공, 생성 토큰은 web-core에 업데이트.
2. 사이트 전환 시 `auth.switch` 사용 (결과 저장).
3. 로그아웃 시 `auth.logout` 사용 (web-core 정리 동반).
4. `auth.onTokenRefresh` 리스너 → web-core 반영 (HTTP용).
5. `auth.onAuthState` 로 상태 추적.

---

## 2. 확정 설계 결정

### 2-0. 왜 멀티소켓인가 (동기) + 설계 가정

**동기 (핵심)**: cloud 접속 중에도 **relay backend HTTP API를 호출하는 케이스가 있다.** 그런데 이번 스텝에서
토큰 갱신을 `ClientSocketAuth`가 **소켓별로** 소유한다(전제-2). 따라서:

- cloud 소켓만 떠 있으면 cloud 토큰만 갱신됨 → **relay 토큰이 stale** → relay HTTP 실패.
- relay 소켓도 **동시에** 떠 있어야 relay 토큰이 유지되어 relay HTTP가 가능하고, cloud 소켓이 cloud 토큰을 유지해 cloud HTTP가 가능하다.

⇒ **두 소켓 동시 운영 = 두 서버의 토큰을 각자의 `ClientSocketAuth`가 살려두기 위함.** 옛 모델은 web-core
`useTokenRefresh`가 relay+cloud HTTP refresh를 동시에 돌려 불필요했으나, **refresh를 소켓에 위임한 순간 소켓도
서버 수만큼 필요**해졌다. 이 동기가 "relay = auth-only 상시 소켓"(§5-5)을 정당화한다 — cloud 활성 중 relay
소켓의 임무는 sync가 아니라 **relay 토큰을 살려 relay HTTP를 가능하게 하는 것.**

**설계 가정**:

- **소켓은 항상 연결됨** — 단절 중 만료 갭은 가정상 없음. `onTokenRefresh` writeback이 항상 최신이라 web-core store(HTTP용)도 항상 fresh. → 별도 만료 갭 완화 장치 불필요.
- **admin / desktop-web은 고려 대상 아님** — 이 설계는 apps/web만 대상. 두 앱을 위한 web-core 표면 보존 제약(옛 전제-3) 없음 → 불필요 코드는 자유롭게 제거·시그니처 변경 가능.

### 2-1. web-core ↔ SDK 소유 규칙 (명세)

**근본 전제: SDK `ClientSocketAuth`는 소켓(WebSocket) 전용이다.** HTTP/REST 호출·토큰 발급(login)·AWS
서명·프로필/identity 파생은 SDK가 **못 한다.** 따라서 web-core는 없앨 수 없고, 아래처럼 역할이 **좁혀지고
명확해진다** — "세션 관리자"에서 "HTTP 레이어 + 토큰 발급·저장소·서명 제공자 + 전역 상태"로.

**A. SDK가 소유 — 소켓 세션 엔진 (소켓별로 1벌씩)**

| 항목                                          | 비고                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| 소켓별 **현재 토큰 SSoT**                     | register된 토큰 보관                                   |
| 인증·재인증·만료 **타이밍**                   | `expiresIn × refreshRatio` 선제 refresh, 재연결 재인증 |
| 백오프 · in-flight 직렬화(epoch)              | 실패 복구·중복 방지                                    |
| `register`·`ready`·`switch`·`logout` **패킷** | 소켓 위 인증 프로토콜                                  |

**B. web-core가 소유 — 소비자/제공자 (5 기둥)**

| #   | 기둥                                                       | 핵심 코드                                                                                                                                |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **HTTP/REST 레이어** (relay+cloud 모든 API 호출)           | `webTransport`, `executeSignedRelayRequest`, `withRetry`                                                                                 |
| 2   | **토큰 발급(login) + 영속 저장소**                         | `relayCore`(chatic-relay-token) · `cloudCore`(chatic-cloud-token), 로그인 3종(`registerDevice`/`verifyNativeAppToken`/`issueCloudToken`) |
| 3   | **서명 제공** (SDK sign 콜백이 위임)                       | `signServerAuth`, `calcSignature`, `getTokenSignature`, AWS `buildCredentialsByToken`                                                    |
| 4   | **전역 identity/상태** (UI가 읽는 "나는 누구/무엇이 활성") | `rebuildSessionIdentity`, `getActiveServerContext`, uid/isAuthenticated/profile                                                          |
| 5   | **선택 상태** (토큰과 별개)                                | `selectedCloudId` · `selectedSiteId` · `delegatorId`                                                                                     |

**C. web-core가 잃은 것 (→ SDK로 이관)**: 주기 토큰 refresh, 재연결 재인증, 백오프, switch/logout 패킷 발사.
즉 **"토큰을 굴리는 일(관리)"** 만 SDK로 갔고, **"만들고·보관·서명·HTTP·상태(발급/소비)"** 는 web-core에 남는다.

**D. 두 SSoT의 관계 (단방향 writeback)**

```
로그인(발급)      : web-core (HTTP)  ──register(token,authId,sign)──▶  SDK
소켓 토큰 수명주기 : SDK (소켓쪽 SSoT) ──onTokenRefresh(view)──▶  web-core store (relay/cloud)   ※ per-socket kind 라우팅(§6-6)
HTTP 요청 시 토큰  : web-core store 를 읽음 (SDK가 써준 최신값 — 소켓 상시 연결이라 항상 fresh)
```

- **소켓 쪽 현재 토큰의 SSoT = SDK** / **HTTP 쪽 토큰 저장소 = web-core** (writeback으로 동기화).
- 되돌리는 방향은 **register(로그인 시)뿐** — 평상시엔 SDK→web-core **단방향**.

**E. 불변식 (하드 규칙)**

1. **web-core는 소켓 토큰을 refresh하지 않는다** — SDK가 유일 refresher. (이중 회전 = `no auth model @auth.refresh`, [implementation.md §3-4](./implementation.md))
2. **SDK는 HTTP를 하지 않는다** — 데이터 API·토큰 발급·프로필은 web-core.
3. **refresh writeback은 소켓 kind로 라우팅** — 전역 active 아님(§6-6).
4. **앱의 능동 동작은 register(로그인) + switch(사이트전환) + logout뿐** — 그 외 토큰 수명은 SDK가 자동.

### 2-2. 확정된 결정

1. **듀얼 소켓 sync** → **활성 소켓 1개만 sync**, relay는 auth-only 상시 소켓(relay HTTP 토큰 유지 겸용). 데이터 이중 동기화는 범위 밖. (§5-5, §8)
2. **순서** → **단계적**: 배선(Phase 1)을 먼저 랜딩해 가치 조기 확보, 듀얼 소켓(Phase 2)은 검증 후.

> 이전의 "HTTP 만료 갭 완화(SDK token 직접 소비 + 403 재시도)"는 §2-0 **소켓 상시 연결 가정**으로 불필요해져 제외.

### 2-3. 관통 원칙

- **apps/web 단독 대상** — admin/desktop-web 고려 안 함(§2-0). web-core refresh 함수군·시그니처를 apps/web 기준으로 자유롭게 제거·변경.
- **소켓 변경은 `libs/app-runtime` 내부, web-core는 per-server 헬퍼로 정리** — 기존 active-server 헬퍼도 필요 시 per-server로 대체(존치 강제 없음).
- **소켓 상시 연결 가정** — 만료 갭 완화 장치·주입식 토큰 소싱 불필요(§2-0).

---

## 3. 목표 소유 경계 (per-socket로 진화)

```mermaid
flowchart TD
  subgraph app-runtime
    Binder["SocketBinder (relay/cloud 각각 감시)"]
    Boot["bootstrapSocketConnection(kind)"]
    DR["makeDelegate('relay')"]
    DC["makeDelegate('cloud')"]
    Mgr["SocketManager (Map<kind, client>)"]
  end
  subgraph SDK
    AR["relay client.auth"]
    AC["cloud client.auth (활성시만)"]
  end
  subgraph web-core (read-model + provider)
    RC["relayCore (chatic-relay-token)"]
    CC["cloudCore (chatic-cloud-token)"]
    WT["webTransport (HTTP/AWS 서명)"]
  end
  Binder --> Boot
  Boot --> Mgr
  DR --> AR
  DC --> AC
  AR -->|onTokenRefresh| RC
  AC -->|onTokenRefresh| CC
  AR & AC -->|onAuthState| Ver["manager.setAuthenticated(kind)"]
  RC & CC --> WT
```

핵심: Phase 0의 단일 delegate/manager/client를 **kind별로 복제**한다. 각 소켓은 자기 서버 기준으로
register/sign/writeback/expire를 독립 수행하고, web-core의 분리된 저장소(relayCore/cloudCore)에 각각 반영한다.

---

## 4. 현재 상태 요약 (코드 근거, 수렴 판정)

🟢 구현됨 · 🟡 부분 · 🔴 미구현

| 요구사항                                | 상태 | 근거                                                                                                                           |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 전제-1 (전면 위임)                      | 🟡   | register/onTokenRefresh/onAuthState만 배선. `switch`/`logout` 호출 0건                                                         |
| 전제-2 (web-core refresh 안 함)         | 🟡   | apps/web `skipPeriodicRefresh:true`. admin/desktop-web은 HTTP 주기 유지                                                        |
| 전제-3 (두 앱 불변)                     | 🟢   | 두 앱은 app-runtime 소켓 레이어 미import — 자연 격리                                                                           |
| 전제-4 (불필요 코드 제거)               | 🟡   | 진짜 dead는 `cloudCore.getIsActive/setIsActive/CLOUD_IS_ACTIVE_KEY`뿐 (§10)                                                    |
| 멀티소켓-1 (2소켓)                      | 🔴   | `SocketManager` 단일 `client`([SocketManager.ts:39](../../src/socket/SocketManager.ts))                                        |
| 멀티소켓-2 (cloud 활성시만)             | 🔴   | cloud 활성 신호는 activeServer "전환"에만 연결([contextStore.ts:84](../../../web-core/src/session/contextStore.ts))            |
| 멀티소켓-3 (cloud 로그아웃→relay 유지)  | 🟡   | `logoutCloudSession` 저장소 시맨틱 정확([services.ts:290](../../../web-core/src/session/services.ts)). 소켓 auth.logout만 신규 |
| 멀티소켓-4 (relay 로그아웃=전체)        | 🟡   | 종료+클리어+게스트 배선됨. `register` 자동만 공백                                                                              |
| 멀티소켓-5 (cloud 전환 logout→register) | 🟡   | **SDK 재개 지원 확정**. cloud별 wss 상이 시 재사용 불가 가능                                                                   |
| 동작-1 (로그인 register+ready)          | 🟡   | register가 SocketBinder config-diff 부수효과([bootstrapSocketConnection.ts:60](../../src/socket/bootstrapSocketConnection.ts)) |
| 동작-2 (사이트전환 switch)              | 🔴   | HTTP `commitSiteSwitch`([services.ts:419](../../../web-core/src/session/services.ts))                                          |
| 동작-3 (로그아웃 logout)                | 🔴   | web-core HTTP 정리만                                                                                                           |
| 동작-4 (onTokenRefresh→web-core)        | 🟢   | 배선됨. 단 라우팅이 전역 active 기준([services.ts:545](../../../web-core/src/session/services.ts)) → per-socket 교정 필요      |
| 동작-5 (onAuthState 추적)               | 🟢   | 단일 소켓 기준 완결([bootstrapSocketConnection.ts:38](../../src/socket/bootstrapSocketConnection.ts))                          |

**SDK 실현 가능성(확정, node_modules 소스 확인)**: `createClientSocketV2`는 모듈 전역 상태 없는 순수 팩토리라
**독립 client 2개 동시 생성 지원**. `logout()`은 client 파괴 없이 `active=false`만, `register()`는 `!active`일 때
`resume`(docstring "resumes auth when inactive after logout or expiry") → **멀티소켓-5 재개 사이클 지원**. 단일 소켓
제약은 100% 앱 레이어(`getSocketManager` 싱글턴 + `SocketManager` 단일 client) 문제.

---

## 5. 목표 아키텍처 (듀얼 소켓)

### 5-1. SocketManager 듀얼화

단일 `client: ClientSocketV2 | null` → `Map<'relay'|'cloud', ClientEntry>`. `getSocketManager()` 싱글턴
인터페이스는 유지하되 `ensure/connect/request/send/onType/setAuthenticated/subscribe`에 `kind` 인자 추가.
relay 슬롯은 상시, cloud 슬롯은 config 있을 때만. `isSameConfig`의 `wssType` 축은 슬롯 키로 승격.

> 대안(매니저 2 인스턴스) 대비 이유: SyncManager/RuntimeConnectionHost/DataBinder 등 소비처가 매니저 선택
> 로직을 갖지 않도록 **슬롯 방식이 소비처 변경 최소**. SDK가 인스턴스 완전 격리를 보장하므로 안전.

### 5-2. RuntimeBinding 듀얼 config

`socket: { config } | null` → `socket: { relay?: {config}, cloud?: {config} }`. relay config는 relay 토큰
존재 시 항상, cloud config는 `cloud.isActive`([contextStore.ts:38](../../../web-core/src/session/contextStore.ts): `cloudId!=='default' && backend && wss && identityToken`)일 때만 산출. `context(cid/sid/uid)`는
**UI 표시용 단일 축으로 유지**(활성 서버 개념 존치) — 소켓만 2개로 분기.

### 5-3. SocketBinder + delegate per-server

SocketBinder가 `binding.socket.relay`와 `binding.socket.cloud`를 **각각 JSON.stringify 감시**하여 독립적으로
`bootstrapSocketConnection(kind)` 실행. `useSocketSessionDelegate`를 `makeDelegate(kind)` 팩토리로 바꿔 kind를
클로저로 보유.

### 5-4. web-core per-server 헬퍼 (§7)

active-server 단일 기준 헬퍼를 kind 파라미터 버전으로 신규 추가.

### 5-5. sync = 활성 소켓 1개 (relay는 토큰 keep-alive)

`SyncManager`는 활성 소켓의 runtime만 유지. cloud 활성 시 relay 소켓은 **sync는 안 하지만 auth는 유지**하여
relay 토큰을 살려둔다(§2-0: relay HTTP 호출용). `DataContext(cid/sid/uid)`와 `rebuildSessionIdentity`는 단일
활성 축 유지. `isVerified`는 relay master + cloud 별도 셀렉터.

---

## 6. 배선 불변식 ⚠️ (계승 + 신규)

### 계승 (implementation.md §3 — 소켓별로 동일 적용)

- **6-1. register → connect 순서** — register가 토큰만 저장하고 실제 `auth.update`는 `onState('connected')`가 발사. connect 후 register하면 인증 영영 안 됨. (소켓 2개 각각)
- **6-2. device.save 대기 불필요** — `auth.update`가 device 링크를 겸함.
- **6-3. `identityToken` 게이트** — 소켓은 해당 서버 토큰이 있을 때만 부팅. relay는 relay 토큰, cloud는 cloud 토큰 존재로 게이트.
- **6-4. 이중 refresh 금지** — SDK가 유일 refresher (apps/web `skipPeriodicRefresh:true` 유지).
- **6-5. `isVerified` 파생** — `authenticated && state==='connected'`. 소켓별 authenticated.

### 신규 (이번 스텝 하드 규칙)

- **6-6. writeback per-socket 라우팅** ⚠️ **듀얼 하드 블로커** — 현재 `commitSocketRefreshedToken`이 전역 `getActiveServerContext()`로 relay/cloud 분기([services.ts:545](../../../web-core/src/session/services.ts)). 듀얼에서 relay refresh가 cloud 활성 중 도착하면 cloud로 오저장 → relay HTTP 서명 stale. **delegate 클로저 kind로 라우팅**(SDK `AuthTokenView.cloudId`는 relay 토큰에도 실릴 수 있어 신뢰 불가). relay writeback은 `buildCredentialsByToken`으로 lemon-web-core 캐시 갱신 필수(비대칭 유지). **이 교정 전에는 듀얼 소켓 활성화 금지.**
- **6-7. register 소유권 이관** — register 트리거를 SocketBinder config-diff → **로그인 흐름**으로 이관, SocketBinder는 "소켓 재부팅"만. register는 idempotent이나 두 트리거 공존 시 순서 레이스. keepAlive 게스트 로그인 경로도 동일 register 경유.
- **6-8. (제외) HTTP 만료 갭** — §2-0 "소켓 상시 연결" 가정 하에 `onTokenRefresh` writeback이 항상 최신이라 web-core store가 stale해질 창이 없다. 별도 완화 장치(SDK token 직접 소비/403 재시도) 불필요. HTTP는 종전처럼 web-core store를 읽으면 된다. (가정이 깨지는 환경이 생기면 이 항목 재검토.)
- **6-9. cloud 전환 wss 동일성** — 멀티소켓-5 "같은 cloud 소켓 재사용"은 `cloudCore.getWss=delegationToken.wss`가 같을 때만 성립. A→B에서 wss가 다르면 `auth.logout→register` 대신 **cloud 슬롯 destroy+recreate 폴백**.
- **6-10. relay expired 정책** — relay 소켓 SDK `expired`는 **재부팅/재register 우선**(전면 로그아웃 승격 금지). 하드 만료(useTokenRefresh classifyError `shouldLogout`)만 `logoutRelaySession` 트리거. (Phase 0 §4-6 계승: relay=no-op 기조 유지)

---

## 7. web-core 헬퍼 계약 (active-server → per-server, 추가만)

기존 active-server 헬퍼(Phase 0 §5)는 **존치**(admin/desktop-web·useRefreshCurrentCloudSession 사용). 아래를 **신규 추가**:

```ts
// register 시드: 명시적 kind 기준 { token, authId }
getServerAuthRegistration(kind: 'relay' | 'cloud'): Promise<{ token: string; authId: string } | null>;
//   relay: token=relayCore.getIdentityToken(), authId=webTransport.getTokenSignature().authId
//   cloud: token=cloudCore.getIdentityToken(),  authId=cloudCore.getCloudToken().Token.authId

// SDK sign 콜백 본문: 명시적 kind 기준 (서명식은 token 문자열 무관 — signing.md)
signServerAuth(kind: 'relay' | 'cloud', target?: string): Promise<{ signature: string; current: string }>;

// SDK refresh/switch 결과를 kind 저장소로 단방향 writeback (per-socket 라우팅, §6-6)
commitServerRefreshedToken(kind: 'relay' | 'cloud', view): void | Promise<void>;
//   cloud: cloudCore.saveCloudToken({ ...existing, ...view })
//   relay: await webTransport.buildCredentialsByToken(view.Token); relayCore.saveRelayToken({ ...existing, ...view })
//   이후 rebuildSessionIdentity(). (relay=자격 캐시 갱신 필수, cloud=저장만 — 비대칭)
```

relay/cloud 저장소가 이미 물리 분리(`chatic-relay-token` / `chatic-cloud-token`)돼 있어 분기는 각 core를
직접 호출하면 된다. **web-core 루트(`src/index.ts`) 명시 export** 필요(services는 자동 re-export 안 됨).

---

## 8. 시나리오 (end-to-end, 듀얼)

- **8-1. 로그인 3종 (게스트/소셜/클라우드접속)** — 로그인 함수가 토큰을 web-core에 저장한 직후, 해당 kind 소켓에 `auth.register({token,authId,sign}) → ready()`. `getServerAuthRegistration(kind)` 반환형이 `AuthRegisterOptions`와 동형.
- **8-2. 사이트 전환** — 활성 서버 소켓에 `auth.switch(`${uid}@${sid}`)`. 성공분은 `onTokenRefresh` → `commitServerRefreshedToken`. optimistic sid 선반영·롤백은 web-core 존치, `AuthSwitchError.phase` 실패 시 롤백. 미연결이면 HTTP 폴백.
- **8-3. cloud 접속 (default→cloud)** — cloud 토큰 발급([switchCloudSession](../../../web-core/src/session/services.ts) 유지) → cloud config 생성 → cloud 소켓 신규 부팅(register). relay 소켓은 그대로.
- **8-4. cloud 전환 (cloud→cloud, 멀티소켓-5)** — 새 cloud 토큰 발급 후, **wss 동일하면** 기존 cloud 소켓 `auth.logout → auth.register`(재개), **wss 다르면** cloud 슬롯 재생성 (§6-9).
- **8-5. cloud 로그아웃 (멀티소켓-3)** — cloud 소켓 `auth.logout` + cloud 슬롯 teardown. `logoutCloudSession`이 cloudCore만 정리, **relay 소켓·세션 유지**.
- **8-6. relay 로그아웃 (멀티소켓-4)** — relay+cloud 두 소켓 `auth.logout`+teardown → 저장소 클리어([logoutRelaySession](../../../web-core/src/session/services.ts)) → keepAlive 게스트 재로그인 → relay 소켓 재부팅 시 `auth.register` 자동. (리다이렉트 UX 존치 권장)
- **8-7. HTTP 요청** — auth 헤더는 SDK `auth.token` 우선. 403/서명만료 시 소켓 재연결 대기 후 1회 재시도, 그래도 실패면 로그아웃 (§6-8).

---

## 8-a. 데이터/sync 레이어 영향 점검 (멀티소켓)

**결론**: 데이터 레이어는 **무관·무변경**(소켓 client 미참조), sync 레이어는 **조건부 OK** — "단일 활성 client"
가정이 `SyncManager` 한 곳에 집약돼 있어, `subscribeActiveClient`로 활성 소켓만 흘리면 **기존 스왑 머신이
그대로 "활성 소켓만 sync"** 가 된다. runtime은 2개 필요 없이 **활성 1개** 유지가 정답.

### 데이터 레이어 — 무변경 ✅

- `DataManager`는 소켓 client를 **전혀 참조하지 않고** `cid/sid/uid` DataContext만 소비([data/runtime.ts:10](../../src/data/runtime.ts)). `RuntimeDataBinder`는 context diff에만 `dataManager.ensure(context)`([RuntimeDataBinder.tsx:13-19](../../src/connection/RuntimeDataBinder.tsx)).
- 로컬 캐시·observer가 `cid/sid/uid` 튜플로 파티션(`getScopeKey`). cloud 활성 시 `cid=cloudId`([useRuntimeBinding.ts:32-33](../../src/runtime/useRuntimeBinding.ts)) → 쿼리가 cloud 파티션으로만 향하고 **relay 데이터는 자동 제외**. "데이터 이중 동기화 범위 밖" 정책의 **의도된 귀결(버그 아님)**.
- ⚠️ **확인 필요**: cloud 활성 중 **relay 데이터를 캐시로 보여줘야 하는 UI가 없어야** 한다. relay HTTP(§2-0 동기)는 relay 토큰 keep-alive로 지원되지만 그 결과가 relay 캐시 파티션에 쌓이진 않는다.

### sync 레이어 — 조건부 OK 🟡

- 단일 가정 집약 지점: `SyncManager`가 `manager.subscribeClient` **단일 client** 구독([SyncManager.ts:43](../../src/socket/sync/SyncManager.ts)), 단일 `runtime`([:23](../../src/socket/sync/SyncManager.ts)), client 교체 시 `detachRuntime → createRuntime(client) → replayTargets`([:139-150](../../src/socket/sync/SyncManager.ts)). 넘어온 client를 **무조건** sync 대상으로 삼음.
- **호재**: 이 "client 교체 → runtime 재생성 → replay"가 곧 "활성 소켓 변경" 처리다. → **권장안**: `SocketManager`에 `subscribeActiveClient(listener)` 추가(활성 슬롯 client만 방출; cloud 활성이면 cloud, 아니면 relay). `SyncManager`는 이것만 구독 → relay auth-only 슬롯은 sync 콜백을 **아예 안 받는다.** `SyncManager` 본체는 거의 무변경.
- `plans`는 **무변경** — 모든 plan이 `getContext()=getDataManager().getContext()`만 참조([plans.ts:22](../../src/socket/sync/plans.ts)), client 무관. `requiresAuth` 게이트는 plan에 없음(엔진 내부 `auth.update` + `usePrimeChat` isVerified에서만 게이팅).

### isVerified 게이트 — 활성 소켓 기준으로 좁혀야 함 ⚠️

- `usePrimeChat`가 **통합** `isVerified`로 chat prime 게이트([useSyncTarget.ts:40,43](../../src/socket/sync/hooks/useSyncTarget.ts)). 듀얼에서 relay만 verified인데 cloud 미verified면 **오게이팅**(cloud prime이 새거나 반대).
- → `SocketState`를 kind별로 갖거나 `useSocketState`에 "활성 소켓 verified" 셀렉터 추가. prime 게이트는 **활성(=sync 대상) 소켓의 verified**로.

### 전환 시 함정 (구현 시 반드시 처리)

1. **runtime 재바인딩 순서 레이스** — 활성 client 방출이 context 스왑([RuntimeDataBinder](../../src/connection/RuntimeDataBinder.tsx))보다 **먼저**면 새 runtime이 옛 cid로 prime. **활성-client 스왑과 context 스왑의 순서 보장** 필요(effect 실행 순서는 렌더 순서와 별개).
2. **cloud 로그아웃 시 watchEntries 오염** — cloud 로그아웃 → 활성 relay 복귀 → SyncManager가 relay runtime 재생성 + `replayTargets`([:152](../../src/socket/sync/SyncManager.ts))로 **남은 cloud 채널 타겟을 relay 소켓에 재등록**할 수 있음. 전환 시 **watchEntries 정리 정책**(cloud 스코프 타겟 drop) 필요.
3. **정책 확인**: cloud 로그아웃 후 relay 단독이면 relay가 다시 sync 대상이 되는 게 맞다(relay가 활성) — 자연스럽지만 명시.

### 요약

- **데이터: 변경 없음** (context-driven, 소켓 무관).
- **sync**: `subscribeActiveClient` 추가 + `SyncManager` 거의 무변경 + 전환 시 watchEntries 정리 + isVerified 활성 기준. (§5-5, §9 Step 2f)

---

## 9. 구현 플랜 (Phase 1 → Phase 2)

### Phase 1 — 단일 소켓에서 배선 (가치 조기 확보)

| Step | 내용                                                                                                                         | 주요 파일                                                                          | 요구사항 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| 1a   | 로그인 3종 + keepAlive 명시 `register→ready`. register 소유권 이관(§6-7). 부팅 프로필 하이드레이션도 로그인 흐름으로 이관    | `web-core services.ts`(login), `SessionBackgroundRunner`, `SocketBinder`, delegate | 동작-1   |
| 1b   | 사이트 전환 `auth.switch`. `commitSiteSwitch` HTTP 재발급 **제거**(소켓 상시 연결이라 폴백 불필요), optimistic sid 롤백 존치 | `web-core services.ts:commitSiteSwitch`, delegate                                  | 동작-2   |
| 1c   | 로그아웃 `auth.logout` 배선. web-core 정리는 콜백 유지                                                                       | `web-core services.ts` logout, delegate                                            | 동작-3   |
| 1d   | web-core 주기 refresh 경로 **제거**(`useTokenRefresh` 주기 + `refresh*` 함수군) — SDK가 refresh 소유                         | `web-core useTokenRefresh`/`services.ts`                                           | 전제-2/4 |

### Phase 2 — 듀얼 소켓

| Step | 내용                                                                                                                                                                     | 주요 파일                                              | 요구사항       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------- |
| 2a   | web-core per-server 헬퍼 신규 추가(§7). 기존 active-server 함수 존치                                                                                                     | `web-core services.ts`, `index.ts`                     | 전제-1 기반    |
| 2b   | writeback per-socket 라우팅(§6-6 하드 블로커 해소)                                                                                                                       | delegate, `commitServerRefreshedToken`                 | 동작-4         |
| 2c   | SocketManager 듀얼화 `Map<kind, client>`                                                                                                                                 | `SocketManager.ts`, `runtime.ts`, `types.ts`           | 멀티소켓-1     |
| 2d   | RuntimeBinding 듀얼 config + SocketBinder per-server + `makeDelegate(kind)`                                                                                              | `useRuntimeBinding`, `SocketBinder`, delegate          | 멀티소켓-1/2   |
| 2e   | cloud 로그아웃(relay 유지) / relay 로그아웃(전체) / cloud 전환(wss 분기, §6-9)                                                                                           | `web-core services.ts`, delegate                       | 멀티소켓-3/4/5 |
| 2f   | `SocketManager.subscribeActiveClient` 추가(활성 슬롯만 방출) → SyncManager 활성-1 스코핑(본체 거의 무변경). 전환 시 watchEntries 정리 + isVerified 활성 소켓 기준 (§8-a) | `SocketManager.ts`, `SyncManager.ts`, `useSocketState` | 결정-2         |
| 2g   | 안전 제거(§10) + signing.md per-server 갱신 + 전 워크스페이스 빌드 그린                                                                                                  | `cloudCore.ts`, docs                                   | 전제-4         |

각 Step은 disciplined-implementation 규율(영어 주석 · 변경 로직 유닛 테스트 실행·통과 · 검증 체크리스트)로
진행한다. (admin/desktop-web은 대상 외 — §2-0.)

---

## 10. 불필요 코드 (전제-4, 전제-3으로 축소)

> admin/desktop-web은 대상 외(§2-0)이므로 이들의 참조는 이 설계에서 고려하지 않는다 — 옛 "제거 금지" 제약이 해제된다.

| 대상                                                                                                                              | 판정             | 근거                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `cloudCore.getIsActive/setIsActive/CLOUD_IS_ACTIVE_KEY` ([cloudCore.ts:7,41-47](../../../web-core/src/session/core/cloudCore.ts)) | ✅ 제거          | isActive는 [contextStore.ts:38](../../../web-core/src/session/contextStore.ts) 파생 계산, storage 플래그 미사용 |
| `SocketAuthBinder`/`SocketSessionController` 잔여 참조·문서                                                                       | ✅ 정리          | 마이그레이션으로 대체됨                                                                                         |
| `refreshRelaySession`/`refreshActiveCloudSession`/`refreshCloudSession`/flight                                                    | ✅ **제거 가능** | refresh를 SDK 위임(전제-2) + 소켓 상시 연결. apps/web이 유일 대상이라 참조 정리 후 제거                         |
| `useTokenRefresh` 주기 경로                                                                                                       | ✅ **제거**      | SDK가 refresh 소유. **부팅 프로필 하이드레이션은 로그인 흐름(1a)으로 이관 후** 나머지 제거                      |
| `cloudCore.clearDelegationToken`                                                                                                  | ✅ 제거 가능     | 옛 desktop-web 제약 해제                                                                                        |
| `commitSiteSwitch` HTTP 재발급 분기                                                                                               | ✅ 제거          | `auth.switch`로 대체(1b), 소켓 상시 연결이라 HTTP 폴백 불필요                                                   |

> 제거 전 apps/web 내부 참조만 정리하면 된다(admin/desktop-web은 고려 안 함).

---

## 11. 리스크 & 구현 전 검증

**Critical**

- **6-6 writeback 오라우팅**: 듀얼 소켓 하드 블로커. per-socket 라우팅 전 듀얼 활성화 금지. **연결 여부와 무관한 correctness 문제라 §2-0 가정으로도 사라지지 않음.**
- **6-9 cloud wss 가정**: wss 상이 시 "1 소켓 재사용" 불성립 → 재생성 폴백 필수.
- **6-7 register 이중 트리거**: 소유권 이관·조율 필요.
- (해소됨) **만료 갭 · 전제-3 파괴**: §2-0 가정(소켓 상시 연결 / admin·desktop-web 제외)으로 제외.

**구현 전 검증 (Phase 2 진입 시)**

- [ ] cloud A→B 전환 시 **wss 동일 여부** → 8-4 재사용 vs 재생성 결정
- [ ] SDK `AuthTokenView.cloudId`가 relay 토큰에도 실리는지 → writeback 근거(현재는 delegate kind가 안전)

---

## 12. 트러블슈팅 (예상)

| 증상                             | 원인 후보                      | 대응                                    |
| -------------------------------- | ------------------------------ | --------------------------------------- |
| relay HTTP 서명이 stale/403      | writeback이 cloud로 오라우팅   | per-socket kind 라우팅 (§6-6)           |
| cloud 로그아웃 후 relay까지 끊김 | relay 소켓 teardown 오발동     | cloud 슬롯만 destroy, relay 존치 (§8-5) |
| cloud 전환 후 인증 안 됨         | wss 변경인데 register만 시도   | wss 상이 → 재생성 폴백 (§6-9)           |
| 로그인 직후 이중 register 레이스 | 로그인 명시 + config-diff 공존 | register 소유권 이관 (§6-7)             |

---

## 관련 문서

- [implementation.md](./implementation.md) — **이전 스텝**(SDK 단일 소켓 채택) 구현 스펙·배선 불변식 (정정본)
- [README.md](./README.md) — 소유 경계·공개 표면·상태 머신
- [usage.md](./usage.md) — 사용 패턴·시나리오
- [signing.md](./signing.md) — relay/cloud 서명·writeback 계약
- [../architecture.md](../architecture.md) — app-runtime 소유 규칙
