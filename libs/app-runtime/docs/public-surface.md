# App Runtime Public Surface

> 상태: Live · 최종 갱신: 2026-09-02

## 목적

`@chatic/app-runtime`를 사용하는 앱이 어떤 공개 표면을 기준으로 런타임을 조립하는지 정의한다.

원칙:

- 값은 훅으로 읽는다.
- lifecycle은 컴포넌트 마운트로 제어한다.
- session/socket/http/sync/data의 내부 구현 세부는 외부에 새지 않는다.

**정본은 코드다.** 아래 표의 심볼은 **예시**이고(표면이 계속 다듬어지는 중이다), 루트 배럴([`src/index.ts`](../src/index.ts))은 `export *`를 쓰는 폴더가 있어도
공개 값 집합은 [`src/public-surface.test.ts`](../src/public-surface.test.ts)가 목록으로 잠근다 —
심볼을 더하거나 빼려면 그 목록을 고쳐야 하므로 표면 변경이 항상 의도적 행위로 드러난다. 이 문서는
그 집합을 **범주로** 설명하고, 심볼 단위 진리는 그 테스트가 갖는다.

## 공개 표면 (범주별)

### 1. 값 파생 훅 (`runtime/`)

| 심볼                                           | 설명                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `useRuntimeBinding()`                          | 세션 기준 `RuntimeBinding` 파생(데이터 컨텍스트 + relay/cloud 듀얼 슬롯)                  |
| `useRuntimeRepositories()`                     | 현재 스코프에 바인딩된 repository 조회                                                    |
| `useRuntimeProfile()`                          | 파생 세션 프로필(`SessionProfile`: userRole/isGuest/isCloudActive/userName/photo)         |
| `useRuntimeSocketState()`                      | socket 연결/인증 상태(`isConnected`/`isVerified`)                                         |
| `useKindVerified(kind)`                        | **kind별** verified 상태 — active 슬롯이 무엇이든 무관하게 relay/cloud 고정 요청을 게이팅 |
| `useGlobalCacheSearch()` · `globalCacheRefKey` | 스코프 횡단 캐시 검색 표면                                                                |
| `useConnectivity()` → `ConnectivityStatus`     | 연결 상태 진리표의 파생 결과                                                              |

### 2. 세션 허브 (`session/`)

세션은 이 패키지가 소유한다([session/architecture.md](./session/architecture.md)). 배럴은 세 층을 낸다.

| 층                      | 대표 심볼                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **readers (훅)**        | `useGlobalSession` · `useSessionAuth` · `useSessionIdentity` · `useSessionSelection`                                                                                                                     |
| **액션 (훅)**           | `useSiteSwitch` · `useSessionLogout` · `useLogoutCloudSession` · `useSwitchCloudSession` · `useInviteFlow`                                                                                               |
| **로그인·인증 (훅)**    | `useLogin` · `useLoginRelayGuestByDevice` · `useLoginRelaySocial` · `useRegisterUser` · `useRegisterUserV2` · `useFindAlias` · `useVerifyAlias` · `useInviteInfo`                                        |
| **앱 lifecycle (훅)**   | `useRelaySessionInit` · `useRelaySessionKeepAlive` · `useDynamicDeviceId` · `useRegisterDeviceToken` · `useServiceUnavailable` · `useSessionStalenessGuard`(relay) · `useCloudCredentialGuard`(cloud)    |
| **비-React 유스케이스** | `loginRelay*` · `logoutRelaySession` · `logoutCloudSession` · `switchCloudSession` · `initializeRelaySession` · `createCredentialsByProvider` · `registerUserWithInviteCode` · `fetchInviteInfoWithCode` |
| **스토어 리더**         | `getGlobalSessionContext` · `getCloudSessionContext` · `getIdentityContext` · `getSelectedCloudId` · `getCommittedCloudId` · `getActiveServerContext` …                                                  |
| **SDK 브리지**          | `getServerAuthRegistration` · `signServerAuth` · `commitServerRefreshedToken`                                                                                                                            |

스토어 **쓰기** 심볼 일부(`setSelectedCloudId` · `setSessionAuthenticated` · `rebuildSessionIdentity` …)도
배럴에 있다. 이건 앱이 세션을 직접 조작하라는 초대가 아니라 런타임 내부·테스트·특수 진입점을 위한
표면이다 — **앱 화면 코드는 훅 층만 소비한다.**

### 3. 소켓 액션 (비-훅)

| 심볼                             | 용도                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applySessionToken(options)`     | verify-hash-alias `$token` 커밋 + same-connection relay 소켓 재인증                                                                                                                         |
| `recoverUnverifiedSockets(deps)` | 포그라운드/wake 시 물린 소켓 킥 — 앱이 자기 포그라운드 신호에서 호출                                                                                                                        |
| `requestRelaySessionRefresh()`   | "relay 자격증명을 신선하게" 유일 진입점. **소켓 소유 refresh만** — 소켓이 없거나 이번 연결의 핸드셰이크(`device.save:ok` → `auth.update`)가 안 끝났으면 `false`. relay 전용(cloud는 재발급) |

### 4. 매니저 진입점 · 타입

`getSocketManager()` · `getSyncManager()` · `ISocketManager` · `SessionProfile` · `DeviceTokenDelegate` ·
`ConnectivityStatus`.

### 5. sync 등록 훅

`useChatSync` · `useChannelSync` · `usePlaceSync` — 화면에서 sync target을 등록한다
([sync/README.md](./socket/sync/README.md)).

### 6. lifecycle 컴포넌트 · 훅

| 심볼                                   | 설명                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `<RuntimeConnectionHost>`              | 런타임 조립 루트 + 세션 init 게이트 + delegate 소유(내부 바인더 마운트)              |
| `<RuntimeAuthHost>`                    | 데이터 바인딩 없는 축소판 Host                                                       |
| `useDeviceTokenRegistration(delegate)` | 네이티브 셸 푸시 토큰 force 등록(스로틀·재시도) — [push/README.md](./push/README.md) |

### 7. 데이터·캐시 정책

| 심볼                                                                                | 설명                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initAppRuntime({ data? })`                                                         | **부팅 진입점.** 앱 엔트리가 render 전에 한 번 호출한다. 세션 store env 주입 + 자격증명 복구 배선 + `data` 정책 등록(데이터 런타임 생성 **전**이어야 하고, 늦으면 경고 후 무시). 순서 계약은 [architecture.md §부팅](./architecture.md) |
| `setNativeCacheSupport(report)` · `getNativeCacheSupport()`                         | 네이티브가 핸드셰이크로 보고한 저장 가능 타입·스키마 버전. 웹 선배포 스큐 방어                                                                                                                                                          |
| `isNativeApp()`                                                                     | 네이티브 WebView 여부                                                                                                                                                                                                                   |
| `getCacheMetricsSource()`                                                           | 디버그 오버레이가 보는 `@chatic/db` 계측 — 앱이 엔진 lib를 직접 import하지 않게 하는 유일 통로                                                                                                                                          |
| `useInvitedCloudNameSync` · `recoverInvitedCloudIfMissing` · `syncInvitedCloudName` | 초대클라우드 내구성([data/invite-cloud-durability.md](./data/invite-cloud-durability.md))                                                                                                                                               |
| `createChatOutbox(options)`                                                         | 오프라인 아웃박스 **머신만**. 활성화는 앱의 opt-in이고, apps/web은 생성하지 않는다                                                                                                                                                      |

### 8. HTTP·리포팅·transport 재수출

앱이 `@chatic/http`·`@chatic/web-config`를 직접 보지 않도록 허브가 재수출한다.

- **리포팅**: `reportIssue` · `uploadLogBatch` · `sanitizeReportUrl` · `redactQueryString` ·
  `toError` — 자동 에러 리포트(`reportError`·`classifyReport`)는 2026-09에 폐지됐다. 에러는
  이제 `logger.error` 엔트리로 배치 업로더가 올린다. 표면은 그대로지만 구현은 `src/report/`로
  옮겼다(2026-09-02): 전송을 `data`의 `report` repository에 넘겼으므로 이 모듈은 더 이상
  `http/` 소속이 아니고, `http/**`는 세션·data가 함께 의존하는 leaf로 남는다
- **transport**: `webTransport` · `startWebTransportInit` · `hasStoredRelaySession` ·
  `isStoredSessionExpired`
- **env 상수**: `ENV` · `PROJECT` · `LANGUAGE_KEY` · `SOCIAL_OAUTH_ENDPOINT`

### 9. REST 데이터 훅 (잔여)

`useRegisterDeviceTokenMutation`(런타임 자신이 호출) · `cloudsKeys`(로그인 직후 무효화)만 남았다.
clouds·subscription·users·profile 훅 13종은 소비자가 화면뿐이고 react-query가 캐시 전부라 **앱
레이어로 내려갔다**. catalog 사본이 앱마다 있는 것은 의도된 중복이다 — 공유되는 것은 repository
호출과 `cloudsKeys`이고, staleness 정책은 각 앱이 갈라질 자유를 갖는다.

## 외부에서 알 필요 없는 것 (비공개)

- **소켓 세션 액션 원함수** `switchSite` · `logoutSession` · `logoutCloudSession`(소켓 판) —
  `src/socket/auth/`에 있고 루트에서 export하지 않는다. 앱은 `useSiteSwitch`/`useSessionLogout`/
  `useLogoutCloudSession` 훅으로만 소비한다.
- **소켓 배선 함수** `bootstrapSocketConnection` · `reauthenticateActiveSocket` ·
  `renewCloudSession` — 바인더/가드가 내부에서만 호출한다.
- **connection 바인더** `<SocketBinder>` · `<SocketReauthBinder>` — `RuntimeConnectionHost`가
  내부에서 마운트한다. (`<RuntimeDataBinder>`는 삭제됐다 — 밀어 넣을 스코프가 없다.)
- **delegate 계약** `SocketSessionDelegate` (`socket/auth/types.ts`) — `useSocketSessionDelegate`가
  내부에서만 배선한다.
- **저수준 socket 타입** `SocketKind` · `SocketBindingConfig` · `SocketState` — 내부 전용.
- **HTTP 조립** `getHttpManager` · `createHttpManager` · `cloudGateway`/`oauthGateway`/`userGateway`/
  `subscriptionGateway` — `data/`의 데이터소스만 잡는다. 앱이 게이트웨이를 보지 않는다.
- **cloud 토큰 재발급** `session/auth/cloudTokens` — `useCloudCredentialGuard`와
  `switchCloudSession`이 내부에서 공유한다.
- `useSyncTarget` · `useProfileSync` — 내부 전용(앱 미사용).
- `getSocketRuntime()` · `getDataRuntime()` · `getDataManager()` — 조립체 접근자. **export하지 않는다**.
- `DataManager` · `SyncManager` · `SocketManager` 클래스, `createSyncPlans()`, `ActiveScope`.
- `RuntimeBinding` / `RuntimeSocketSlot` **타입** — `useRuntimeBinding()` 반환값으로만 소비.
- `createClientSocketV2` · `createDeviceRuntime` · raw `ClientSocketV2` · raw sync runtime.

## 앱 조립 예시

```tsx
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

const App = () => {
    const binding = useRuntimeBinding();
    return (
        <RuntimeConnectionHost binding={binding}>
            <MainLayout />
        </RuntimeConnectionHost>
    );
};
```

설명:

- `RuntimeConnectionHost`는 **`{ binding, children }`만** 받는다. delegate는 Host 내부
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
