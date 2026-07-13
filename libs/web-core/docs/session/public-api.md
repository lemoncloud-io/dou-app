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

세션 hook은 `libs/web-core/src/hooks/session/` 아래 **readers**(구독 기반 getter)와 **actions**(전이 mutation)로 나뉩니다.

readers (`readers/`, `useSyncExternalStore`):

- `useGlobalSession()` — 전체 조립 세션 컨텍스트
- `useSessionAuth()` — runtime auth 스냅샷(`isInitialized`/`isAuthenticated`)
- `useSessionIdentity()` — identity 스냅샷(`userId`/`delegatorId`)
- `useSessionSelection()` — 파생 `selectedCloudId`/`selectedSiteId`

actions (`actions/`, mutation/callback):

- `useSiteSwitch()` · `useSwitchCloudSession()` — site/cloud 전환
- `useRefreshRelaySession()` · `useRefreshCloudSiteSession()` · `useRefreshCurrentCloudSession()` — refresh
- `useSessionLogout()` · `useLogoutCloudSession()` — 로그아웃
- `useInviteFlow()` — 초대코드 인증(cloud/site 진입은 소비자가)

권장 가이드:

- feature가 active server + identity 상태를 함께 필요로 하면 `useGlobalSession()` 사용
- 더 좁은 reader는 범위를 제한한 컴포넌트에서만 사용

## Write/Transition API

상태 전이는 raw session source를 feature 코드에서 직접 변경하는 방식이 아니라, 명시적인 service를 통해 수행되어야 합니다.

현재 예시:

- `initializeRelaySession()`
- `loginRelayGuestByDevice()`
- `loginRelayUser()`
- `loginRelaySocial()`
- `registerUserWithInviteCode()` (raw API — `useInviteFlow`가 구동; 옛 이름 `loginWithInviteCode`)
- `refreshRelaySession()`
- `logoutRelaySession()`
- `switchCloudSession()`
- `refreshCloudSession()`
- `switchSiteSession()` — sid 선반영+롤백 사이트 전환
- `refreshActiveCloudSession()` — 주기 리프레시 루프용 cloud 갱신
- `logoutCloudSession()`
- `persistDeviceId()`

현재 구현 메모:

- `registerUserWithInviteCode()`를 제외한 위 서비스들은 `libs/web-core/src/session/services.ts`에 정의됩니다. `registerUserWithInviteCode()`는 **service가 아니라 `libs/web-core/src/api/auth.ts`의 API 함수**이며 `useInviteFlow`가 직접 호출합니다.
- `refreshRelaySession()`은 relay auth refresh를 수행합니다(`syncProfile` 옵션).
- `refreshRelaySession(target = uid@sid)`는 relay auth refresh와 relay selected site 전환을 함께 수행합니다.
- `refreshRelaySession`·`refreshCloudSession`은 서비스 레벨 single-flight로 주기 루프와 사이트 전환을 직렬화합니다.
- `restorePreviousCloudSession()`은 **제거**되었습니다 (invited 번들 writer 부재로 죽은 경로 → `switchCloudSession`으로 일원화).
- cid/sid **선반영(optimistic) + 롤백**은 `switchCloudSession`(cid)·`switchSiteSession`(sid)에 **구현 완료**입니다. relay 사이트 전환(`refreshRelaySession(target)`) sid 선반영만 TODO (hooks/orchestration.md 참조).

소켓 모듈 연계:

- 소켓 auth 수명주기는 SDK `AuthController`(app-runtime)가 소유합니다. session은 직접 소켓 상태를 조작하지 않고, **per-kind 브리지 헬퍼**(`getServerAuthRegistration`/`signServerAuth`/`commitServerRefreshedToken`)로 register seed·서명·refresh writeback을 공급합니다([../transport/request-lifecycle.md](../transport/request-lifecycle.md)).
- 소켓 refresh 결과는 이 writeback으로 session 저장소에 단방향 반영됩니다(session이 소켓 복구를 능동 호출하지 않음).

## 금지 사항

- feature 코드에서 `cloudCore`와 `relayCore`를 직접 조합하지 않습니다
- feature 코드에서 `identityCore`를 직접 조합하지 않습니다
- `selectedCloudId`만 보고 active server를 추론하지 않습니다
- 프로필/역할/권한을 session에서 읽으려 하지 않습니다 — app 레이어(`useProfileFacts`)에서 파생합니다
- cloud token refresh를 full cloud switch와 동일하게 취급하지 않습니다

## 향후 정리 권장 사항

- `getGlobalSessionContext()`를 기본 조회 계약으로 유지.
- 의도적으로 공개할 API가 아니면 내부 store utility(`contextStore`/`utils`) 재노출 축소. (`session/index.ts`는 현재 `types`/`contexts`/`services`만 re-export하며, SDK 브리지 헬퍼는 `src/index.ts`에서 명시적으로 노출합니다.)

## 관련 문서

- [README.md](./README.md) — session 계층의 역할과 경계
- [context-model.md](./context-model.md) — 컨텍스트 정의와 source of truth
- [session-scenarios.md](./session-scenarios.md) — 전이 service 시나리오
