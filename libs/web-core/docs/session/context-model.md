# Session Context Model

## 목적

전역 세션 스냅샷을 구성하는 세션 컨텍스트를 정의합니다(`libs/web-core/src/session/types.ts` 기준).

외부 계약:

- 소비자는 `getGlobalSessionContext()`(또는 `useGlobalSession()`)를 읽습니다.
- session 계층은 relay/cloud/identity raw 상태를 어떻게 조합하는지 숨깁니다.
- 모든 상태 전이는 `session/services`가 처리합니다.
- 모든 저장 책임은 `...Core`가 가집니다.
- core 상태가 바뀌면 변경이 hook까지 전파됩니다.

## Global Shape

```ts
interface GlobalSessionContext {
    relay: RelayContext;
    cloud: CloudContext;
    identity: IdentityContext;
    activeServer: ActiveServerContext;
}
```

runtime 상태(`isInitialized`/`isAuthenticated`/`error`)는 별도 필드가 아니라 **`IdentityContext` 안에** 들어 있습니다. 스냅샷은 `contextStore.getGlobalSessionContext()`가 요청 시 조립하고 메모이즈합니다(core 변경 시 무효화).

## 책임 분리

### session/services

상태 전이를 담당합니다: initialize, login(guest/user/social), cloud switch(invite 진입 포함, `switchCloudSession`으로 일원화), relay/cloud token refresh(서비스 레벨 single-flight), site 전환 refresh, logout, device id 저장.

### ...Core (raw 저장)

- `cloudCore`: cloud token, delegation token, selected cloud, selected site, per-cloud place order, invited-bundle key
- `relayCore`: relay token(인증 앵커), relay selected site. endpoint(`backend`/`wss`)는 transport 헬퍼에 위임
- `identityCore`: **`delegatorId`, `deviceId`, `registeredDeviceToken`만** 저장

### identityCore가 저장하는 것 / 안 하는 것

저장: `delegatorId`(게스트 자신의 uid, 초대 수락용), `deviceId`, `registeredDeviceToken`.

**저장하지 않음**(과거 문서가 나열했으나 코드에서 제거됨): `relayProfile`/`cloudProfile`/`activeProfile`, `oAuthProvider`, `isInvited`, `isGuest`, `userRole`, `userType`, `permissions`, `userId`.

- 프로필 payload(`UserProfile$`)는 어디에도 저장하지 않습니다 — raw 토큰만 보관하고, profile fact는 app 레이어 `useProfileFacts`가 캐시에서 추적하며 active 토큰 user 필드(`getActiveSessionUser`)로 동기 seed합니다.
- invited-ness는 캐시된 cloud(`cloudType: 'invited'`)에, OAuth provider는 더 이상 session 상태가 아닙니다.

### contextStore

단순 저장소가 아니라 context assembler이자 조회 진입점입니다. `relayCore`/`cloudCore`/`identityCore` + 모듈 스코프 `identityState`(runtime 플래그)를 읽어 `GlobalSessionContext`를 조립하고, 외부 getter/hook이 읽을 read model을 제공합니다.

## 상태 전파

core나 `identityState`가 바뀌면 `notifySessionStateChanged()`(`session/utils.ts`)가 캐시를 무효화하고 리스너에 알립니다. hook은 `subscribeSessionSignal`을 `useSyncExternalStore`로 구독하므로, 전이 후 `useGlobalSession()` 등이 최신 스냅샷을 관측합니다.

## RelayContext

```ts
interface BaseServerContext {
    backend: string | null;
    wss: string | null;
    identityToken: string | null;
    siteId: string | null;
}
interface RelayContext extends BaseServerContext {
    isAuthenticated: boolean;
}
```

source of truth (`buildRelayContext`):

- `backend`/`wss` → transport 헬퍼(`getDynamicRelayBackend/Wss`)
- `identityToken` → `relayCore.getIdentityToken()`
- `siteId` → `relayCore`
- `isAuthenticated = !!relayCore.getRelayToken()` — **토큰 존재 기반 coarse auth**(프로필 아님)

relay endpoint는 runtime에서 결정되며 cloud로부터 유도되지 않습니다. relay `siteId`도 refresh(`target = uid@sid`) 결과로 바뀔 수 있습니다.

## CloudContext

```ts
interface CloudContext extends BaseServerContext {
    cloudId: string | null;
    delegationToken: CloudDelegationTokenView | null;
    cloudToken: UserTokenView | null;
    isActive: boolean;
}
```

source of truth: `cloudCore`의 selected cloud/site, delegation token, cloud token. `backend`/`wss`는 delegation token에서, `identityToken`은 cloud token에서 유도.

활성화 규칙(`buildCloudContext`): `cloudId && cloudId !== 'default' && backend && wss && identityToken`이 모두 참일 때만 `isActive`.

## IdentityContext

```ts
interface IdentityContext {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: Error | null;
    userId: string | null;
    delegatorId: string | null;
}
```

- `userId` — active 세션 토큰(`getActiveSessionToken().uid ?? .id`)에서 파생. cache observe용.
- `delegatorId` — `identityCore.getDelegatorId()`.
- `isInitialized`/`isAuthenticated`/`error` — runtime 플래그(모듈 스코프 `identityState`). `isInitialized`는 `useInitWebCore` 게이팅과 연결되고, `isAuthenticated`는 relay 기준 coarse auth입니다.

프로필/역할/권한 필드는 여기 없습니다 — app 레이어에서 파생합니다(`types.ts` 헤더 주석).

## ActiveServerContext

request/socket이 붙어야 하는 현재 대상 서버(discriminated union):

```ts
type ActiveServerContext =
    | { kind: 'relay'; backend: string; wss: string; siteId: string | null; identityToken: string | null }
    | { kind: 'cloud'; cloudId: string; siteId: string | null; backend: string; wss: string; identityToken: string };
```

계산 규칙(`resolveActiveServerContext`): cloud가 active이면 cloud, 아니면 relay.

## cid / sid / uid 출처

- **cid** — `cloudCore` selected cloud(`getSelectedCloudId()`, 기본 `'default'`).
- **sid** — active cloud에 따라 라우팅(`getSelectedSiteId()`: cloud가 `default`면 relayCore, 아니면 cloudCore). `activeServer.siteId`가 이를 반영.
- **uid** — 별도 저장이 아니라 active 세션 토큰(`token.uid ?? token.id`)에서 파생.

## 관련 문서

- [README.md](./README.md) — session 계층의 역할과 경계
- [public-api.md](./public-api.md) — 공개 세션 API 계약
- [session-scenarios.md](./session-scenarios.md) — 전이 service 시나리오
