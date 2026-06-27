# auth 피쳐 재구성 — hooks/types 분류 + web-core 세션 훅 위임

> 대상: `apps/web/src/app/features/auth` · 관련 마이그레이션: web 런타임(@chatic/socket → app-runtime/data/web-core)

## 1. 목표

- 페이지에 인라인되어 있던 인증 로직을 `hooks/`로, 데이터 형태를 `types/`로 분리.
- 인증 처리는 web-core 세션 훅에 위임, 데이터 쓰기는 `useRuntimeRepositories`.
- 동기화·수동 cloud/site 상태 쓰기 로직 제거(런타임/web-core 책임).
- 깨진 임포트 해소(삭제된 공용 훅 의존 제거).

## 2. 최종 구조

```
features/auth/
├── hooks/
│   ├── index.ts
│   ├── useInviteAccept.ts      # 초대 수락: 로그인 → 클라우드 진입 → 홈 이동
│   ├── useInviteCloudEntry.ts  # 토큰 기반 switchCloud + switchSite (로그인과 분리)
│   ├── useOAuthLogin.ts        # OAuth 리다이렉트 콜백 처리
│   └── useClearCache.ts        # 전 레포 캐시 클리어(로그아웃용)
├── types/
│   ├── index.ts
│   ├── auth.ts                 # InviteParams + parseInviteDeeplink / isInviteDeeplink
│   └── auth.test.ts
├── pages/                      # LoginPage / LogoutPage / OAuthResponsePage (UI + 훅 호출)
├── routes/
└── index.tsx
```

## 3. 플로우별 설계

### 초대(invite)
- 딥링크는 `code`, `_backend`, `_version`만 전달한다. cloud/site 식별자는 **로그인 토큰**에서 나온다 → `parseInviteDeeplink`는 이 3개만 파싱.
- `useInviteFlow`(web-core)는 **로그인만 수행하고 토큰(UserTokenView)을 반환**한다. 캐시 저장 콜백·클라우드 전환을 더는 내부에서 하지 않는다(이번에 web-core 수정).
- 수락 시: `useInviteAccept` → `runInviteFlow({ code, backend })`로 토큰 획득 → `useInviteCloudEntry.enterInvitedCloud(token)`이 `token.cloudId`로 `switchCloud`, `token.siteId ?? token.sid`로 `switchSite` → `ROUTES.home`으로 이동.
- 초대 클라우드 캐시 저장/동기화 플래그/수동 selected-id 쓰기는 전부 제거(web-core가 처리).

### OAuth 콜백
- `useOAuthLogin`: `code`/`provider`/`state` 파싱 → `createCredentialsByProvider`(또는 invite는 `loginWithInviteCode(code, delegatorId)`) → `useRefreshRelaySession().refreshRelaySession({ syncProfile: true })`로 세션 hydrate → `state.from`으로 이동.

### 로그아웃
- `LogoutPage`: `useClearCache().clearAllCache()`(전 레포 `cacheClear`)로 캐시 전체 비운 뒤 `useSessionLogout()`으로 릴레이 세션 종료. **릴레이 로그아웃되면 런타임이 자동으로 게스트 로그인**을 수행하므로 다음 세션은 깨끗한 캐시에서 시작한다.

### 게스트/디바이스 로그인
- auth 모듈에서 다루지 않는다(런타임 자동 처리). 비-invite `/auth/login` 진입은 로딩 표시만.

## 4. 제거된 것

- **토큰 로그인 페이지 둘 다 제거**: `TokenLoginPage`, `TokenTestLoginPage`, `useTokenLogin`, 라우트 `token-test-login`·`token/:token`, 상수 `ROUTES.auth.token`.
- 수동 cloud/site 쓰기(`cloudCore.save*`/`captureInvitedCloud`/`setSelectedPlaceId` 등), sync 플래그(`markInvitePlaceSyncPending`), 디바이스 등록 분기.
- 깨진 임포트(`useInviteMutations`·`usePlaces`·`useCacheMutations`·`channels/apis/invite-api`).

## 5. web-core 신 public API 매핑 (마이그레이션 후)

| 용도 | 신 API |
|------|--------|
| 초대 로그인(토큰 반환) | `useInviteFlow().runInviteFlow({ code, backend })` |
| 클라우드/사이트 전환 | `useSwitchCloudSession().switchCloud(id)`, `useSiteSwitch().switchSite(id)` |
| 세션 hydrate | `useRefreshRelaySession().refreshRelaySession({ syncProfile: true })` |
| 토큰 자격 빌드 | `webTransport.buildCredentialsByToken(...)` |
| OAuth 코드 교환 | `createCredentialsByProvider(provider, code)` (transport-only) |
| 초대 코드 로그인(api) | `loginWithInviteCode(code, delegatorId, backend?)` — delegatorId 필수(`useSessionIdentity`) |
| 로그아웃 | `useSessionLogout()` |
| 캐시 클리어 | 레포별 `cacheClear()` (단일 clearAll 없음 → `useClearCache`에서 순회) |

> 주의: 레거시 `useWebCoreStore`/`webCore`/`reportError`/`toError`는 `@chatic/web-core` public에서 제거됨. `session/services`(refreshRelaySession 등)는 top-level index에 없고 **훅으로만 public**.

## 6. 검증

- `tsc -p apps/web/tsconfig.app.json` — auth 0 에러. (web-core 수정 후 `tsc -b libs/web-core`로 선언 재생성 필요.)
- 유닛 테스트: `types/auth.test.ts`(파싱/판별), web-core `useInviteFlow.test.ts`(로그인+토큰반환/예외).
- 코드 주석은 영어.
- 범위 밖(미해결): channels/mypage/place의 깨진 공용 훅 임포트, `paths.test.ts`의 `notifications`/`place.order`(워킹트리 divergence, 이번 작업과 무관).
