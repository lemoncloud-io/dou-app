# Session Public API

## 주요 API

기본 조회 진입점:

```ts
getGlobalSessionContext(): GlobalSessionContext
```

의도:

- 외부 소비자에게 하나의 안정적인 스냅샷 제공
- `cloudCore`, `relayCore`, `identityCore` 세부 구현에 대한 직접 결합 방지

권장 소비자:

- API helper
- React hook
- 현재 실행 컨텍스트가 필요한 feature 모듈

## 보조 API

현재 제공되는 API:

- `getRelaySessionContext()`
- `getCloudSessionContext()`
- `getIdentityContext()`
- `getActiveServerContext()`
- `getCloudSessionSnapshot()`

권장 원칙:

- 집중된 목적의 service 사용을 위해 이 API들은 유지 가능
- 기본 선택지는 `getGlobalSessionContext()`라고 문서화

## Hook API

현재 hook 진입점은 `libs/web-core/src/hooks/session.ts`에 구현되어 있습니다.

주요 hook:

- `useGlobalSession()`
- `useSessionAuth()`
- `useSessionIdentity()`

연계 hook:

- cloud token refresh hook
    - 소켓 모듈이 웹소켓 인증 실패 시 호출할 수 있는 복구 진입점
    - 내부적으로 `refreshCloudSession()` 계열 service와 연결
- relay/cloud session refresh hook
    - relay 또는 cloud의 `target = uid@sid` 기반 site 전환을 포함한 refresh 진입점

권장 가이드:

- feature가 profile과 active server 상태를 모두 필요로 하면 `useGlobalSession()` 사용
- 더 좁은 hook은 의도적으로 범위를 제한한 컴포넌트에서만 사용

## Write/Transition API

상태 전이는 raw session source를 feature 코드에서 직접 변경하는 방식이 아니라, 명시적인 service를 통해 수행되어야 합니다.

현재 예시:

- `initializeRelaySession()`
- `loginRelayGuestByDevice()`
- `loginRelaySocial()`
- `loginWithInviteCode()`
- `refreshRelaySession()`
- `logoutRelaySession()`
- `switchCloudSession()`
- `refreshCloudSession()`
- `logoutCloudSession()`
- `restorePreviousCloudSession()`
- `persistDeviceId()`

현재 구현 메모:

- 위 서비스들은 `libs/web-core/src/session/services.ts`에 정의되어 있습니다.
- `refreshRelaySession()`은 현재 relay auth refresh와 profile 재동기화까지 구현되어 있습니다.
- `refreshRelaySession(target = uid@sid)`는 relay auth refresh와 relay selected site 전환을 함께 수행합니다.

소켓 모듈 연계:

- 소켓 모듈은 직접 session 저장 상태를 수정하지 않습니다
- 소켓 auth 실패 시 cloud token refresh hook을 호출해 복구를 요청합니다

## 금지 사항

- feature 코드에서 `cloudCore`와 `relayCore`를 직접 조합하지 않습니다
- feature 코드에서 `identityCore`를 직접 조합하지 않습니다
- `selectedCloudId`만 보고 active server를 추론하지 않습니다
- relay profile과 cloud profile이 항상 같다고 가정하지 않습니다
- cloud token refresh를 full cloud switch와 동일하게 취급하지 않습니다

## 향후 정리 권장 사항

현재 public surface는 `libs/web-core/src/session/index.ts`를 통해 내부 구현 일부까지 노출하고 있습니다.

권장 방향:

1. `getGlobalSessionContext()`를 문서상 기본 조회 계약으로 고정
2. 타입 수준에서 `IdentityContext`와 `SessionRuntimeContext` 분리
3. 의도적으로 공개할 API가 아니면 내부 store utility 재노출 축소
