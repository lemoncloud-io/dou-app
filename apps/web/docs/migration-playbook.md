# apps/web 마이그레이션 플레이북 (컴포넌트 단위 구현 지침)

> 목적: `apps/web`를 레거시 `@chatic/socket` + 구버전 `@chatic/web-core`/`@chatic/app-runtime` API에서 **현재 라이브러리 API**로 옮기는 작업을, **컴포넌트(파일) 하나씩** 안전하게 구현하기 위한 실행 지침.
> 이 문서만 보고도 각 파일을 독립적으로 마이그레이션할 수 있도록 작성했다. 아키텍처 배경은 [`runtime-migration.md`](./runtime-migration.md) 참고.

---

## 0. 절대 규칙

- **`libs/socket`(`@chatic/socket`)은 직접 import 금지.** 소켓은 `@chatic/app-runtime`이 추상화한다. 앱은 `useSocketState`/repository/sync 훅만 쓴다.
- **web-core core 객체 직접 사용 금지**: `cloudCore`/`identityCore`/`relayCore`/`webCore`는 공개 API가 아니다(루트 배럴 미export). 반드시 공개 훅/서비스로 대체.
- **세션 선택 상태(cloud/site)를 직접 setter로 바꾸지 않는다.** 세션 전환 훅(`useSwitchCloudSession`/`useSiteSwitch`/`useRefreshCloudSiteSession`)을 통해서만 변경.
- 코드 주석은 영어로, 문서/대화는 한국어.

---

## 1. 성공 기준과 검증 프로토콜

두 지표를 **모두 0**으로 만든다(서로 독립):

1. **타입 에러** — 제거된 export 때문. 측정(반드시 repo 루트에서):
    ```bash
    cd <repo-root> && npx tsc -p apps/web/tsconfig.app.json --noEmit 2>&1 | grep -cE "error TS"
    ```
    > ⚠️ cwd가 `apps/web/src`면 경로가 깨져 `TS5058`만 뜨고 거짓 측정된다. **항상 repo 루트에서 실행.** incremental 캐시로 거짓 저감이 보일 수 있으니 의심되면 `--incremental false` 병행.
2. **`@chatic/socket` import 파일 수** — 소켓 패키지 자체는 존재하므로 import를 지워도 tsc 에러는 안 줄어든다(별도 추적):
    ```bash
    grep -rl "@chatic/socket" apps/web/src --include="*.ts" --include="*.tsx" | wc -l
    ```

**게이트**: 컴포넌트 하나 끝낼 때마다 타입 에러 수가 **증가하지 않고 감소**해야 한다(단조 감소). 빌드는 모든 에러가 0이 된 뒤에만 가능하므로, **preview 런타임 검증은 그린 빌드 이후 마지막에** 수행한다.

**규율(disciplined)**: 새로 추가/변경하는 로직에는 영어 주석 + 유닛 테스트. 파일 단위로 완결(한 파일 안의 모든 제거-심볼을 한 번에 정리)하고, 순수 이동(디렉터리 정리)과 로직 변경 커밋을 분리.

---

## 2. 권위 심볼 매핑 (tsc로 검증, 2026-06-25)

### 2.1 @chatic/web-core — 제거된 심볼

| 제거됨                                                                                                                                                                       | 대체                                                                                                    | 비고                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `useWebCoreStore` (read: `isAuthenticated`/`isInitialized`)                                                                                                                  | `useSessionAuth()`                                                                                      | `{ isInitialized, isAuthenticated, error, activeProfile }` |
| `useWebCoreStore` (read: `profile`)                                                                                                                                          | `useSessionIdentity().activeProfile`                                                                    | `UserProfile$ \| null`                                     |
| `useWebCoreStore` (read: `isOnMobileApp`)                                                                                                                                    | `useAppChecker().isOnMobileApp` (`@chatic/device-utils`)                                                |                                                            |
| `useWebCoreStore` (**setters**: `setProfile`/`setIsAuthenticated`/`logout`/`registerLogoutCallback`)                                                                         | **없음** — 로그인/로그아웃 서비스가 세션을 hydrate (§3.4/§3.5)                                          | 수동 set 제거                                              |
| `useUserContext().userType`                                                                                                                                                  | `useSessionIdentity().userType`                                                                         | `UserType`                                                 |
| `useUserContext().permissions`                                                                                                                                               | `useSessionIdentity().permissions`                                                                      |                                                            |
| `useUserContext().currentWSS`                                                                                                                                                | `useGlobalSession().activeServer.kind`                                                                  | `'relay' \| 'cloud'`                                       |
| `useDynamicProfile()`                                                                                                                                                        | `useSessionIdentity().activeProfile`                                                                    | `.uid` 등 동일 접근                                        |
| `useDelegatorId()`                                                                                                                                                           | `useSessionIdentity().delegatorId`                                                                      |                                                            |
| `cloudCore.getSelectedCloudId()`                                                                                                                                             | `useSessionSelection().selectedCloudId` (hook) / `getGlobalSessionContext().activeServer` (비훅)        | 'default' 기본값                                           |
| `cloudCore.getSelectedSiteId()`/`getSelectedPlaceId()`                                                                                                                       | `useSessionSelection().selectedSiteId`                                                                  |                                                            |
| `cloudCore.saveSelectedSiteId()` (site 선택 쓰기)                                                                                                                            | `useSiteSwitch().switchSite(siteId)`                                                                    | 직접 저장 금지                                             |
| `cloudCore.saveSelectedCloudId()`/`saveDelegationToken`/`saveCloudToken`/`refreshToken`/`captureInvitedCloud`/`restoreInvitedCloud`/`clearDelegationToken`/`getInvitedCloud` | 세션 서비스 훅 (`useSwitchCloudSession`/`useLogoutCloudSession`/`useRefreshCloudSiteSession`)           | §3.6                                                       |
| `cloudCore.getCloudToken()`/`getIdentityToken()`                                                                                                                             | `getActiveServerIdentityToken()` / `useGlobalSession().cloud.*`                                         |                                                            |
| `cloudCore.getPlaceOrder()`/`savePlaceOrder()`                                                                                                                               | **확인 필요** — 공개 대체 없을 수 있음(§6 미해결)                                                       | place 정렬                                                 |
| `webCore.buildCredentialsByToken()`/`getTokenStorage()`/`getTokenSignature()`                                                                                                | 로그인 훅(`useLogin`/`useLoginRelaySocial`/`useLoginWithInviteCode`) + `getActiveServerIdentityToken()` | §3.4                                                       |
| `useLogout()` (react-query mutation)                                                                                                                                         | `useSessionLogout()` (plain callback)                                                                   | **형태 다름**, §3.5                                        |
| `useOnboardingStore`                                                                                                                                                         | **app-local 신설** (`shared/stores/useOnboardingStore.ts`)                                              | §3.7                                                       |
| `useAppPreferenceStore`                                                                                                                                                      | **app-local 신설** (`shared/stores/useAppPreferenceStore.ts`)                                           | §3.7                                                       |
| `useServiceStatusStore().isServiceUnavailable`                                                                                                                               | `useServiceUnavailable()` (boolean 직접 반환)                                                           |                                                            |
| `setOAuthProvider`/`setIsInvitedSession`                                                                                                                                     | 로그인/초대 서비스 흐름이 처리(공개 setter 없음)                                                        | §3.8                                                       |
| `toError` / `withTimeout`                                                                                                                                                    | **app-local util** (`shared/utils/errors.ts`)                                                           | 배럴서 빠짐, §3.1                                          |
| `useRegisterDevice` (이름 변경)                                                                                                                                              | 확인 후 신 이름으로                                                                                     |                                                            |

### 2.2 @chatic/app-runtime — 제거된 심볼

| 제거됨                                                | 대체                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `useCloudSession()` (clouds, isPending 등)            | `useCloudSessionCatalog()` (`@chatic/web-core`) — `{ clouds, isCloudsError, isFetchingClouds, isPendingClouds, refetchClouds }` |
| `useCloudSession()` (selectCloud/restoreInvitedCloud) | `useSwitchCloudSession()` / `useLogoutCloudSession()`                                                                           |
| `WebSocketV2Connection`                               | `RuntimeConnectionHost` (선언형 provider)                                                                                       |
| `useDynamicDeviceId`                                  | `@chatic/web-core`의 `useDynamicDeviceId` (패키지만 이동)                                                                       |

### 2.3 @chatic/data — 변경

| 변경                                                                                  | 대체                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `ClientChannelView` (data에서 import 시도)                                            | web 로컬 타입 `app/shared/types`의 `ClientChannelView`     |
| repo `inviteCloud`                                                                    | repo `cloud` (InviteCloud+Cloud→**DomainCloud** 통합)      |
| `inviteCloud.saveInviteCloud(id, data)`                                               | `cloud.cacheWrite(data)`                                   |
| repo 메서드 `subscribeList`/`fetchChannel`/`fetchSite`/`createSite`/`updateSite` (V1) | V2 `observeList`/`refreshList`/`createPlace`/`updatePlace` |

### 2.4 @lemoncloud/\* 외부 타입 드리프트 (libs/socket 아님 — 외부 패키지)

| 변경                                                                                                                                   | 대응                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `MyUserInviteBody`: 배열 `to`/`cloudId`/`cloudName` → 단건 `{ alias?, type?, userId?, name?, role?, channelId? }`                      | **배치 초대 계약 재설계** 필요(§3.8). mutation을 repos로 옮길 때 V2 입력 타입 사용              |
| `UserUpdateProfilePayload`/`UserUpdateSitePayload`/`ChatStartPayload`/`ChatFeedPayload`/`WSSEnvelope`/`ChatUsersPayload` (sockets-api) | mutation/read를 repos V2(`*Input`)로 옮기면 대부분 해소. 직접 쓰던 자리는 V2 입력 타입으로 교체 |

---

## 3. 신 API 형태 & 레시피 (패턴별)

### 3.0 신 reader 훅 반환 형태 (web-core)

- `useSessionAuth()` → `{ isInitialized, isAuthenticated, error, activeProfile }`
- `useSessionIdentity()` → `{ isInitialized, isAuthenticated, error, relayProfile, cloudProfile, activeProfile, userId, delegatorId, userRole, isInvited, isGuest, userName, oAuthProvider, userType, permissions }`
- `useSessionSelection()` → `{ selectedCloudId: string('default' fallback), selectedSiteId: string|null }`
- `useGlobalSession()` → `{ relay, cloud, identity, activeServer }`
    - `activeServer`: `{ kind:'relay', backend, wss, siteId, identityToken }` **또는** `{ kind:'cloud', cloudId, siteId, backend, wss, identityToken }`
- `useDynamicDeviceId()` → `{ deviceId: string|undefined, isReady: boolean }`
- 비훅 getter: `getGlobalSessionContext()`, `getActiveServerIdentityToken()` (`@chatic/web-core`)

### 3.1 유틸 (toError/withTimeout)

`apps/web/src/app/shared/utils/errors.ts`에 로컬 정의(이미 신설 가능):

```ts
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
export const withTimeout = <T>(p: Promise<T>, ms: number, context = 'Operation'): Promise<T> => {
    /* TIMEOUT: ${context} timed out (${ms}ms) */
};
```

import: `import { reportError } from '@chatic/web-core'` 는 유지(여전히 export), `toError`만 로컬로.

### 3.2 reader 치환 (가장 흔함 / 무위험)

- `const { userType } = useUserContext()` → `const { userType } = useSessionIdentity()`
- `const profile = useDynamicProfile()` → `const { activeProfile: profile } = useSessionIdentity()`
- `useWebCoreStore(s => s.isAuthenticated)` → `const { isAuthenticated } = useSessionAuth()`
- `useWebCoreStore(s => s.profile)` → `const { activeProfile: profile } = useSessionIdentity()`
- `const { currentWSS } = useUserContext()` → `const currentWSS = useGlobalSession().activeServer.kind`

### 3.3 데이터 읽기 훅 (소켓 스토어 + V1 repo → V2 observe/sync)

대상: `useChannels`/`useChats`/`useTotalUnreadCount`/`usePlaceUnreadCounts`/`useChannelMembers`/`usePlaces`/`useChannel`.

- 소켓 스토어 읽기 치환: `useWebSocketV2Store(s => s.isVerified)`→`useSocketState().isVerified`; `s.selectedPlaceId`→`useSessionSelection().selectedSiteId`; `s.cloudId`→`useSessionSelection().selectedCloudId`; `s.isConnected`→`useSocketState().isConnected`; `s.isDeviceRegistered`→**제거**(비노출).
- repo 메서드: `repos.X.subscribeList(...)` → `repos.X.observeList(...)`; `fetchChannel/fetchSite` → `refreshList`. **`useRuntimeRepositories()`는 dist가 V1 타입이므로 testbed처럼 캐스팅**: `const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;`
- (행위 개선, 6단계) 가능하면 수동 refresh 게이팅 대신 sync 등록(`useChannelSync`/`usePlaceSync`/`useChatSync`/`useJoinSync`/`useProfileSync`) + `observeList`/`observeItem` 구독으로 재구성. **mis-tag 주의**: 전환 직후 observe가 이전 사이트 행을 들고 있을 수 있으니 `channel.sid === activeSiteId` 필터 + 활성 사이트 항목만 sync 등록.

### 3.4 로그인 페이지 (수동 토큰 흐름 → 로그인 훅)

신 로그인 훅(모두 세션을 **자동 hydrate**, 앱이 `setProfile`/`setIsAuthenticated` 호출 불필요):

- `useLogin()` → react-query mutation, `loginRelayUser({ body, email })` (이메일/일반 로그인)
- `useLoginRelaySocial()` → `{ body: VerifyNativeTokenBody, provider }` (소셜/네이티브 토큰)
- `useLoginWithInviteCode()` → `{ code, delegatorId, backend }`
- `createCredentialsByProvider(provider, code)`, `loginWithInviteCode(...)` 는 여전히 export (OAuthResponsePage에서 사용)
- 패턴: 수동 `webCore.buildCredentialsByToken(...)` + `setIsAuthenticated(true)` 제거 → 로그인 서비스/훅 호출. **단, `createCredentialsByProvider`가 세션 auth 상태를 hydrate하는지 먼저 확인**(authRuntime.ts) — hydrate 안 하면 로그인 후 세션 재평가(init/refresh) 경로를 확인해 연결. (이 지점은 런타임 검증 필요)

### 3.5 로그아웃 (mutation → callback + 캐시 클리어)

- `const { mutate: logout } = useLogout()` → `const logout = useSessionLogout()` (plain callback `(opts?) => logoutRelaySession(opts)`)
- `isPending`/`onError` 콜백은 신 훅에 없음 → 호출부에서 자체 처리(try/catch, 로컬 state)
- **중요**: web-core 로그아웃은 세션 전이만 한다. **앱이 직접 `DataManager.destroy()` + react-query 캐시 클리어**를 로그아웃 완료 후 수행해야 함(이전 클라우드 데이터 잔존 방지).
- 대상: `HomePage`, `LogoutPage`, `MyPage`, `DebugPage`, `WithdrawalPage`, `Sidebar`.

### 3.6 클라우드/사이트 전환 (cloudCore 쓰기 → 세션 서비스)

대상: `PlaceList`, `CloudSessionSheet`, `useCloudSwitchFlow`.

- 사이트 선택: `cloudCore.saveSelectedSiteId(id)` + 수동 refresh → `useSiteSwitch().switchSite(id)` (낙관 선반영+커밋+롤백 내장)
- 클라우드 전환: → `useSwitchCloudSession().switchCloud(cloudId)`; 기본(relay) 복귀 → `useLogoutCloudSession().logoutCloudSession()`
- 클라우드 목록: `useCloudSession().clouds` → `useCloudSessionCatalog().clouds`
- 수동 `auth:update` 송신/`refreshToken` 제거 — `SocketAuthBinder`가 sid/토큰 변화 감지해 자동 재인증
- invited-cloud 재진입 분기(`restoreInvitedCloud`/`captureInvitedCloud`)는 일반 `switchCloud`로 통일 가능한지 확인 후 제거

### 3.7 app-local 스토어 (신설)

web-core에서 제거됨 → `apps/web/src/app/shared/stores/`에 zustand로 재구현(영속 키 동일 유지: 기존 사용자 호환):

- `useOnboardingStore`: `{ isCompleted, completeOnboarding, resetOnboarding }`, localStorage 키 `chatic-onboarding-completed`
- `useAppPreferenceStore`: `{ blurLastMessage, setBlurLastMessage }`, localStorage 키 `chatic-blur-last-message`
- 유닛 테스트 작성. `useServiceStatusStore`는 신설 말고 web-core `useServiceUnavailable()` 사용.

### 3.8 초대 (딥링크 유지 + 프로세스 분해)

- **딥링크 형식 초대 링크는 계속 지원**(전송 형식 교체 아님).
- 문제: `LoginPage`의 8단계 `handleAccept`에 파싱+인증+토큰+캐시+진입이 전부 몰림.
- 분해: ① `parseInviteInput`(딥링크 쿼리파라 파싱을 한 모듈로, 정규화 `InvitePayload` 반환) ② `useInviteAccept`(payload→`loginWithInviteCode`→`repos.cloud.cacheWrite({cloudType:'invited'})`→일반 `switchCloud` 진입; 직접 cloudCore/store 조작 제거) ③ `LoginPage`는 UI 상태만.
- 배치 초대: `MyUserInviteBody`가 단건 구조로 바뀜 → `requestInviteBatch`/`useCreateInviteBatch`의 배치 계약 재설계 필요(신 입력 타입 확인).
- `setOAuthProvider`/`setIsInvitedSession`은 로그인/초대 서비스가 내부 처리 — 수동 호출 제거.

### 3.9 부트스트랩 (app.tsx)

명령형 `getRuntimeManager().ensure()` + 조건부 `<WebSocketV2Connection>` → 선언형:

```tsx
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';
import { useSocketDelegate } from './runtime/useSocketDelegate'; // testbed에서 이식

function AppInner() {
    const binding = useRuntimeBinding();
    const delegate = useSocketDelegate();
    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
            {/* router */}
        </RuntimeConnectionHost>
    );
}
```

`SessionBackgroundRunner`가 init/keepalive/token-refresh를 구동하므로 수동 `useInitWebCore`/`useTokenRefresh` 마운트는 testbed와 대조해 제거. `useSocketDelegate`는 testbed `apps/testbed/src/app/hooks/useSocketDelegate.ts` 그대로 이식(위치는 `app/runtime/`).

### 3.10 리프레시 타이밍 + 델타(syncMeta)

- (a) 앱 진입 + (b) 사이트/클라우드 전환 확정 → `useSocketState().isVerified` **상승 엣지**(false→true)에서 `refreshActiveLists()` 호출.
- (c) 주기 폴링: 리스트 발견용 `setInterval(30s)`(전환 중 skip) + per-item `sync.registerChannel/registerPlace`(5s).
- `refreshActiveLists` = `place.refreshList()` + channel/profile **syncMeta 델타**:
    ```ts
    const since = await repos.syncMeta.getSyncedAt(`channel-sync:${cid}`);
    const { syncedAt } = await repos.channel.syncChannels(since);
    await repos.syncMeta.setSyncedAt(`channel-sync:${cid}`, syncedAt);
    // profile: `profile-sync:${cid}:${sid}` + repos.profile.syncProfiles(since)
    ```
    `apps/web useChannels.ts`에 이미 유사 루프가 있으니 공용 헬퍼로 추출.

---

## 4. 컴포넌트별 작업 인벤토리 (제거-심볼 → 할 일)

각 항목 = 한 번에 마이그레이션할 "컴포넌트". 파일 안의 모든 제거-심볼을 §3 레시피로 처리하고 tsc로 단조 감소 확인.

### A. 무위험(완료/즉시 가능) — reader & util & store

- `routes/index.tsx`, `routes/guards/AuthGuard.tsx`: `useWebCoreStore`→`useSessionAuth`
- `features/mypage/pages/ProfileEditPage.tsx`, `features/home/components/ProfileEditModal.tsx`, `features/account/pages/SignupEmailPage.tsx`: `useWebCoreStore.profile`→`useSessionIdentity().activeProfile`
- `features/mypage/pages/AccountInfoPage.tsx`: `useUserContext().permissions`→`useSessionIdentity()`
- `features/chats/pages/ChatSettingsPage.tsx`: useDynamicProfile+useUserContext+toError
- `shared/hooks/useChats.ts`,`useChatMutations.ts`,`useUserMutations.ts`,`useChannel.ts`: `useDynamicProfile`→`useSessionIdentity().activeProfile`
- `features/home/components/ChannelList.tsx`: `useAppPreferenceStore`(로컬)+`currentWSS`→`activeServer.kind`
- `components/ServiceUnavailableOverlay.tsx`: `useServiceStatusStore`→`useServiceUnavailable()`
- util 5파일(SubscriptionSelectDialog/useCreateChannel/SubscriptionPage/AddFriendSheet/InviteFriendsDialog): `toError` 로컬 util
- `shared/stores/useOnboardingStore.ts`·`useAppPreferenceStore.ts` 신설 + 테스트
- `shared/hooks/useCanCreatePlace.ts`,`useCanCreateChannel.ts`: useCloudSession→useCloudSessionCatalog + 세션 reader
- `shared/hooks/useInviteMutations.ts`: repo `inviteCloud`→`cloud.cacheWrite`(DomainCloud)
- `features/search/pages/SearchPage.tsx`: selectedPlaceId→`useSessionSelection().selectedSiteId`

### B. 데이터 훅 (V2 observe/sync 재작성 — §3.3)

- `shared/hooks/useChannels.ts` (socket store + cloudCore + currentWSS + V1 repo + syncChannels 델타)
- `shared/hooks/useChats.ts`(ChatFeedPayload 등 sockets-api 타입), `useTotalUnreadCount.ts`(selectedPlaceId + subscribeList), `usePlaceUnreadCounts.ts`(socket store + cloudCore), `useChannelMembers.ts`(ChatUsersPayload + subscribeList), `usePlaces.ts`(socket store), `features/chats/hooks/useCreateInviteBatch.ts`(MyUserInviteBody 재설계)
- `shared/utils/waitForVerified.ts`: `useWebSocketV2Store.subscribe`→`getSocketManager().subscribe()`(app-runtime)

### C. 세션 동기화/재인증 훅 (제거 또는 재작성 — §3.6)

- `shared/hooks/useConnectionRecoverySync.ts`: `useWebSocketV2Store.subscribe`→`useSocketState`/`getSocketManager` 기반. (sync 런타임이 reconnect catch-up 담당 → 중복 시 축소/제거 검토)
- `shared/hooks/useForegroundResync.ts`, `useForegroundTokenRefresh.ts`: `checkSocketHealth`/`getSocketSend`/수동 `auth:update` **제거**(SocketAuthBinder 자동). isAuthenticated→useSessionAuth.
- `shared/hooks/useSocketAuth.ts`: 수동 `auth:update` emit 제거(delegate가 처리) — 훅 자체 제거 가능성 검토.

### D. 클라우드/사이트 전환 (§3.6)

- `features/home/components/PlaceList.tsx` (useWebSocketV2+store, cloudCore 다수 쓰기/읽기, useWebCoreStore setProfile)
- `features/home/components/CloudSessionSheet.tsx` (useWebSocketV2Store, cloudCore, useCloudSession, useWebCoreStore)
- `shared/hooks/useCloudSwitchFlow.ts` (cloudCore 쓰기 다수, useWebСoreStore, useCloudSession, toError, socket store)

### E. 로그인/로그아웃/초대 (§3.4/3.5/3.8)

- 로그인: `features/auth/pages/LoginPage.tsx`(대형, 초대 handleAccept 포함), `TokenLoginPage.tsx`, `TokenTestLoginPage.tsx`, `OAuthResponsePage.tsx`, `features/mypage/pages/LoginPage.tsx`, `DebugLoginPage.tsx`
- 로그아웃: `LogoutPage.tsx`, `HomePage.tsx`, `MyPage.tsx`, `DebugPage.tsx`, `WithdrawalPage.tsx`, `Sidebar.tsx` (+ 캐시 클리어)
- 초대: `parseInviteInput`/`useInviteAccept` 신설, `features/chats/apis/invite-api.ts`, `InviteFriendsDialog.tsx`

### F. 부트스트랩 & 디버그/기타

- `app/app.tsx` (§3.9), `app/runtime/useSocketDelegate.ts` 신설
- `features/home/pages/HomePage.tsx`(onboarding+useDynamicProfile+useUserContext+cloudCore+useCloudSession+socket store+useLogout — 대형, 여러 클러스터 교차)
- `features/mypage/pages/MyPage.tsx`, `DebugStatePage.tsx`, `components/SettingsDialog.tsx`(webCore+onboarding+useWebSocketV2 lastMessage), `shared/components/Sidebar.tsx`
- `features/places/pages/PlaceInfoPage.tsx`/`PlaceOrderPage.tsx`(cloudCore getCloudToken/placeOrder — `getPlaceOrder`/`savePlaceOrder` 공개 대체 확인 필요 §6)
- `features/mypage/pages/CloudProfileEditPage.tsx`/`AccountManagePage.tsx`/`WithdrawalPage.tsx`

> 권장 순서: **A(reader/store/util) → B(데이터 훅) → C(동기화 훅) → D(전환) → E(로그인/로그아웃/초대) → F(부트스트랩/대형 페이지)**. A를 먼저 끝내면 세션 reader가 안정되어 이후 파일이 쉬워진다. app.tsx 부트스트랩은 의존이 많으니 마지막 근처에.

---

## 5. 컴포넌트 1개 마이그레이션 절차 (반복)

1. 대상 파일에서 제거-심볼/소켓 import 식별 (`grep`).
2. §2 매핑 + §3 레시피로 import·호출부 치환. 파일 내 **모든** 제거-심볼을 한 번에.
3. 새 로직(스토어/유틸/헬퍼/초대 파서 등)에는 영어 주석 + **유닛 테스트**.
4. repo 사용 시 `as unknown as DataRepositoriesV2` 캐스팅(dist V1 타입 회피).
5. 루트에서 tsc 측정 → 에러 수가 줄었는지(증가 없는지) 확인. 해당 파일 잔여 에러 0 확인.
6. socket import 제거 시 `grep -rl "@chatic/socket"` 파일 수 감소 확인.
7. 커밋(파일/컴포넌트 단위). 디렉터리 이동은 별도 커밋.

---

## 6. 미해결/확인 필요 (구현 중 결정)

- `createCredentialsByProvider`가 세션 auth를 hydrate하는가? 아니면 로그인 후 세션 재평가 경로 필요? (authRuntime.ts 확인 + 런타임 검증)
- `cloudCore.getPlaceOrder()/savePlaceOrder()`의 공개 대체 — 없으면 app-local 보관 or 신 API 확인.
- `MyUserInviteBody` 단건화에 따른 배치 초대(`requestInviteBatch`)의 신 계약 — 서버/`repos.user` V2 입력 확인.
- `useRegisterDevice` 신 이름 확인.
- invited-cloud 재진입 경로를 일반 `switchCloud`로 통일 가능 여부(런타임 검증).
- 데이터 훅을 "최소 정합(게이팅만 useSocketState)"로 둘지 "전면 sync 훅 채택(§3.3 후반)"으로 갈지 — 후자가 목표지만 회귀 부담 큼.

---

## 7. 참조

- 아키텍처/근거: [`runtime-migration.md`](./runtime-migration.md)
- 참조 구현(필독): `apps/testbed/src/app/{app.tsx, hooks/useSocketDelegate.ts, pages/ChatHomePage.tsx, pages/CreateChannelPage.tsx}`
- 신 API 소스: `libs/web-core/src/hooks/{session/readers, session/actions, auth, app}`, `libs/app-runtime/src/{connection, socket, runtime}`, `libs/data/src/data/repositories-v2`
- 라이브러리 docs: `libs/web-core/docs`, `libs/app-runtime/docs`
- 상세 진행 로그/베이스라인(266 에러): `~/.claude/plans/chatic-front/web-runtime-migration.md`
