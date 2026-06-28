# apps/web 런타임 마이그레이션 마무리 (web-core/app-runtime 신 API)

> 대상: apps/web 전반(mypage·debug·home·auth 경계) · 기준: [migration-playbook.md](../../migration-playbook.md)
> · 참조 구현: `apps/testbed`

`feature/raine-migrate-socket` 브랜치에서 web-core/app-runtime의 세션·repository API가 재편되며
apps/web 소비자 일부가 구 심볼과 삭제된 내부 훅을 참조해 `tsc -b`가 red였다. 이를 신 API로
마이그레이션해 **`tsc -b apps/web` exit 0**(에러 0)을 달성한 기록.

## 핵심 원칙

web-core `index.ts`는 `session/core`(`cloudCore`·`identityCore`·`webTransport`)를 **export하지
않는다.** 즉 소비자는 저수준 코어 객체가 아니라 **신 훅**(`useSessionIdentity`/`useSessionSelection`/
`useSessionLogout`/`useLoginRelaySocial` 등)을 쓴다. (참조: `ProfileSection.tsx`, testbed)

## old → new 매핑 (tsc 검증 완료)

| 구 심볼/메서드                                                                           | 신 대체                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `cloudCore.getSelectedCloudId()`                                                         | `useSessionSelection().selectedCloudId`                        |
| `useDynamicProfile()` → `.$user`                                                         | `useSessionIdentity().activeProfile?.$user`                    |
| `useUserContext().userType`                                                              | `useSessionIdentity().userType`                                |
| `useLogout()`                                                                            | `navigate(ROUTES.auth.logout)` (LogoutPage가 처리)             |
| `cloudCore.clearSession()`                                                               | `useLogoutCloudSession().logoutCloudSession()`                 |
| `cloudCore.getCloudToken()` (읽기)                                                       | `useSessionIdentity().cloudProfile?.$user`                     |
| `cloudCore.saveCloudToken()` + `useWebCoreStore.setProfile()`                            | `useRefreshCurrentCloudSession().refreshCurrentCloudSession()` |
| `webCore.buildCredentialsByToken` + `setOAuthProvider` + `setProfile/setIsAuthenticated` | `useLoginRelaySocial().mutateAsync({ body, provider })`        |
| `login()` + `webCore` + `cloudCore` (debug 이메일 로그인)                                | `useLogin().mutateAsync({ uid, pwd })`                         |
| repo `subscribeList`                                                                     | `observeList`                                                  |
| repo `cacheCreate` / `cacheBulkCreate` / `cacheUpdate(id, p)`                            | `cacheWrite` / `cacheWriteMany` / `cacheWrite({ id, ...p })`   |
| onboarding `../consts`                                                                   | `../types` (rename됨)                                          |

## 파일별 변경

| 파일                                 | 변경                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `mypage/MyPage.tsx`                  | 세션 훅 치환, 로그아웃 → `/auth/logout`, unread 뱃지 제거                                 |
| `mypage/WithdrawalPage.tsx`          | profile → `useSessionIdentity`, 로그아웃 → `/auth/logout`, `$user.imageUrl`→`photo`       |
| `mypage/AccountManagePage.tsx`       | `useSessionSelection` + `useLogoutCloudSession`                                           |
| `mypage/CloudProfileEditPage.tsx`    | cloud 읽기 → `useSessionIdentity().cloudProfile`, 저장 후 `useRefreshCurrentCloudSession` |
| `mypage/LoginPage.tsx`               | OAuth 네이티브 흐름 → `useLoginRelaySocial`, `PageHeader title` 추가                      |
| `debug/useDebugMode.ts`              | `useWebCoreStore`(registerLogoutCallback) 의존 제거                                       |
| `debug/DebugPage.tsx`                | 로그아웃 → `/auth/logout`                                                                 |
| `debug/DebugLoginPage.tsx`           | 이메일 로그인 → `useLogin`                                                                |
| `debug/DebugChatPage.tsx`            | repository 메서드명 마이그레이션                                                          |
| `debug/DebugBadgeCountPage.tsx`      | 삭제된 `usePlaceUnreadCounts` 의존/UI 제거(네이티브 뱃지 테스트는 유지)                   |
| `ui/components/BottomNavigation.tsx` | `totalUnread` prop·뱃지 제거                                                              |
| `ui/layouts/PublicLayout.tsx`        | `: JSX.Element` 주석 제거(React 19)                                                       |
| `home/pages/HomePage.tsx`            | BottomNavigation 미전달, 죽은 dev `Settings` 드롭다운 제거                                |
| `onboarding/*`                       | `../consts` → `../types`                                                                  |

## 사용자 결정 반영

- **로그아웃+캐시**: MyPage/DebugPage가 `/auth/logout`(LogoutPage = `clearAllCache` + `useSessionLogout`)
  로 라우팅 → 캐시/로그아웃 훅 직접 의존 제거. (삭제된 `useCacheMutations` 대체)
- **unread 뱃지 제거**: 삭제된 `useTotalUnreadCount`/`usePlaceUnreadCounts`를 재구현하지 않고
  뱃지·관련 prop을 제거(추후 재구현 가능).

## 함께 정리한 것

- **apps/web의 dead `libs/socket` project reference 제거**(`tsconfig.app.json`). apps/web은
  `@chatic/socket`을 import하지 않으며 "libs/socket 접근 금지" 원칙과 일치. 이것이 `tsc -b apps/web`의
  마지막 red 원인이었다.
- **삭제된 라우트 테스트 제거**: `paths.test.ts`에서 `ROUTES.notifications`/`join`/`place.order`
  (마운트·사용 0건의 삭제된 라우트) 단언 제거.

## 검증

- `tsc -b apps/web` → **exit 0, 에러 0**.
- jest: `useDebugMode` 6/6, `useAppIcon` 4/4, `useChannelUnreads` 2/2, `paths` 11/11 통과.

## 미해결 / 후속

- `CloudProfileEditPage`·`DebugChatPage`에 쿼리/페이로드 `as any` 캐스팅 일부 잔존 — 정밀 타입으로
  좁히는 것은 후속.
- `libs/socket` 자체는 여전히 red(폐기 중 라이브러리, admin/desktop-web도 참조) — 본 작업 범위 밖.
