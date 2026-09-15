# ADR-0076: 인증 상태는 하나가 판정한다 — 세션 시그널 타입화 · 자격증명 renewer · ADR-0070 §0 완결

> 상태: **Live** · 작성일: 2026-09-07 · 구현 완료: 2026-09-07 (§실행 기록)
> 범위: `libs/app-runtime/**` + 앱 4곳 (`apps/web` · `apps/admin-v2` · `apps/testbed` · `apps/desktop-web`)
> 관련: [ADR-0070](./0070-app-runtime-session-hub.md) (세션 허브 — 이 문서는 그 §0 원칙을 잔여분에 적용하고
> 결정 2·7의 표현을 갱신한다) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) ·
> [2026-08 세션 관리 감사](../audit/2026-08-session-management-audit.md) ·
> [2026-09 죽은 코드 스윕](../audit/2026-09-dead-code-sweep.md)

> **용어 고정:** ADR-0070과 동일하다. **Auth SDK**는 `@lemoncloud/chatic-sockets-lib`의
> `ClientSocketAuth`(`AuthController`)를 뜻한다.
>
> **이름은 리포 관례에서 왔고, 선례의 강도는 이름마다 다르다.** 아래 등장하는 심볼은 현 트리에서 실측한
> 형태(`I*` 인터페이스+클래스 55쌍 · `deriveConnectivity`/`ConnectivityStatus` · `*Adapter` 265 ·
> `*Snapshot` 234 · `*Policy` · `useRuntime*`)를 따르되, 리포에 **단어 자체가 없는 것 하나**
> (`ICredentialRenewer` — 기존 동사 `renew*`에서 파생)는 그렇게 표시했다. 이름별 실측 등장 수와 근거는
> [architecture.md §네이밍 규약](../../libs/app-runtime/docs/architecture.md)이 표로 소유한다.

## 맥락 (Context)

ADR-0070은 세션의 **소유**를 정리했다 — 스토어 하나, refresh 주인 하나, 스코프 소유자 하나. 그 목표는
달성됐고 되돌릴 것이 없다. 이 문서가 다루는 것은 그 다음 층이다: **소유는 하나인데, 상태를 읽는 방법이
여전히 여러 개다.**

### 1. "지금 relay 인증 상태가 뭐냐"에 답하는 지점이 없다

한 질문에 답하려면 서로 다른 7개 모듈에서 7개 값을 읽어야 한다.

| #   | 원천                                                                                                     | 의미                            |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `identity.isAuthenticated` ([contextStore.ts](../../libs/app-runtime/src/session/store/contextStore.ts)) | 세션 **존재** (유효성 아님)     |
| 2   | `relayStore.getRelayToken()`                                                                             | 토큰 유무                       |
| 3   | `credentialFreshness.timeToExpiry('relay')`                                                              | AWS 자격증명 잔여 수명          |
| 4   | `client.auth.state` (Auth SDK)                                                                           | 컨트롤러 상태 (종단 `expired`)  |
| 5   | `manager.isKindVerified(kind)`                                                                           | **이 연결에서** 핸드셰이크 완료 |
| 6   | `isStoredSessionExpired()`                                                                               | lemon 스토어의 별개 시계        |
| 7   | `hasStoredRelaySession()`                                                                                | lemon 스토어 존재 여부          |

이 7개의 조합 규칙이 **두 곳**에 각각 다시 쓰여 있다 —
[`useSessionStalenessGuard`](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts) ·
[`requestRelaySessionRefresh`](../../libs/app-runtime/src/socket/auth/requestRelaySessionRefresh.ts) ·
[`recoverUnverifiedSockets`](../../libs/app-runtime/src/socket/auth/recoverUnverifiedSockets.ts). 둘 다
"이 슬롯의 소켓 인증을 지금 쓸 수 있나"를 묻는 같은 판정이고, 각자 20~40줄 주석으로 자기를 정당화하는데
그 주석들이 서로를 참조하지 않는다. 디버그 오버레이도 로그도 이 판정을 재사용할 수 없어서, 장애를
재현할 때 사람이 7개를 손으로 맞춰 봐야 한다.

> **최초에 4곳으로 셌고, 3단계 실행이 그것을 2곳으로 정정했다.** 나머지 둘은 같은 판정의 사본이
> 아니었다 —
>
> - [`useConnectivity`](../../libs/app-runtime/src/connection/useConnectivity.ts)는 **표시 판정**이다
>   (§결정 1의 근거 셋).
> - [`useSessionStalenessGuard`](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts)는
>   두 시계를 **서로 다른 정책으로** 쓴다: 저장 세션 만료는 무조건 갱신하고 실패를 teardown 스트릭에
>   계수하지만(admin-v2가 3연속 실패로 로그아웃), 자격증명 마진은 `forceRefresh` opt-in + 쿨다운일
>   때만 발사하고 실패를 계수하지 않는다("아직 유효한 자격증명은 세션 건강에 대해 아무 말도 하지
>   않는다" — 가드 자기 주석). `AuthStatus`는 그 둘을 `stale` 하나로 접고 `handshaking`을 `stale`보다
>   우선하므로, 상태 기반으로 바꾸면 소켓이 미검증일 때 가드가 조기 반환하며 스트릭을 리셋한다 —
>   죽은 소켓 + 만료 세션이라는, 가드가 존재하는 바로 그 시나리오에서 좀비 정리가 사라진다.
>   공유할 만한 것은 자격증명 마진 비교 한 줄뿐이고 그것은 이미 `msUntilExpiration` 하나를 쓴다(배치 A3).
>
> 즉 **줄어드는 것은 2 → 1**이다. 판정을 억지로 하나로 만드는 것이 목표가 아니라, *같은 질문*을 두 번
> 쓰지 않는 것이 목표다.

`deriveConnectivity`는 이미 정답 형태다 — 입력(`ConnectivitySignals`)을 구조체로 받는 순수 진리표라서
소켓 매니저 없이 테스트된다. **그 패턴이 연결 상태에만 적용돼 있고 인증 상태에는 적용돼 있지 않다.**

### 2. 세션 통지가 무정보 방송이라 유스케이스 하나가 fan-out을 8번 낸다

`notifySessionStateChanged()`는 payload가 없고 호출 지점이 **24곳**이다(스토어 15 · contextStore 5 ·
유스케이스 4). 구독자는 "무언가 바뀌었다"만 듣고 전부 다시 파생한다.

클라우드 전환 1회(당시 `services.ts` 의 `switchCloudSession` — 현 [`cloudSession.ts`](../../libs/app-runtime/src/session/auth/cloudSession.ts))의
성공 경로가 내는 통지:

```
saveSelectedCloudId(1) → clearSelectedSite(2) → saveDelegationToken(3) → saveCloudToken(4)
→ saveSelectedCloudId(5) → clearPlaceOrder(6) → rebuildSessionIdentity(7) → setSelectedCloudId(8)
```

각 통지가 `cachedGlobalSessionContext`를 버리고 `useGlobalSession` 구독자 전원을 리렌더하며
`useRuntimeBinding`을 재조립한다. 즉 **일관되지 않은 중간 상태 7개가 관측자에게 그대로 노출된다.**
(5번과 8번은 같은 함수다 — `setSelectedCloudId`는 `cloudStore.saveSelectedCloudId` 그 자체. 순수 중복.)

`rebuildSessionIdentity`는 이 문제를 알고 있어서 [동등성 게이트](../../libs/app-runtime/src/session/store/contextStore.ts)를
손으로 달아 놨다. 그런데 같은 상태를 쓰는 다른 진입점 4개(`setSessionAuthenticated` ·
`clearRelaySession` · `setSessionIdentityState` · `markSessionInitialized`)는 무조건 통지한다. 한 상태,
5개 진입점, 2개 통지 정책. 그리고 `sessionContextStore.setIdentityState`는 **통지하지 않으므로** 호출자가
따로 기억해야 한다 — 규약이 아니라 관습이다.

### 3. relay/cloud 회복 비대칭이 8곳에서 각각 분기한다

"relay는 refresh밖에 없고(부모 토큰이 없다), cloud는 relay 신원으로부터 **재발급**된다"는 **하나의 사실**이
여덟 곳에서 분기하고, 각 곳이 20~30줄 주석으로 같은 근거를 다시 설명한다:
`sessionDelegate.onAuthExpired` · `configureCredentialRecovery` · `credentialFreshness` ·
`useSessionStalenessGuard` · `useCloudCredentialGuard` · `SessionCredentialAdapter` ·
`requestRelaySessionRefresh` · `renewCloudSession`.

두 가드는 **정책만 다르고 스케줄링은 같다** — `enabled` · 마진 · `visibilitychange` 엣지 · in-flight 가드 ·
실패 후 재시도 sleep이 양쪽에 복제돼 있다.

ADR-0070 이후 두 가드를 분리한 판단은 문서에 남아 있고(["`kind` 옵션을 여기 추가하면 서로 무관한 회복 전략
둘이 한 스위치 뒤에 놓인다"](../../libs/app-runtime/src/session/hooks/app/useSessionStalenessGuard.ts)),
그 판단은 지금도 옳다. 문제는 그것이 **정책 분리를 주석으로만** 표현한다는 것이다. `libs/http`는 같은
문제를 이미 타입으로 풀어 놨다 — `ICredentialRecoverer`에 `NoCredentialRecovery` ·
`PortCredentialRecoverer` 두 구현이 붙어 있다. app-runtime 쪽에는 그 층이 없다.

### 4. 손으로 만든 동시성 가드가 7종, 전부 다른 모양이다

| 위치                         | 형태                                                |
| ---------------------------- | --------------------------------------------------- |
| `RelayRefreshCoalescer`      | class · `inFlight` + 3초 결과 메모 + `reset()` 시임 |
| `renewCloudSession`          | 모듈 `let inFlight`                                 |
| `recoverUnverifiedSockets`   | 모듈 `let inFlight`                                 |
| `useSessionStalenessGuard`   | `useRef inFlight` + `lastForcedAt` 60초 쿨다운      |
| `bootstrapSocketConnection`  | 인스턴스별 `resumeHoldUntil` + 지수 백오프          |
| `useRelaySessionKeepAlive`   | `runningRef`                                        |
| `useDeviceTokenRegistration` | `pendingRef` + 60초 throttle                        |

"이 경로가 두 번 발사될 수 있나?"에 답하려면 일곱 개를 다 읽어야 한다. `RelayRefreshCoalescer`는 이미
필요한 클래스이고, 나머지 여섯이 그것의 열등한 사본이다.

### 5. ADR-0070 §0이 세션 허브에는 적용되지 않았다

ADR-0070 §0은 명시했다 — _"함수 모음(export 함수 뭉치)으로 경계를 넘는 기존 web-core 식 표면은 이관하면서
인터페이스+클래스로 재구성한다."_ `data` · `@chatic/http` · `@chatic/db` · scope는 그렇게 됐다
(`I*` 인터페이스 55쌍 + 대응 클래스가 그 결과다).
`session/auth/services.ts`(이 결정으로 삭제됐다)는 **539줄 · 느슨한 export
함수 15개**로 web-core에서 그대로 이관됐다. 이 파일이 세션 허브에서 유일하게 §0을 지키지 않은 지점이고,
동시에 가장 자주 읽히는 지점이다.

스토어 3형제도 절반만 갔다 — 인터페이스는 있는데 이름이 `RelayCore`/`CloudCore`/`IdentityCore`로
**web-core 시절 `session/core` 폴더명을 그대로 물고 있고**(리포의 `I*` 관례 밖), 구현이 객체 리터럴이라
생성자 주입이 없고(스토리지가 모듈 전역) 매 읽기가 `JSON.parse`다(`buildRelayContext()` 한 번이 relay
토큰을 3번 파싱한다).

### 6. 경계가 문서에만 있다 — 공개 표면 111개 중 31개는 어떤 앱도 쓰지 않는다

[public-surface.md](../../libs/app-runtime/docs/public-surface.md)는 스토어 writer가 배럴에 있는 것을
인정하면서 *"이건 앱이 세션을 직접 조작하라는 초대가 아니다"*라고 적어 놨다. 그러나
`public-surface.test.ts`는 그 심볼들을 **공개 계약으로 잠근다**. 즉 규율이 산문이고 테스트는 반대 방향으로
작동한다.

실측: 공개 값 export 111개 중 **31개가 비테스트 앱 코드에서 참조 0**이고, 그 31개에 위험한 것이 다 들어 있다 —
`commitServerRefreshedToken` · `signServerAuth` · `getServerAuthRegistration`(Auth SDK 브리지 내부) ·
`rebuildSessionIdentity` · `clearRelaySession` · `setSessionIdentityState` · `markSessionInitialized` ·
`notifySessionStateChanged` · `sessionContextStore` · `setSelectedCloudId` · `setSelectedSiteId` ·
`applySelectedSite` · `persistDeviceId` …

> **측정 정정 (2단계 실행 시): 31 → 32.** `setSessionAuthenticated`는 앱 참조가 있는 것으로 셌는데,
> 그 '참조'가 `apps/admin-v2` OAuthResponsePage의 **주석 한 줄**이 전부였다. 식별자 빈도 기반 탐지가
> 주석을 가리지 못하는 한계이고, 같은 함정이 `useRegisterDeviceToken`도 숨겼다(0단계) — 2026-09 스윕이
> 스스로 인정한 그 한계다. 실제로 내린 것은 32개다. **공개 값 export의 실측 궤적은 `111 → 78 → 77 → 67`이다** —
> develop 111, 2단계가 32개를 내려 78(한 개는 같은 단계가 새로 올린 `logoutSession`),
> 6단계가 소비자 0이 된 `useRuntimeSocketSlots`를 내려 77, 7단계가 앱 import 0인 9개와
> `ServiceUnavailable` 3개를 내려 **67**. 초판이 이 자리에 적은 "110 → 78"은 기준선을 하나
> 덜 세고(111이다) 2단계의 중간값을 최종값으로 제시한 것이었다.

### 7. ADR-0070이 고쳤다고 선언한 결함이 패키지 **내부**에 남아 있다

ADR-0070 §맥락은 배럴 두 개가 같은 이름을 내놓던 결함을 표로 적고 이렇게 결론했다 — _"배럴 두 개가 같은
이름을 내놓으면 호출부는 어느 쪽이 진짜인지 알 방법이 없다 — 창구를 하나로 만드는 것 자체가 이 결함의
수정이다."_ `web-core`는 삭제됐다. 그런데 **같은 충돌이 합쳐진 패키지 안에 그대로 있다.**

| 이름                                   | 약한 판 (스토어만)                                | 강한 판 (소켓 통지 + 스토어)                                                                        | 루트 배럴이 내보내는 것 |
| -------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| `logoutCloudSession`                   | `session/auth/services.ts` (삭제됨)               | [`socket/auth/logoutCloudSession.ts`](../../libs/app-runtime/src/socket/auth/logoutCloudSession.ts) | **약한 판**             |
| `logoutRelaySession` / `logoutSession` | `session/auth/services.ts` (`logoutRelaySession`) | `socket/auth/logoutSession.ts` (`logoutSession`)                                                    | **약한 판**             |

훅(`useLogoutCloudSession` · `useSessionLogout`)은 강한 판을 쓰므로 화면 경로는 정상이다. 그러나
public-surface.md가 강한 판을 "비공개"로 선언한 상태에서 **루트 배럴이 약한 판을 같은 이름으로 공개**하고
있고, 실제로 [`apps/admin-v2`의 `useRelaySessionGuard`](../../apps/admin-v2/src/app/hooks/useRelaySessionGuard.ts)가
teardown으로 약한 판을 호출한다 — 그 로그아웃은 두 슬롯의 `auth.logout`을 건너뛴다.

## 결정 (Decision)

### 0. ADR-0070 §0을 세션 허브 잔여분에 적용한다 — 이름은 기존 관례를 따른다

새 결정이 아니라 **미적용분의 집행**이다. 계약은 `I*` 인터페이스, 구현은 클래스 + 생성자 주입, 경계를
넘는 것은 인터페이스와 도메인 타입뿐. 대상은 §맥락 5가 지목한 `session/auth/services.ts`와 스토어 3형제다.

**새 이름은 발명하지 않는다.** 리포에 이미 있는 접미사·형태만 쓴다 — `I*`+클래스(55쌍)와 그중
camelCase 모듈 싱글턴까지 가는 형태(**4건**: `credentialRecovery` · `credentialFreshness` ·
`staleCredentialMarker` · `webClient`), `derive*`+`*Status`+`*Signals`
(`deriveConnectivity`/`ConnectivityStatus`/`ConnectivitySignals`), `-er` 행위자 명사
(`ICredentialRecoverer` · `IAuthSigner` · `IFailureAttributor`), `*Policy` · `*Snapshot` · `*Adapter` ·
`useRuntime*` · `use*Guard`. 리포에 0건인 접미사(`*Impl` · `*Service` · `*Strategy` · `*Bus` ·
`*Verdict`)는 쓰지 않는다. 대응표는
[architecture.md §네이밍 규약](../../libs/app-runtime/docs/architecture.md)에 있다.

### 1. 인증 상태 판정은 `deriveAuthStatus` 하나가 소유한다

7개 원천을 읽어 **이름 붙은 상태 하나**를 낸다. 판정은 순수 함수(`deriveConnectivity`와 같은 형태의
진리표)이고, 원천 수집은 그 옆의 함수가 맡는다 — **새 명사(클래스·싱글턴)를 만들지 않는다.** 같은
폴더의 `requestRelaySessionRefresh(deps)` · `recoverUnverifiedSockets(deps)`가 이미 쓰는
"함수 + optional `*Deps` + lazy 기본값" 형태를 그대로 따르므로 지연 싱글턴도 `reset*` 시임도 필요 없다.

```ts
// socket/auth/authStatus.ts — 순수 판정 (deriveConnectivity와 동형)
export type AuthStatus =
    | 'absent' // 토큰 없음 — 로그인 전
    | 'handshaking' // 토큰 있고 이 연결의 device.save → auth.update 진행 중
    | 'verified' // isKindVerified
    | 'stale' // 검증됨, 자격증명이 마진 이하 → 갱신 대상
    | 'wedged' // 바인딩됐지만 미검증 (좀비) → wake 킥 대상
    | 'expired'; // Auth SDK 종단 → onTerminalExpiry 대상

export interface AuthSignals {
    readonly hasToken: boolean;
    readonly transport: ClientSocketState;
    readonly controller: AuthControllerState | null;
    readonly verifiedOnThisConnection: boolean;
    readonly credentialMs: number | null;
    readonly marginMs: number;
}

export const deriveAuthStatus = (signals: AuthSignals): AuthStatus => {
    /* 진리표 */
};

export interface SocketAuthSnapshot extends AuthSignals {
    readonly kind: SocketKind;
    readonly status: AuthStatus;
}
```

```ts
// socket/auth/authStatus.ts — 원천 수집 (같은 파일, 순수 함수 바로 아래)
export interface AuthSignalDeps {
    manager?: Pick<ISocketManager, 'isKindVerified' | 'getClient'>;
    renewer?: ICredentialRenewer;
}

/** 스토어·소켓·SDK에서 `AuthSignals`를 모은다. 주입이 없으면 런타임 기본값을 지연 해석한다. */
export const readAuthSignals = (kind: SocketKind, deps?: AuthSignalDeps): AuthSignals => {
    /* ... */
};

/** 호출부가 쓰는 것. `readAuthSignals` → `deriveAuthStatus` 두 줄. */
export const getAuthStatus = (kind: SocketKind, deps?: AuthSignalDeps): AuthStatus =>
    deriveAuthStatus(readAuthSignals(kind, deps));
```

`*Deps`를 optional로 받아 기본값을 lazy 해석하는 것은 같은 폴더의
[`requestRelaySessionRefresh`](../../libs/app-runtime/src/socket/auth/requestRelaySessionRefresh.ts) ·
[`recoverUnverifiedSockets`](../../libs/app-runtime/src/socket/auth/recoverUnverifiedSockets.ts)가 이미
쓰는 형태다. 이 투영도 스토어와 `SocketManager`를 둘 다 알아야 하므로 모듈 로드 시점에는 조립할 수
없는데, 함수 인자로 미루면 지연 싱글턴(`get*`/`reset*`)이 필요 없다 — 테스트는 `deps`로 직접 넣는다.

**규칙:** `AuthStatus`를 다시 계산하는 코드는 `deriveAuthStatus` 하나뿐이다. 가드 · wake 복구 ·
`requestRelaySessionRefresh`의 사전 조건 · 연결 상태 훅 · 디버그 오버레이 · 로그는 전부 `status`(또는
그것을 만든 `AuthSignals` 필드)를 **읽기만** 한다. 새 판정 분기를 다른 파일에 쓰는 것은 회귀다.

**`deriveConnectivity`는 입력까지 그대로 유지한다.** 그것은 *사용자에게 무엇을 말할지*이고 이것은
*런타임이 무엇을 할지*다 — 이 문장은 처음부터 옳았고, 뒤에 붙어 있던 "다만 입력을
`SocketAuthSnapshot`에서 받는다"가 그 문장과 어긋났으므로 3단계 실행 시 철회했다. 근거 셋:

- **`AuthStatus`가 추가로 주는 입력이 배너에서 전부 같은 값으로 접힌다.** `hasToken`(로그아웃이면
  슬롯이 바인딩되지 않아 이미 `idle`→`online`) · `controller: 'expired'`(이미 `isVerified=false`→
  `reconnecting`) · `credentialMs`·`storedSessionExpired`(**사용자에게 할 말이 아니다** — 소켓은
  연결돼 있고 쓸 수 있다). `stale`은 `online`으로 매핑돼야 하므로 입력을 바꿔도 출력이 안 바뀐다.
- **`AuthStatus`는 구독 가능한 값이 아니다.** 배너는 지금 `manager.subscribe` 구독 하나로 반응한다.
  스냅샷을 쓰면 구독 셋(소켓 상태 · `subscribeKindVerified` · 세션 시그널)을 합성해야 하고, 하나를
  빠뜨리면 **배너가 조용히 멈춘다**.
- **축이 다르다.** 배너는 ACTIVE 슬롯을 묻고 스냅샷은 kind별이다. 합치려면
  `SocketManager.getActiveKind()`를 공개해야 하는데, 결정 6이 표면을 111→67로 줄인 직후에 그것을
  되돌리는 방향이다.

그래서 `deriveConnectivity`는 인증 판정의 **사본이 아니다** — 표시 판정이고, 원칙 6은 인증 판정에만
적용된다. 합치는 것이 옳아지는 시점은 배너가 `expired`를 구분해 다른 문구를 보여줘야 할 **UI 요구가
실제로 생길 때**다. 그때는 구독 배선 비용을 낼 이유가 생긴다.

### 2. 세션 통지는 타입 있는 시그널이다 — 그리고 유스케이스 1회 = fan-out 1회

payload 없는 전역 방송을 타입 시그널로 교체하고 **배치 경계**를 제공한다. 기존
[`session/store/signal.ts`](../../libs/app-runtime/src/session/store/signal.ts)의 어휘("session signal")를
그대로 쓰므로 새 개념어를 도입하지 않는다.

```ts
// session/store/signal.ts
export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';

export interface ISessionSignal {
    emit(kind: SessionSignalKind): void;
    subscribe(kinds: readonly SessionSignalKind[], listener: () => void): () => void;
    /** 중첩 가능. depth가 0으로 돌아올 때 모인 시그널을 한 번만 flush한다. */
    batch<T>(fn: () => T): T;
}
class SessionSignal implements ISessionSignal {}
export const sessionSignal: ISessionSignal = new SessionSignal();
```

- `switchCloudSession` · `reissueCommittedCloudTokens` · cloud/relay teardown은 `sessionSignal.batch`로
  감싼다 → 전환 통지 8 → **1**. 중간 상태는 관측 불가가 된다.
- `useRuntimeSocketSlots`는 `['relay:token','cloud:token','selection']`만 구독한다 → identity 전용 변경에
  재조립하지 않는다. 손으로 만든 동등성 게이트는 구조가 대신하므로 제거한다.
- 기존 `subscribeSessionSignal`은 전 종류 구독의 얇은 래퍼로 남긴다 — `useGlobalSession`의 호출부가
  바뀌지 않는다.
- **낙관적 전환의 3뷰(`selected`/`bound`/`committed` — §결정 8에서 개명)는 건드리지 않는다.**
  ADR-0070 결정 7은 유효하다 —
  합치는 것은 값이 아니라 *통지 시점*이다. 이것을 값 통합으로 읽으면 크로스 클라우드 캐시 오염이 돌아온다.
- 통지 정책의 일관성을 규약으로 고정한다: **쓰기 메서드는 예외 없이 자기 시그널을 emit한다.** 현재의
  불일치(`savePlaceOrder` 무통지 / `clearPlaceOrder` 통지, `setIdentityState` 무통지)는 버그로 취급한다.
  순수 캐시 쓰기(`setCachedCloudTokens`)만 예외이고, 그 예외는 이름으로 드러낸다.

### 3. 자격증명 갱신은 `ICredentialRenewer` 구현 2개이고, 스케줄러는 하나다

`libs/http`가 같은 문제를 푼 방식(`ICredentialRecoverer` + `NoCredentialRecovery` ·
`PortCredentialRecoverer`)과 같은 형태를 app-runtime 쪽에 둔다.

> **`Renewer`는 리포에 없는 새 단어다** (실측 0건 — `Recoverer` 9건은 `libs/http` 전용). 형태만 파생이다:
> `-er` 행위자 명사는 `ICredentialRecoverer` · `IAuthSigner` · `IFailureAttributor`가 쓰는 관례이고,
> `renew`는 이미 이 패키지의 동사다(`renewCloudSession`). `Recoverer`를 그대로 재사용하지 않는 이유는
> `libs/http`의 동명 계약과 독자가 헷갈리기 때문이다 — 그쪽은 요청 재시도를 위한 회복이고, 이쪽은 토큰
> 갱신이다.

```ts
// session/auth/renewers/credentialRenewer.ts
export interface ICredentialRenewer {
    readonly owner: CredentialOwner; // 'relay' | 'cloud' (기존 타입 재사용)
    timeToExpiry(now?: number): number | null; // credentialFreshness에 위임한다
    /** relay: Auth SDK auth.refresh · cloud: delegate-cloud + exchange-token + 소켓 재등록 */
    renew(): Promise<boolean>;
    /** relay: 로그아웃 · cloud: 클라우드만 이탈 */
    onTerminalExpiry(): Promise<void>;
}
```

`RelayCredentialRenewer` · `CloudCredentialRenewer` 두 구현을 둔다.

> **후속 (2026-09-08): relay `onTerminalExpiry`는 "로그아웃" 한 줄이 아니라 확인 창을 거친다.**
> 이 결정이 옮겨 담은 정책(터미널 `expired` → 자동 로그아웃)은 ADR-0076 이전부터 delegate 안에 있던
> 것이고, 옮기면서 그 전제를 다시 검사하지 않았다. 전제는 "`expired`는 고착된 서명을 뜻한다"인데
> 실제로는 **끊기는 링크의 연속 3회 실패**(`maxFailures`)도 같은 값을 낸다 — 이 문서가 인용한
> 부트스트랩 게이트의 주석이 이미 그렇게 적고 있었다("깨어난 직후 좀비 소켓의 요청 타임아웃"). 즉
> 런타임에서 세션을 끝낼 수 있는 유일한 자동 경로가, 다른 모든 회복 경로가 오프라인이면 손을 떼는
> 바로 그 상황에서 사용자를 로그아웃시켰다.
>
> 지금은 `navigator.onLine === false`면 보류하고(신뢰 가능한 부정 — §결정 1이 `deriveConnectivity`에
> 대해 쓴 것과 같은 비대칭), 온라인이면 30초 확인 창 뒤 상태를 **다시 읽어** 그때도 `expired`일 때만
> 로그아웃한다. 창 안에서 재연결의 첫 resume이나 포그라운드 재시드가 상태를 옮기면 세션은 유지된다.
> 창은 재시도 루프가 아니라 판정 유예이고(스케줄도 킥도 없다), 반복 보고는 결정 4의 `Coalescer`가
> 한 판정으로 합친다. 계약은 [`renewers.test.ts`](../../libs/app-runtime/src/socket/auth/renewers.test.ts)가
> 잠근다.

> **정정 (구현 후).** 초안은 `credentialFreshness`가 renewer로 **흡수된다**고 적었다. 그렇게 하지
> 않았다 — 그 싱글턴은 남고 두 renewer의 `timeToExpiry`가 거기에 위임한다. 소비자가 renewer만이
> 아니기 때문이다: `http/factory.ts`가 `SessionCredentialAdapter`에 그것을 주입하고
> `socket/auth/authStatus.ts`가 `AuthSignalDeps.freshness`로 받는다. renewer 안으로 옮기면 HTTP
> 레인이 `socket/auth`를 보게 되고, 그것이 §결정 3이 renewer를 `socket/auth`에 둔 방향 논거를
> 뒤집는다. 계산의 소유자는 `credentialFreshness`, 정책(무엇을 할지)의 소유자는 renewer다.

> **`useCredentialGuard` 병합은 철회한다 (5단계 실행).** "스케줄링 공통부만 합친다"고 적었지만
> 공통부가 거의 없다 — 두 가드의 **트리거 모델이 다르다**. relay 는 폴링이고(`setInterval` 30초 +
> `visibilitychange` + relay 검증 상승 엣지), cloud 는 자격증명의 `Expiration` 에서 sleep 을 파생하는
> **자가 무장 마감**이다(`setTimeout` + 상한/하한 clamp + 재시도 sleep). 남는 공통부는 `enabled`
> 가드와 `visibilitychange` 뿐이고, in-flight 공유는 결정 4의 `Coalescer` 가 이미 통합했다. 합치면
> `mode: 'interval' | 'deadline'` 스위치가 되는데, 그것이 ADR-0070 이후의 가드 주석이 거부한 형태
> 그대로다. 두 훅은 각자의 트리거를 유지하고, **공유하는 것은 renewer 다.**
> `sessionDelegate.onAuthExpired`는 `renewers[kind].onTerminalExpiry()` 한 줄이 되고,
> `configureCredentialRecovery`는 relay renewer의 `renew`를 등록한다.

> **ADR-0070 이후의 판단과 충돌하지 않는다 — 차이를 명시한다.** 거부된 것은 _한 함수 본문 안의 `kind`
> 스위치_(정책 둘이 한 스위치 뒤에 숨는 형태)다. 이 결정은 반대 방향이다: 정책을 **두 클래스로 갈라
> 타입으로 고정**하고, 양쪽에 복제된 타이머·visibility·in-flight 코드만 공유한다. 정책 분리는 주석에서
> 타입으로 승격되므로 강해진다. 관측 가능한 동작(마진 · 쿨다운 · 재시도 sleep · 실패가 teardown 스트릭에
> 계수되는지)은 **불변**이며, 그 불변성을 진리표 테스트로 잠근다.

기존 훅 이름·시그니처는 그대로다 — 앱 호출부(`apps/web` · `admin-v2` · `desktop-web`)가 바뀌지 않는다.

### 4. 동시성 가드는 `Coalescer`와 `Throttle` 둘이다

손으로 만든 7개는 **한 종류가 아니라 두 종류**다 — 5단계 실행이 확인한 정정이다.

- **코얼레싱**: 진행 중인 시도 하나를 동시 요청자가 공유하고, 모두 같은 답을 받는다.
  `RelayRefreshCoalescer`(3초 결과 메모) · `renewCloudSession` · `recoverUnverifiedSockets` ·
  keepAlive `runningRef` · staleness `inFlight`. 전부 Promise 를 돌려준다.
- **쓰로틀링**: 마지막 발사가 너무 최근이면 **아예 시작하지 않는다**. 호출자가 원하는 것은 값이 아니라
  허가이고, 거부는 "이번 트리거를 건너뛴다"다. staleness `forceRefresh` 60초 · 푸시 재등록 60초 ·
  종단 `expired` 재개 30초→5분 지수. 그중 마지막은 **Promise 조차 아니다** — 소켓 메시지 핸들러 안의
  동기 게이트다.

하나로 접으려면 Promise 를 돌려주는 모든 호출부에 `skipped` 센티널을 덧붙여야 하고, 비동기가 아닌
그 게이트는 여전히 담을 수 없다. 서로 무관한 회복 전략을 `kind` 스위치 하나로 접는 것과 같은 실수라
**두 프리미티브로 나눈다**: `Coalescer<T>` + `Throttle`.

```ts
// utils/coalescer.ts
export class Coalescer<T> {
    constructor(opts?: { memoMs?: number; cooldownMs?: number; backoff?: 'none' | 'exponential' });
    run(attempt: () => Promise<T>): Promise<T>;
    reset(): void; // 테스트 이음매 — 케이스가 이전 케이스의 답을 물려받지 않게
}
```

`bootstrapSocketConnection`의 지수 백오프(종단 `expired` 재개 쓰로틀)는 `backoff: 'exponential'`로
표현한다. 그 값(초기 30초 · 상한 5분 · `authenticated`에서 리셋)은 2026-08 감사 §5-1이 정한 것이므로
**숫자를 바꾸지 않는다.** 각 도메인의 `*Attempt` 클래스(`RelayRefreshAttempt`)는 그대로 남는다.

### 5. `session/auth/services.ts`를 클래스로 재구성한다

접미사는 리포에 없는 `*Service`(libs 실측 0건)가 아니라,
[`ActiveScope`](../../libs/app-runtime/src/session/scope/ActiveScope.ts)처럼 **개념 명사 그대로**다.
`*Manager`도 쓰지 않는다 — ADR-0070이 "엔진은 넷"으로 고정한 이름이라 두 개를 더 붙이면 그 경계가 흐려진다.

> `*Session`으로 끝나는 클래스·인터페이스는 리포에 아직 없다. 근거는 `ActiveScope`의 **형태**(접미사 없는
> 개념 명사) 하나이고, 단어 자체는 이미 명사구로 흔하다 — `CloudSessionSnapshot` · `switchCloudSession` ·
> `initializeRelaySession` · `logoutRelaySession`. 그 명사구를 클래스로 승격하는 것이므로 새 어휘는 아니다.

| 인터페이스 / 클래스                                   | 파일                                 | 소유                                                                            |
| ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `IRelaySession` / `RelaySession`                      | `session/auth/relaySession.ts`       | `initialize` · `loginAs*` · `applyToken` · `logout` · `clearSessionAndRedirect` |
| `ICloudSession` / `CloudSession`                      | `session/auth/cloudSession.ts`       | `switchTo` · `leave` · `applySelectedSite` · `reissueCommitted`                 |
| `SessionAuthAdapter implements SocketSessionDelegate` | `session/auth/sessionAuthAdapter.ts` | Auth SDK 브리지 — seed · sign · writeback · expiry                              |
| 순수 함수                                             | `session/auth/utils/tokenMerge.ts`   | `mergeRefreshedRelayToken` · `mergeRefreshedCloudToken`                         |

`SessionAuthAdapter`의 접미사 근거는 [`SessionCredentialAdapter implements CredentialStalenessPort`](../../libs/app-runtime/src/http/factory.ts)다
— 같은 패키지에서 세션 상태를 포트에 맞춰 주는 클래스에 이미 쓰고 있는 이름이다. `*Impl`은 리포에 0건이다.

`commitServerRefreshedToken`은 73줄 중 45줄이 **필드 보존 불변식 3개**(`identityToken` ·
`identityPoolId` · `credential`)의 근거 주석이다. 이것을 `mergeRefreshedRelayToken`으로 분리해 불변식
하나당 테스트 하나를 붙인다 — 지금은 주석만이 그 불변식을 지킨다. 클래스가 아니라 함수인 이유는 순수
헬퍼의 리포 관례(`calcSignature` · `deriveConnectivity` · `msUntilExpiration`)를 따르기 때문이다.

스토어 3형제도 같은 규칙으로 정리한다 — 인터페이스 이름만 관례로 옮기고(`RelayCore` → `IRelayStore`),
클래스를 붙이고, **싱글턴 이름(`relayStore` · `cloudStore` · `identityStore`)과 파일명은 그대로 둔다**.
호출부가 바뀌지 않는다.

### 6. 공개 표면은 `index.ts`에서 내리는 것으로 충분하다

- 앱이 쓰지 않는 31개를 루트 배럴에서 제거한다 (앱 코드 변경 0).
- **두 번째 배럴(`internal.ts`)이나 서브패스 export는 만들지 않는다.** 리포의 어떤 lib도 `.`과
  `./package.json` 외의 subpath를 노출하지 않으므로 새 패턴이 되고, 필요도 없다 — 내부 소비자는 이미
  구체 모듈 경로로 import하는 관례가 있다([`useSocketSessionDelegate.ts`](../../libs/app-runtime/src/connection/useSocketSessionDelegate.ts)가
  배럴을 우회해 `../socket/auth/sessionDelegate`를 직접 잡는 것이 그 선례다). "내부"의 정의는 **`index.ts`에
  없다**는 것이고, `public-surface.test.ts`의 `EXPECTED` 단일 목록이 그것을 그대로 잠근다.
- 표면 스캔(공개 심볼 × 앱 참조)을 테스트로 승격해 미사용 export가 다시 쌓이지 않게 한다.

`patchRelaySessionUser` / `getRelaySessionUser`는 예외로 **공개 표면에 남긴다** — 계정 프로필의 읽기·쓰기
짝이고 [로컬 캐시가 답할 수 없는 질문](../../libs/app-runtime/src/session/store/contextStore.ts)이라는
근거가 문서화돼 있으며, `apps/web`이 실제로 쓴다(ADR-0062).

### 7. 이름 충돌을 제거한다 — 공개되는 것은 강한 판이다

`session/auth`의 약한 판은 클래스 메서드로 들어가면서 전역 이름을 잃는다 —
`relaySession.clearSessionAndRedirect()` · `cloudSession.clearStores()`. 동사는 리포의 `clear*`
계열(`clearSession` · `clearToken` · `clearIdentity` · `clearSelectedSite`)을 따른다. 루트 배럴이
공개하는 `logoutSession` · `logoutCloudSession`은 소켓 통지를 포함한 `socket/auth` 판에만 부여한다.

`apps/admin-v2`의 `useRelaySessionGuard` teardown은 강한 판으로 옮긴다 — **이 ADR에서 앱 코드가 바뀌는
유일한 지점이다.**

### 8. 스코프 세 뷰의 첫 이름을 `selected`로 바꾼다 (ADR-0070 결정 7의 어휘 갱신)

ADR-0070 결정 7은 낙관적 전환의 세 뷰를 `intent` · `bound` · `committed`로 이름 붙였다. 그 **구조는
유효하고 이 ADR도 유지한다**(§결정 2) — 바꾸는 것은 첫 뷰의 이름 하나다.

| 지금                             | 바꿀 이름                          |
| -------------------------------- | ---------------------------------- |
| `ActiveScope.get intent`         | `get selected`                     |
| `ActiveScope` ctor `readIntent`  | `readSelected`                     |
| `deriveIntent()`                 | `deriveSelectedContext()`          |
| `session/scope/intent.ts`        | `session/scope/selectedContext.ts` |
| `DataManager`의 `intentProvider` | `selectedContextProvider`          |

근거 둘:

- **리포가 이 개념을 부르는 말이 이미 `selected`다** — `getSelectedCloudId` · `getSelectedSiteId` ·
  `applySelectedSite` · `clearSelectedSite` · `selectedCloudId` · `selectedSiteId` ·
  `useSessionSelection` · `CLOUD_SELECTED_*` 키. §결정 2가 도입하는 `SessionSignalKind`에도 이미
  `'selection'`이 있다. 반면 `intent`는 스코프 뜻으로 **3파일**에만 있고, 리포의 다른 `intent` 등장은
  전부 **안드로이드 `Intent`**(딥링크 — `apps/mobile` · `apps/landing` · `docs/DEEP-LINKING*`)라 검색이
  섞인다.
- **세 뷰의 품사가 나란해진다.** `selected` / `bound` / `committed`는 전부 "이 값에 무슨 일이
  일어났는가"를 말하는 과거분사다. `intent`만 명사여서 셋을 한 줄로 읽을 때 축이 어긋났다.

`deriveSelectedScope`가 아니라 `deriveSelectedContext`인 이유: 스코프는 `ActiveScope` 자신이고 이 셋은
그 **뷰**이므로 `Scope`를 쓰면 소유자 이름과 겹친다. 돌려주는 값이 `DataContext`라 `*Context`(리포 14건)가
맞는 접미사다.

반경은 작다 — 코드 4파일 + 테스트 1개이고 **앱은 0곳**, `@chatic/data`도 이 이름을 모른다. 동작 변화가
없으므로 0단계(배치 A)에 넣는다.

## 최종 구조 (Target Structure)

`libs/app-runtime`의 아키텍처 문서를 이 결정을 반영해 **새로 썼다** — 상세 구조 · 다이어그램 · 시나리오 ·
네이밍 규약 · 검증 방법의 SSoT는 [`libs/app-runtime/docs/architecture.md`](../../libs/app-runtime/docs/architecture.md)
하나다. 신규 문서는 `architecture-v2.md`로 작성해 구현 완료 시점에 기존 문서의 참조 섹션을 흡수한 뒤
그 파일명을 물려받았다(§실행 기록 정정 7).

## 단계 (Phasing) · 실행 기록

단계 구분의 기준은 **되돌리기 비용**이었다. 0~2는 앱을 건드리지 않고 언제든 되돌릴 수 있고, 3부터
판정·통지 경로가 바뀐다. 전부 실행됐고 커밋은 브랜치 `claude/app-runtime-auth-architecture-31b5a3`
(`76a601410` 위)에 있다.

| 단계 | 내용                                                      | 커밋                                    | 앱 영향      |
| ---- | --------------------------------------------------------- | --------------------------------------- | ------------ |
| 0    | 죽은 코드 · 중복 쓰기 · 낡은 주석 · `intent`→`selected`   | `9e8a1b107`                             | 없음         |
| 1    | 결정 7 — 이름 충돌 제거                                   | `df897adec`                             | admin-v2 1곳 |
| 2    | 결정 6 — 배럴 정리                                        | `e38be8c98` · 리뷰 반영 `ccbb35fb2`     | 없음         |
| 3    | 결정 1 — `deriveAuthStatus` 도입 + 판정 사본 2개 이관     | `cbbe94c7e` · `81e44162e`               | 없음         |
| 4    | 결정 2 — `ISessionSignal` + `batch`                       | `07fc8e57a` · `3d1f161f1`               | 없음         |
| 5    | 결정 3·4 — renewer 2개 + `Coalescer`/`Throttle`           | `62f08eaf8` · `aa3ba989d` · `b06c6951f` | 없음         |
| 6    | 결정 0·5 — 스토어·세션 클래스화, 슬롯 파생 이관           | 아래 5개                                | 앱 4개       |
| 7    | 소비자 0인 표면·중복 이름 정리, `ServiceUnavailable` 폐기 | `782135f6b`                             | 없음         |
| 8    | **미사용 전수 스윕** — 아래 §8단계                        | (이 커밋)                               | 없음         |

6단계 내부 (가장 큰 단계라 조각별로 커밋했다):

| 조각                                           | 커밋        |
| ---------------------------------------------- | ----------- |
| 스토어 3형제 클래스화 + `ISocketManager` 4분할 | `bbc5cd6e0` |
| 토큰 병합 불변식 추출                          | `125c4c152` |
| `SessionAuthAdapter` 추출                      | `769eced0f` |
| `CloudSession` 추출                            | `703060f76` |
| `RelaySession` 추출 + `services.ts` 삭제       | `0069b3fcf` |
| 호스트가 슬롯을 파생 (lib)                     | `c585520a7` |
| 앱 4곳 보일러플레이트 제거                     | `3e31eacf3` |
| 슬롯 훅의 부분집합 구독                        | `45f258a9c` |

**실행이 계획을 정정한 것 9건.** 계획서가 아홉 번 틀렸고 매번 실행이 잡았다. 넷은 **철회 판단**이라
따로 적어 둘 값이 있다 — 억지로 하나로 만들면 회귀가 되거나, 만들어 두고 소비자가 안 생기는 경우다.

| #   | 계획                                      | 실제                                                                                                                                  |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 만료 계산을 `auth/utils/expiry.ts`로 통합 | `store/expiry.ts`로. 스토어 수동성 eslint가 `store/**` → `../auth`를 막아 방향상 store 쪽만 가능하다                                  |
| 2   | 앱 미사용 공개 표면 31개                  | **32개**. `setSessionAuthenticated`의 앱 '참조'가 주석 한 줄이었다                                                                    |
| 3   | `AuthStatus`에 `wedged` 포함              | 제외 — 5값. "미검증 지속"은 시간 축이 필요해 읽기 전용 투영으로 파생할 수 없다                                                        |
| 4   | 인증 판정 사본 4곳 이관                   | **2곳**. `useConnectivity`는 표시 판정, relay 가드는 두 시계를 다른 정책으로 쓴다 (**철회**)                                          |
| 5   | 동시성 가드 7 → 1                         | **7 → 2**. 코얼레싱(값 공유·Promise)과 쓰로틀링(허가·동기 게이트)은 다른 메커니즘이다                                                 |
| 6   | 두 가드를 `useCredentialGuard` 하나로     | **철회.** relay는 폴링(30초 + 검증 엣지), cloud는 `Expiration`에서 파생한 자가 무장 마감 — 합치면 `mode` 스위치다                     |
| 7   | 기존 `architecture.md`를 그냥 삭제        | **병합.** 그 문서에만 있던 §책임 분리·§조립·§외부 사용 규칙·§모듈 구조를 옮긴 뒤 삭제했다 (아래)                                      |
| 8   | `ISocketManager`를 4개 인터페이스로 분할  | **철회.** 넷 다 소비자 0이고 바로 다음 줄에서 재합성됐다 — 결정 6이 내리기로 한 범주를 새로 만든 것이라 그룹 주석만 남겼다 (**철회**) |
| 9   | 공개 값 export 110 → 78                   | **111 → 67**. 기준선을 하나 덜 셌고 2단계 중간값을 최종값으로 적었다 (궤적은 §결정 6의 정정 노트)                                     |

7번은 §최종 구조가 놓친 것이다. v2 문서는 **바뀌는 것**만 상세히 적었고, 엔진별 책임·부팅 순서 계약·
모듈 트리는 기존 문서에만 있었다 — 그대로 지우면 그 참조가 사라진다. 인바운드 링크도 계획서가
19개/13파일로 셌지만 실측 **15개/10파일**이었다(logger 2 · data 2는 각자 **자기** `architecture.md`를
가리키는 자기 링크였다). 파일명을 그대로 물려받았으므로 링크 경로는 하나도 바꿀 필요가 없었고, 실제로
고칠 것은 설명 문구와 v2를 "Proposed 개정안"으로 소개하던 줄이었다.

### 8단계 — 미사용 전수 스윕 (2026-09-07, 사용자 지시)

앞 단계들이 **코드량을 늘렸다**는 지적을 받아 전수 스윕을 다시 돌렸다. 7단계와 다른 점은 축이다 —
7단계는 *공개 표면*을 앱 import 기준으로 셌고, 8단계는 *패키지 내부의 모든 export 선언과 클래스
public 메서드*를 리포 전체 참조 기준으로 셌다.

방법: `export const|class|interface|type` 선언 **260개**와 4-스페이스 들여쓰기 public 메서드
후보 **191개**를 뽑아, 각 이름의 참조를 `git ls-files` 소스 전체에서 세고 자기 선언 파일 ·
테스트 · 배럴을 분리했다. 아무도 import하지 않는 **파일**도 따로 셌다(0건).

**지운 것**

| 대상                                                                                   | 근거                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useProfileSync`                                                                       | 앱 소비자 0(테스트만). 2026-09 스윕이 "가족이 깨진다"며 유지했는데 **그 근거의 전제가 틀렸다** — 가족의 한 명 `useJoinSync`는 존재한 적이 없다 (§아래) |
| `ISocketSlotLifecycle`·`ISocketTransport`·`ISocketObservability`·`ISocketScope`        | 넷 다 소비자 0이고 다음 줄에서 재합성. 정정 8번                                                                                                        |
| `configureRelayEndpoints`                                                              | `@deprecated` 이름 보존 래퍼. 유지 근거가 "`configure.ts`가 안 바뀐다"뿐이었고 호출부는 그 한 곳                                                       |
| `readAuthSignals` · `createDataRuntime` · `createSocketRuntime` + 스토리지 키 상수 8개 | 리포 전체 참조 0인데 `export`돼 있었다 — 선언은 남기고 `export`만 걷었다 (동작 무변)                                                                   |

**유지한 것과 이유**: 테스트 시임 4개(`resetGateways`·`resetNativeCacheSupport`·
`resetRelayRefreshCoalescing`·`getDataRuntime`)는 테스트가 실제로 import한다. `I*Store`·
`ICloudSession`·`IRelaySession`·`ISessionAuthAdapter`·`ICredentialRenewer`는 외부 참조가 0이지만
결정 0이 요구한 계약이고 생성자 주입의 타입이라 남긴다. Props 인터페이스 3개는 React 관례다.
`jsonSlot`·`Coalescer`·`Throttle`·`deriveAuthStatus`는 실사용처를 셌다(각 4·7·2곳).

**`useJoinSync` — 문서가 만든 유령.** `apps/web/docs/architecture/data-flow.md`와 2026-09 스윕이
동기화 훅 "5형제"(`useChatSync`/`useChannelSync`/`usePlaceSync`/`useProfileSync`/`useJoinSync`)를
적어 뒀는데, `useJoinSync`는 **리포에 정의가 0이다**. 실물은 앱 레이어의 `useJoinSyncRegistration`
(`apps/web/src/app/hooks/useMyJoins.ts:28`)이고 그것은 훅으로 감싼 것이 아니라
`syncManager.registerJoin()`을 직접 부른다. 즉 app-runtime이 주는 훅은 처음부터 **3형제**였고,
`useProfileSync` 유지의 근거였던 "대칭"은 문서 안에만 있었다. 두 문서를 정정했다.

**정직하게 남기는 것: 코드량은 여전히 늘었다.** 8단계가 걷은 것은 100줄 남짓이고, 이 트랙 전체는
프로덕션 코드를 **+818줄(+11%)** 늘렸다(측정 표). 늘어난 곳은 §결정 0이 요구한 인터페이스+클래스

- 생성자 주입(services.ts 539 → 4파일 729)과 새 메커니즘 5개다. 줄어든 것은 줄 수가 아니라
  **공개 표면(111 → 67)** · **통지 fan-out(8 → 1)** · **판정 사본(2 → 1)**이다. 이 교환이 값을
  했는지는 §결과의 "감수하는 것"과 함께 읽어야 한다.

## 대안 (Alternatives)

**(a) 아무것도 하지 않는다 — 문서를 더 쓴다.** 지금 구조의 정당화 주석은 이미 코드보다 길다
(`useSessionStalenessGuard` 228줄 중 100줄이 주석). 산문을 더 얹는 것은 §맥락 1의 7개 원천을 줄이지
않으므로, 다음 장애 때도 사람이 7개를 손으로 맞춰야 한다.

**(b) 상태를 하나로 합친다 — `selected`/`bound`/`committed`를 단일 값으로.** 기각. ADR-0070 결정 7의
근거가 그대로 유효하다(낙관적 전환이 깨지고 크로스 클라우드 캐시 오염이 돌아온다). 이 ADR은 **판정과
통지 시점**만 통합하고 값은 건드리지 않는다.

**(c) 판정을 구독 가능한 리액티브 스토어로 만든다.** 기각(현 라운드). 판정의 입력이 이미
각자 구독 가능하고(`subscribeKindVerified` · `sessionSignal`), 또 하나의 구독 가능한 사본을 만들면
§맥락 1이 부른 "토큰 사본 3벌"의 판정 버전이 된다. **읽기 전용 투영**으로 두고, 반응성은 기존 구독에서
얻는다 — `credentialFreshness`가 이미 그 형태다.

**(d) 두 가드를 완전히 합친다(`kind` 파라미터).** 기각 — ADR-0070 이후의 판단 그대로. 결정 3의 각주가
renewer 안과의 차이를 명시한다.

**(e) 새 접미사를 도입한다(`*Service` · `*Strategy` · `*Impl`).** 기각. 리포 실측 0건이고, 이름은
경계를 읽는 첫 신호다. 이미 55쌍이 지키는 `I*`+클래스 관례를 따르는 쪽이 새 독자에게 싸다.

## 결과 (Consequences)

**좋아진 것**

- 인증 상태에 이름이 붙었다(`AuthStatus` **5값** — `wedged`는 파생 불가라 빠졌다). 로그·오버레이·가드가
  같은 어휘를 쓰므로 장애 재현이 "status가 무엇이었나" 하나로 좁혀진다.
- 클라우드 전환의 관측 가능한 중간 상태가 7개 → 0개. 리렌더 fan-out 8회 → 1회.
- 동시성 질문("두 번 발사되나?")이 파일 7개 읽기 → 클래스 2개 읽기.
- ADR-0070 §0이 세션 허브에서도 성립한다 — 예외가 없어졌으므로 원칙이 규칙이 됐다.
- 공개 값 export 111 → 67. 스토어 직접 쓰기 금지가 문서에서 타입으로 승격됐다.
- 스토어 인터페이스에서 `*Core`(web-core 잔재)가 사라져 리포 전체가 한 가지 명명 규칙을 갖는다.
- 스토어가 생성자 주입을 받으므로 가짜 스토리지로 테스트할 수 있다.

**감수하는 것**

- 3~5단계가 인증 경로의 판정을 옮겼다. 회귀 형태는 "조용한 오작동"(갱신이 안 도는데 UI는 정상)이므로,
  각 판정 이관은 기존 사본을 지우기 전에 진리표 테스트로 같은 답을 확인한 뒤 지웠다. 그래도 **실기기
  검증 3건은 자동화 밖**이다 — architecture.md §검증 방법의 수동 확인 포인트.
- 각 호출부의 타이밍 상수(메모 3초 · 쿨다운 60초 · 지수 30초~5분)를 두 프리미티브에 위임했다. 값은
  옮기되 바꾸지 않았고, 정책은 호출부에 남겼다.
- `apps/desktop-web` 을 이 트랙에서 건드렸다 — 사용자가 명시적으로 포함시켰다. 착수 시 미커밋 작업이
  없음을 확인했고 tsc 오류는 17건으로 기준선과 동일하다.
- **호출 방법이 하나로 줄었다.** 이름 보존 래퍼 12개 중 10개를 지웠고, 내부 호출부는 전부
  `relaySession.x()` / `cloudSession.x()` 다. 남은 둘은 앱 표면이라 의도된 것이다(§열린 질문 6).
  대신 테스트 목이 싱글턴 객체 모양(`{ relaySession: { … } }`)이 됐다 — 함수 하나를 목킹하던 것보다
  한 줄 길다.

**측정 (구현 후 실측)**

| 항목                                  | 이전                 | 이후                      |
| ------------------------------------- | -------------------- | ------------------------- |
| `notifySessionStateChanged` 호출      | 24                   | **0** (`emit(kind)` 대체) |
| 클라우드 전환당 fan-out               | 8                    | **1**                     |
| 인증 판정 분기 사본                   | 2                    | **1**                     |
| 손제작 동시성 가드                    | 7                    | **2**                     |
| 공개 값 export                        | 111                  | **67**                    |
| `session/auth/services.ts`            | 539줄                | **삭제**                  |
| relay 토큰 파싱 (1회 파생당)          | 3                    | **1**                     |
| jest (app-runtime)                    | 54스위트 / 472케이스 | **62스위트 / 515케이스**  |
| 리포 관례 밖 이름                     | 3                    | **0**                     |
| 프로덕션 파일 (`src/**`, 테스트 제외) | 113                  | **119** (+6)              |
| 프로덕션 줄 (같은 범위)               | 7,771                | **8,589** (+818, +11%)    |

최초 계획의 숫자 중 넷은 실행이 정정했다(31→32 · 판정 4→2 · 가드 7→1이 아니라 7→2 · `AuthStatus`
6값이 아니라 5값). §실행 기록의 정정 표가 전문이다.

## 열린 질문 (Open Questions)

구현 후 상태로 갱신했다. **1·2·5·6·7은 이 트랙에서 답이 났고**(취소선), 3·4는 제품·백엔드
입력이 필요해 열려 있고, 8은 측정만 끝내 판단을 넘긴다.

1. ~~`session/architecture.md`를 흡수할지.~~ **유지로 결정.** 흡수한 것은 기존 `architecture.md`의
   참조 섹션뿐이다. 세션 허브 상세는 하위 문서로 남긴다 — 새 `architecture.md`가 900줄을 넘었고, 그
   문서의 §책임 분리 1이 "상세는 session/architecture.md가 SSoT"로 넘긴다.
2. ~~`useSessionStalenessGuard`/`useCloudCredentialGuard` 병합.~~ **철회.** 5단계 실행이 두 가드의
   트리거 모델이 다르다는 것을 확인했다 — relay는 폴링(30초 + 검증 상승 엣지), cloud는 자격증명 자신의
   `Expiration`에서 파생한 자가 무장 마감. 공통부는 `enabled`와 `visibilitychange` 뿐이고, 합치면
   `mode` 스위치가 되는데 그것이 ADR-0070의 가드 주석이 이미 거부한 형태다. 두 이름 모두 남는다.
3. **디바이스 id의 물리 원천.** 0단계가 죽은 쓰기(`persistDeviceId`의 생 `localStorage`)를 지웠으므로
   writer는 둘이다. "웹에서 디바이스 id가 탭 세션 단위인 것이 의도인가"는 여전히 열려 있다 — 푸시 등록과
   소켓 신원이 같은 id를 써야 한다는 계약에 걸린다.
4. **`expiresIn` 서버 보고.** `AUTH_OPTIONS.refreshIntervalMs = 5분`은 서버가 `expiresIn`을 주지 않아서
   쓰는 폴백이고, 두 renewer의 마진 5분도 거기서 파생됐다. 서버가 보고하기 시작하면 마진의 근거가 바뀐다 —
   ADR-0070 §열린 질문과 같은 대기 항목.
5. ~~`Coalescer`의 최종 위치.~~ **`libs/app-runtime/src/utils/` 유지.** `@chatic/shared`로 올리는 것은
   소비자가 이 패키지 밖으로 나갈 때 하면 된다. 지금 7곳 전부 app-runtime 안이다.
6. ~~래퍼 12개의 정리 시점.~~ **12 → 2로 정리했다.** 판단 근거는 리포 실측이다: 이 패키지의
   `I*` + 클래스 + camelCase 싱글턴 모듈 6개 중 **4개는 싱글턴만 export**한다
   (`credentialRecovery` · `credentialFreshness` · `sessionAuthAdapter`, 그리고 `signal.ts` 의
   `subscribeSessionSignal` 은 모양이 다른 진짜 편의 함수다). 이름 보존 래퍼 다발은 관례가 아니라
   **예외**였고, 존재 이유가 "이관을 순수 경로 rename으로 만들기"였으므로 이관이 끝난 지금은 근거가
   없다. 내부 소비자 11곳을 메서드 호출로 옮기고 9개를 지웠다.

    남은 둘은 `createCredentialsByProvider` 와 `registerSessionLogoutCallback` 이다. 호출자가 앱이고
    **앱이 싱글턴을 들면 안 된다** — 앞은 OAuth 리다이렉트 페이지의 이펙트, 뒤는 로그 업로더의 모듈
    초기화라 둘 다 React가 아니어서 훅으로 감쌀 수도 없다. 앱이 클래스 메서드를 직접 부르게 하려면 공개 표면 개명이 필요하고, 그것은
    이 트랙의 목적 밖이었다. 다음 라운드에서 판단한다.

7. ~~`session/store/expiry.ts` 의 위치.~~ **`store/` 유지로 결정.** 소비자는 둘이고 한쪽이 스토어다
   (`store/cloudStore.ts` 의 캐시 만료 판정 · `auth/credentialFreshness.ts`). 스토어 수동성 eslint가
   `store/** → ../auth` 를 막으므로 둘이 함께 물 수 있는 위치는 `store/` 뿐이고, 규칙을 바꿀 이유는
   순수 함수 하나의 개념적 소속감보다 약하다. 소비자가 셋을 넘고 그중 스토어가 없어지면 다시 본다.

8. ~~`ServiceUnavailable` 클러스터.~~ **기능 폐기로 확정, 삭제했다** (사용자 결정 2026-09-07).
   2026-09 스윕 §4-1이 제시한 (b)안이다. 도달 불가가 실측으로 확인됐다: `setServiceUnavailable`
   호출자 0이라 플래그가 켜질 경로가 없고(도입 커밋의 5xx 감지 지점은 web-core refresh 체인이었고
   ADR-0070이 그 체인을 지웠다), `apps/web` 의 `ServiceUnavailableOverlay` 도 `ada4e9b78` 에서
   `app.tsx` 마운트가 빠져 고아였다. 지운 것은 훅 3심볼 · 오버레이 컴포넌트 · 배럴 3곳 ·
   `jest.config.js` 주석 · `ko`/`en` 번역 키다.

    > **정정.** 이 항목의 초판은 "번역 키도 없다"를 세 번째 근거로 적었다 — 틀렸다. 키는
    > `apps/web/public/locales/{ko,en}/translation.json` 에 있었고(내가 `libs/i18n-mobile` 과
    > `apps/web/src` 만 찾았다), 삭제 대상에 포함했다. 도달 불가 근거는 둘이다.
