# Session Context Model

## 목적

전역 세션 스냅샷을 구성하는 세션 컨텍스트를 정의합니다.

의도한 외부 계약은 다음과 같습니다.

- 소비자는 `getGlobalSessionContext()`를 읽습니다
- session 계층은 relay, cloud, identity raw 상태를 어떻게 조합하는지 외부에 숨깁니다
- 모든 세션 관련 기능 요청은 `session/services`에서 처리합니다
- 모든 저장 책임은 `cloudCore`, `relayCore`, `identityCore`, 기타 `...Core`가 가집니다
- 각 `core`의 상태가 바뀌면 변경이 hooks까지 전파되어야 합니다

## Global Shape

```ts
interface GlobalSessionContext {
    relay: RelaySessionContext;
    cloud: CloudSessionContext;
    identity: IdentityContext;
    runtime: SessionRuntimeContext;
    activeServer: ActiveServerContext;
}
```

권장 스펙은 위 구조이지만, 현재 구현은 `libs/web-core/src/session/types.ts`에서 `runtime`을 별도 분리하지 않고 `IdentityContext` 내부에 함께 가지고 있습니다.

## 책임 분리

### session/services

세션 관련 기능 요청을 담당합니다.

- initialize
- logout
- cloud switch (invite 진입 포함, `switchCloudSession`으로 일원화)
- relay/cloud token refresh (서비스 레벨 single-flight)
- relay/cloud site 전환을 포함한 refresh
- device id 저장 (`persistDeviceId` → identityCore)

즉, 상태 전이는 반드시 `session/services`를 통해서만 수행되어야 합니다.

### ...Core

세션 관련 raw 저장 책임을 담당합니다.

- `cloudCore`: cloud token, delegation token, selected cloud, selected site
- `relayCore`: relay selected site, relay endpoint access
- `identityCore`: relay/cloud profile, delegatorId, deviceId, oAuthProvider, invited 관련 raw 상태
- 기타 `...Core`: 각 도메인의 raw get/set 저장

`core`는 저장 경계이고, `session`은 조합 및 orchestration 경계입니다.

### IdentityCore

`IdentityCore`는 계산된 `IdentityContext`를 저장하지 않고, identity 관련 raw source만 저장합니다.

저장 대상:

- `relayProfile`
- `cloudProfile`
- `delegatorId`
- `deviceId`
- `oAuthProvider`
- invited 관련 raw flag 또는 value

저장하지 않는 대상:

- `activeProfile`
- `isGuest`
- `userId`
- `userRole`
- `userType`
- `permissions`

이 값들은 `contextStore` 조립 시 계산해야 하며, `IdentityCore`에 캐시된 파생값으로 저장하면 안 됩니다.

권장 메서드:

- `getRelayProfile(): UserProfile$ | null`
- `setRelayProfile(profile: UserProfile$ | null): void`
- `getCloudProfile(): UserProfile$ | null`
- `setCloudProfile(profile: UserProfile$ | null): void`
- `getDelegatorId(): string | null`
- `setDelegatorId(delegatorId: string | null): void`
- `getDeviceId(): string | null`
- `setDeviceId(deviceId: string | null): void`
- `getOAuthProvider(): OAuthLoginProvider | null`
- `setOAuthProvider(provider: OAuthLoginProvider | null): void`
- `getIsInvited(): boolean`
- `setIsInvited(value: boolean): void`
- `clearIdentity(): void`
- `subscribe(listener: () => void): () => void`

### contextStore

`contextStore`는 단순 저장소가 아니라 context assembler이자 조회 진입점입니다.

- `relayCore`, `cloudCore`, `identityCore` 상태를 읽습니다
- `identity`와 `runtime` 상태를 읽습니다
- `GlobalSessionContext`를 조립합니다
- 외부 getter와 hook이 읽을 최종 read model을 제공합니다

## 상태 전파

`core` 내용이 바뀌면 그 변경은 session 구독자에게 전파되어야 합니다.

구현 방식은 고정하지 않습니다.

- event emitter
- external store
- Zustand

중요한 것은 방식이 아니라 계약입니다.

- `core` 변경 후 `useGlobalSession()` 같은 hook이 최신 snapshot을 관측할 수 있어야 합니다
- relay/cloud/identity/runtime 간 불일치가 장시간 남아 있으면 안 됩니다

## RelaySessionContext

relay 기준 실행 컨텍스트를 표현합니다.

필드:

- `backend: string | null`
- `wss: string | null`
- `identityToken: string | null`
- `siteId: string | null`
- `isAuthenticated: boolean`

source of truth:

- `relayCore.getBackend()`
- `relayCore.getWss()`
- `relayCore.getSelectedSiteId()`
- `identityCore.getRelayProfile()` 존재 여부 기반 coarse auth state

규칙:

- cloud가 active가 아니면 relay는 항상 fallback server입니다
- relay endpoint 값은 runtime에서 결정되며 cloud로부터 유도되지 않습니다
- relay의 `siteId`도 refresh(`target = uid@sid`) 결과로 변경될 수 있습니다

## CloudSessionContext

현재 선택된 cloud 실행 컨텍스트를 표현합니다.

필드:

- `cloudId: string | null`
- `siteId: string | null`
- `backend: string | null`
- `wss: string | null`
- `identityToken: string | null`
- `delegationToken: CloudDelegationTokenView | null`
- `cloudToken: UserTokenView | null`
- `isActive: boolean`

source of truth:

- `cloudCore.getSelectedCloudId()`
- `cloudCore.getSelectedSiteId()`
- `cloudCore.getDelegationToken()`
- `cloudCore.getCloudToken()`

활성화 규칙:

아래 조건이 모두 만족될 때만 cloud는 active입니다.

- `cloudId`
- `backend`
- `wss`
- `identityToken`
- selected cloud is not the sentinel `default`

이는 현재 `libs/web-core/src/session/contextStore.ts`의 `buildCloudContext()` 로직과 일치합니다.

추가 규칙:

- cloud의 `siteId` 역시 refresh(`target = uid@sid`) 결과로 변경될 수 있습니다

## IdentityContext

사용자 identity 및 permission 모델을 표현합니다.

권장 필드:

- `relayProfile: UserProfile$ | null`
- `cloudProfile: UserProfile$ | null`
- `activeProfile: UserProfile$ | null`
- `isGuest: boolean`
- `userId: string | null`
- `delegatorId: string | null`
- `deviceId: string | null`
- `userRole: string | null`
- `oAuthProvider: OAuthLoginProvider | null`
- `readonly userType: UserType`
- `readonly permissions: UserPermissions`

판단:

- 이 필드들은 계산 여부와 무관하게 identity 도메인에 속합니다
- `userId`, `userRole`, `isGuest`, `userType`, `permissions`는 파생값이지만 runtime이 아니라 identity에 속합니다
- 따라서 파생값이라는 이유만으로 `runtime`으로 이동시키면 안 됩니다

source of truth:

- 저장 원본
    - `identityCore.getRelayProfile()`
    - `identityCore.getCloudProfile()`
    - `identityCore.getDelegatorId()`
    - `identityCore.getDeviceId()`
    - `identityCore.getOAuthProvider()`
- 파생값
    - `isGuest`
    - `userId`
    - `userRole`
    - `userType`
    - `permissions`

profile 접근 규칙:

- relay 기준 정보가 필요하면 `relayProfile`에 접근합니다
- cloud 기준 정보가 필요하면 `cloudProfile`에 접근합니다
- 현재 활성 세션 기준 정보가 필요하면 `activeProfile`에 접근합니다
- relay와 cloud profile을 하나의 canonical profile로 merge하지 않습니다

현재 구현 메모:

현재 구현은 `libs/web-core/src/session/types.ts`의 `IdentityContext` 안에 `runtime` 성격의 필드까지 함께 포함하고 있습니다. 권장 방향은 `IdentityCore`에 raw identity source를 모으고, `contextStore`에서 `IdentityContext`를 조립하는 구조입니다.

## SessionRuntimeContext

세션 실행 상태를 표현합니다.

권장 필드:

- `isInitialized: boolean`
- `isAuthenticated: boolean`
- `error: Error | null`

필드 필요성 검토:

- `isInitialized`
    - 필요합니다
    - session initialize 흐름 완료 여부를 외부에서 알아야 하기 때문입니다
    - `useInitWebCore` 같은 초기화 gating 흐름과 직접 연결됩니다
- `isAuthenticated`
    - 필요합니다
    - profile 존재 여부와 완전히 동일한 의미로 보지 말고, 현재 relay 기준 인증 상태를 나타내는 coarse auth 상태로 보는 것이 맞습니다
    - cloud 여부와는 분리해서 해석해야 합니다
- `error`
    - 필요합니다
    - initialize나 session lifecycle 중 마지막 오류 상태를 노출할 경계가 필요합니다
    - 단, 영구 누적 에러 저장소가 아니라 현재 runtime failure snapshot 정도로 보는 것이 적절합니다

정리:

- runtime 필드: `isInitialized`, `isAuthenticated`, `error`

현재 구현 메모:

현재는 이 필드들과 `isOnMobileApp`이 `IdentityContext` 안에 존재합니다. 문서상 권장 방향은 `SessionRuntimeContext`를 `isInitialized`, `isAuthenticated`, `error` 중심으로 분리하고, `isOnMobileApp`은 세션 컨텍스트 밖의 환경 정보로 정리하는 것입니다.

## ActiveServerContext

request와 socket이 실제로 사용해야 하는 현재 대상 서버를 표현합니다.

Relay case:

```ts
{
    kind: 'relay';
    backend: string;
    wss: string;
    siteId: string | null;
    identityToken: string | null;
}
```

Cloud case:

```ts
{
    kind: 'cloud';
    cloudId: string;
    siteId: string | null;
    backend: string;
    wss: string;
    identityToken: string;
}
```

계산 규칙:

1. if cloud session is active, choose cloud
2. otherwise choose relay

## 현재 구현 매핑

현재 기준 파일:

- context assembly: `libs/web-core/src/session/contextStore.ts`
- exported getters: `libs/web-core/src/session/contexts.ts`
- types: `libs/web-core/src/session/types.ts`

매핑:

- `RelayContext` -> `RelaySessionContext`
- `CloudContext` -> `CloudSessionContext`
- `IdentityContext` -> `IdentityContext + SessionRuntimeContext`
- `ActiveServerContext` -> same concept

## 설계 가이드

권장 공개 계약 방향:

- `getGlobalSessionContext()`를 메인 외부 API로 유지
- 로컬 편의를 위한 specialized getter는 허용
- raw storage semantics를 외부 소비자에게 노출하지 않음

권장 구현 방향:

- 우선 현재 동작을 보존
- `IdentityContext`에서 runtime 성격 필드를 분리해 `SessionRuntimeContext`로 정리
- `IdentityContext`는 사용자 identity 및 permission 모델에 집중
- `contextStore`는 저장소가 아니라 assembler 역할에 집중
