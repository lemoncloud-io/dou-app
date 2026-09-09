# App Runtime Public Surface

> 상태: Live · 최종 갱신: 2026-09-08

## 목적

`@chatic/app-runtime`를 쓰는 앱이 어떤 표면을 기준으로 런타임을 조립하는지 정의한다.

원칙:

- 값은 훅으로 읽는다.
- lifecycle은 컴포넌트 마운트로 제어한다.
- session/socket/http/sync/data의 내부 구현 세부는 외부에 새지 않는다.
- **표면은 소비자 축으로 묶인다.** 폴더가 아니라 "무엇을 하려는가"가 그룹이다.

## 형태: 이름 하나, 그룹 일곱

루트 배럴([`src/index.ts`](../src/index.ts))이 공개하는 이름은 **`runtime` 하나**다. 그 아래
[`src/facade.ts`](../src/facade.ts)가 그룹 7개를 얹는다.

```ts
import { runtime } from '@chatic/app-runtime';

const { selectedCloudId } = runtime.session.useSessionSelection();
const repos = runtime.data.useRuntimeRepositories();
<runtime.connection.RuntimeConnectionHost>…</runtime.connection.RuntimeConnectionHost>;
```

그룹을 직접 임포트하게 하지 않는 이유는 이름 충돌이다 — `data`는 소비자 23파일에서, `session`은
17파일, `sync`는 9파일에서 이미 지역 변수다(`const { data } = useQuery()`). 그룹을 값으로
임포트하면 그 파일들이 컴파일되지 않는다. 루트 하나가 그룹 이름을 자연어로 남기는 값이다.

**평탄 별칭은 없다.** 67개 심볼은 원래 평탄이었고 소비자 275파일을 한 번에 그룹으로 옮겼다. 같은
심볼을 두 이름으로 파는 표면은 ADR-0076 결정 6이 지운 범주라서 되돌리지 않는다 —
[`src/public-surface.test.ts`](../src/public-surface.test.ts)의 "최상위는 runtime 하나뿐"이 그것을 잠근다.

**정본은 코드다.** 그 테스트가 그룹 멤버십을 심볼 단위로 잠그므로 심볼을 더하거나 빼거나 **그룹을
옮기려면** 목록을 고쳐야 하고, 표면 변경은 항상 의도적 행위로 드러난다. 이 문서는 그 집합을
범주로 설명한다.

## 그룹별 표면

### `runtime.boot` — 앱 엔트리가 한 번 만지는 것

| 심볼                                                                                          | 설명                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initAppRuntime({ data? })`                                                                   | **부팅 진입점.** render 전에 한 번. 세션 store env 주입 + 자격증명 복구 배선 + `data` 정책 등록(데이터 런타임 생성 **전**이어야 하고, 늦으면 경고 후 무시). 순서 계약은 [architecture.md](./architecture.md) |
| `AppRuntimeConfig` · `DataRuntimeConfig` · `CacheAssemblyOptions` · `DataRepositoriesOptions` | 부팅 옵션 타입 전부. 마지막 것은 `@chatic/data` 소속이지만 여기서 재수출한다 — 런타임을 설정하려고 조립 대상 패키지를 알아야 하는 것이 파사드의 구멍이었다                                                   |
| `setNativeCacheSupport(report)` · `NativeCacheSupport`                                        | 네이티브가 핸드셰이크로 보고한 저장 가능 타입·스키마 버전. 웹 선배포 스큐 방어. 부팅 **후** 비동기로 도착하므로 config 필드가 아니라 setter다                                                                |
| `isNativeApp()`                                                                               | 네이티브 WebView 여부                                                                                                                                                                                        |
| `webTransport` · `startWebTransportInit()`                                                    | sealed transport. `startWebTransportInit`은 앱이 부를 필요가 없어야 하는 프리미티브다 — 유일 init 드라이버는 `connection.RuntimeConnectionHost`이고, desktop-web의 auth 훅 3개가 마지막 호출자다             |
| `ENV` · `PROJECT` · `LANGUAGE_KEY` · `SOCIAL_OAUTH_ENDPOINT`                                  | env 상수(`@chatic/web-config` 재수출 — `import.meta` 격리 leaf)                                                                                                                                              |

### `runtime.session` — 세션 상태·인증

세션은 이 패키지가 소유한다([session/architecture.md](./session/architecture.md)).

| 층                      | 심볼                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **readers (훅)**        | `useGlobalSession` · `useSessionAuth` · `useSessionIdentity` · `useSessionSelection` · `useRuntimeProfile`(→ `SessionProfile`)                                     |
| **액션 (훅)**           | `useSiteSwitch` · `useSessionLogout` · `useLogoutCloudSession` · `useSwitchCloudSession` · `useInviteFlow`                                                         |
| **로그인·인증 (훅)**    | `useLogin` · `useLoginRelayGuestByDevice` · `useLoginRelaySocial` · `useRegisterUserV2` · `useFindAlias` · `useVerifyAlias` · `useInviteInfo`                      |
| **앱 lifecycle (훅)**   | `useDynamicDeviceId` · `useSessionStalenessGuard`(relay) · `useCloudCredentialGuard`(cloud) — 정책은 앱이 준다(`SessionStalenessPolicy` · `CloudCredentialPolicy`) |
| **비-React 유스케이스** | `applySessionToken` · `logoutSession` · `createCredentialsByProvider` · `registerSessionLogoutCallback` · `registerUserWithInviteCode` · `fetchInviteInfoWithCode` |
| **스토어 리더**         | `getGlobalSessionContext` · `getIdentityContext` · `getActiveServerContext` · `getActiveSessionUser` · `getRelaySessionUser` · `patchRelaySessionUser`             |
| **뮤테이션 키**         | `SWITCH_SITE_MUTATION_KEY` · `SWITCH_CLOUD_MUTATION_KEY` — 전역 in-flight 관측(`useBackgroundSync`)이 전환 중 주기 sync를 멈추는 데 쓴다                           |

스토어 **쓰기** 심볼은 이 그룹에 없다. 예전 배럴은 `setSessionAuthenticated` 류 27개를 공개했고
ADR-0076 결정 6이 내렸다 — 세션을 직접 조작하는 것은 런타임 내부의 일이다.

`applySessionToken`·`logoutSession`은 파일이 `socket/auth/`에 있지만 이 그룹이 판다: 소비자에게는
셋 다 세션 개념이고, 그룹은 폴더가 아니다. `useRuntimeProfile`은 반대 방향으로 정리됐다 — 그룹이
`session`이니 파일도 `session/hooks/session/readers/`로 옮겼다(구 `runtime/` 모듈 해체).

### `runtime.connection` — 호스트와 소켓 상태

| 심볼                                       | 설명                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `<RuntimeConnectionHost>`                  | 런타임 조립 루트 + 세션 init 게이트 + delegate·슬롯 소유(내부 바인더 마운트)         |
| `<RuntimeAuthHost>`                        | 같은 Host, 게스트 keep-alive만 off(명시 로그인이 필요한 표면) — 구현은 한 벌         |
| `useRuntimeSocketState()`                  | active 슬롯의 연결/인증 상태(`isConnected`/`isVerified`)                             |
| `useKindVerified(kind)`                    | **kind별** verified — active 슬롯이 무엇이든 무관하게 relay/cloud 고정 요청을 게이팅 |
| `useConnectivity()` → `ConnectivityStatus` | 표시용 연결 판정(진리표는 내부 `deriveConnectivity`)                                 |
| `recoverUnverifiedSockets(deps)`           | 포그라운드/wake 시 물린 소켓 킥 — 앱이 자기 포그라운드 신호에서 호출                 |
| `getSocketManager()` · `ISocketManager`    | 소켓을 직접 구동하는 디버그·lab 표면                                                 |
| `RequestRelaySessionRefreshDeps`           | relay refresh 프리미티브의 주입 시임(프리미티브 자체는 비공개)                       |

### `runtime.data` — repository·캐시·아웃박스

| 심볼                                                                                | 설명                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `useRuntimeRepositories()`                                                          | 현재 스코프에 바인딩된 repository 조회                                                         |
| `useGlobalCacheSearch()` · `globalCacheRefKey`                                      | 스코프 횡단 캐시 검색 표면                                                                     |
| `getCacheMetricsSource()`                                                           | 디버그 오버레이가 보는 `@chatic/db` 계측 — 앱이 엔진 lib를 직접 import하지 않게 하는 유일 통로 |
| `useInvitedCloudNameSync` · `recoverInvitedCloudIfMissing` · `syncInvitedCloudName` | 초대클라우드 내구성([data/invite-cloud-durability.md](./data/invite-cloud-durability.md))      |
| `cloudsKeys`                                                                        | clouds 쿼리 키 — 런타임의 `useLogin`이 로그인 직후 무효화한다                                  |
| `createChatOutbox(options)` · `ChatOutbox` 외 3타입                                 | 오프라인 아웃박스 **머신만**. 활성화는 앱의 opt-in이고 apps/web은 생성하지 않는다              |

REST 훅 13종(clouds·subscription·users·profile)은 **앱 레이어로 내려갔다** — 소비자가 화면뿐이고
react-query가 캐시 전부였다. catalog 사본이 앱마다 있는 것은 의도된 중복이고, 공유되는 것은
repository 호출과 `cloudsKeys`다.

### `runtime.sync` — sync 등록

`useChatSync` · `useChannelSync` · `usePlaceSync` · `getSyncManager()` — 화면에서 sync target을
등록한다([socket/sync/README.md](./socket/sync/README.md)). 이 셋이 감싸는 `useSyncTarget`은 비공개다.

### `runtime.push` — 디바이스 토큰

`useDeviceTokenRegistration(delegate)` · `DeviceTokenDelegate` · `useRegisterDeviceTokenMutation` —
네이티브 셸 푸시 토큰 force 등록(스로틀·재시도), [push/README.md](./push/README.md).

### `runtime.report` — 사용자 제보·로그 업로드

`reportIssue` · `uploadLogBatch` (+ `AppType` · `IssueReportExtras`). 자동 에러 리포트
(`reportError`·`classifyReport`)는 2026-09에 폐지됐고 에러는 `logger.error` 엔트리로 배치 업로더가
올린다. 구현이 `src/report/`인 이유는 전송을 `data`의 `report` repository에 넘겼기 때문이다 —
여기는 전송 계층이 아니라 세션에서 payload를 조립하는 자리다. payload 스크러버
(`sanitizeReportUrl`·`redactQueryString`)는 비공개다.

## 외부에서 알 필요 없는 것 (비공개)

- **소켓 세션 액션 원함수** `switchSite` · `logoutCloudSession`(소켓 판) ·
  `requestRelaySessionRefresh` — `src/socket/auth/`에 있고 루트에서 export하지 않는다. 앱은
  `useSiteSwitch` / `useLogoutCloudSession` / `useSessionStalenessGuard` 훅으로만 소비한다.
  **`logoutSession`은 예외로 공개다** — admin-v2의 `useRelaySessionGuard`가 React 밖(좀비 세션
  정리 타이머)에서 부르므로 훅이 답이 될 수 없다.
- **세션 유스케이스 원함수** `initializeRelaySession` · `loginRelayUser` · `loginRelaySocial` ·
  `loginRelayGuestByDevice` · `switchCloudSession` · `getSelectedCloudId` · `useRelaySessionInit` —
  앱은 전부 훅으로 쓴다(`useLogin` · `useLoginRelaySocial` · `useSwitchCloudSession` ·
  `useSessionSelection`). 부팅 게이트는 호스트가 소유한다.
- **소켓 배선 함수** `bootstrapSocketConnection` · `reauthenticateActiveSocket` ·
  `renewCloudSession` — 바인더/가드가 내부에서만 호출한다.
- **connection 바인더** `<SocketBinder>` · `<SocketReauthBinder>` — `RuntimeConnectionHost`가
  내부에서 마운트한다. (`<RuntimeDataBinder>`는 삭제됐다 — 밀어 넣을 스코프가 없다.) 이 둘은
  `connection/index.ts`의 `export *` 때문에 2026-09-08까지 **사고로 공개**돼 있었다. 같은 배럴이
  내던 `deriveConnectivity`(표시 판정의 진리표)도 같이 내렸다.
- **delegate 계약** `SocketSessionDelegate` (`socket/auth/types.ts`) — `useSocketSessionDelegate`가
  내부에서만 배선한다.
- **저수준 socket 타입** `SocketKind` · `SocketBindingConfig` · `SocketState` — 내부 전용.
- **transport 프로브** `hasStoredRelaySession` · `isStoredSessionExpired` · `resetWebTransportInit`,
  **네이티브 캐시 리더** `getNativeCacheSupport` — 읽기 소비자가 런타임 내부(가드·부팅)와 테스트
  시임뿐이다 (ADR-0076 결정 6).
- **호스트 props 타입** `RuntimeHostProps` — `slots` 주입은 테스트용 문이라 표면에 없다.
- **HTTP 조립** `getHttpManager` · `createHttpManager` · `cloudGateway`/`oauthGateway`/`userGateway`/
  `subscriptionGateway` — `data/`의 데이터소스만 잡는다. 앱이 게이트웨이를 보지 않는다.
- **cloud 토큰 재발급** `session/auth/cloudTokens` — `useCloudCredentialGuard`와
  `switchCloudSession`이 내부에서 공유한다.
- `useSyncTarget` — 내부 전용(앱 미사용). 같은 파일의 `useChatSync`/`useChannelSync`/`usePlaceSync`가
  이것을 감싸고, 그 셋은 앱이 쓴다. `useProfileSync`는 소비자가 0이어서 2026-09-07에 삭제했다 —
  프로필 동기화가 필요한 앱은 `syncManager.registerProfile()`을 직접 부른다(`apps/web`의
  `useChannelProfiles`).
- `getDataRuntime()` · `getDataManager()` — 조립체 접근자. **export하지 않는다**. (`getSocketRuntime()`은
  아예 없어졌다 — 소켓과 sync는 각자 생성 지점을 갖는다.)
- `DataManager` · `SyncManager` · `SocketManager` 클래스, `createSyncPlans()`, `ActiveScope`.
- `useRuntimeSocketSlots()` + `RuntimeSocketSlots` / `RuntimeSocketSlot` **타입** — 호스트
  (`RuntimeConnectionHost`·`RuntimeAuthHost`)가 내부에서 파생하므로 앱 소비자가 0이다. 예전엔
  `useRuntimeBinding`으로 공개돼 있었고 앱 4곳이 불러 호스트에 되돌려 줬다 (ADR-0076 G5).
- `createClientSocketV2` · `createDeviceRuntime` · raw `ClientSocketV2` · raw sync runtime.

## 앱 조립 예시

```tsx
import { runtime } from '@chatic/app-runtime';

const App = () => {
    // Host가 소켓 슬롯을 스스로 파생한다 — 앱은 넘기지 않는다.
    return (
        <runtime.connection.RuntimeConnectionHost>
            <MainLayout />
        </runtime.connection.RuntimeConnectionHost>
    );
};
```

설명:

- `RuntimeConnectionHost`는 **`children`만** 받는다(`slots`는 테스트용 오버라이드다). delegate는 Host 내부
  (`useSocketSessionDelegate`)가 소유하므로 앱이 주입하지 않는다.
- Host 내부에서 `useRelaySessionInit` init 게이트 뒤에 바인더들을 조립하고, relay keep-alive
  (`useRelaySessionKeepAlive`)는 게이트 위에서 인라인 호출한다
  ([runtime/session-lifecycle.md](./runtime/session-lifecycle.md)).
- 인증 문맥(토큰/site) 변경은 SDK `ClientSocketAuth`(만료·재연결 자동)와 `SocketReauthBinder`
  (same-connection 신원 교체)가 담당한다. site 전환은 `useSiteSwitch`.
- sync는 별도 binder 없이 `SyncManager` 내부 서비스로 동작한다.

## 관련 문서

- [architecture.md](./architecture.md)
- [session/architecture.md](./session/architecture.md)
- [runtime/README.md](./runtime/README.md)
- [socket/README.md](./socket/README.md)
- [socket/sync/README.md](./socket/sync/README.md)
- [data/README.md](./data/README.md)
