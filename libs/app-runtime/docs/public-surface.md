# App Runtime Public Surface

## 목적

`@chatic/app-runtime`를 사용하는 앱이 어떤 공개 표면을 기준으로 런타임을 조립하는지 정의한다. 실제 export는 `src/index.ts` 기준이다.

원칙:

- 값은 훅으로 읽는다.
- lifecycle은 컴포넌트 마운트로 제어한다.
- socket/session/sync/data의 내부 구현 세부는 외부에 새지 않는다.

## 공개 표면 (`src/index.ts`)

루트 배럴(`src/index.ts`)은 **명시적 named export만** 한다 — `export *` 배럴을 쓰지 않으므로 내부 배선(소켓 auth bootstrap/reauth, connection 바인더, 저수준 socket 타입, raw session 액션)은 새지 않는다. 공개 값 export 집합은 `src/public-surface.test.ts`가 잠근다.

| 구분               | 심볼                                                                  | 설명                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 값 파생 훅         | `useRuntimeBinding()`                                                 | 활성 서버 기준 `RuntimeBinding` 파생(듀얼 소켓 슬롯 + auth)                                                                                                             |
| 값 파생 훅         | `useRuntimeRepositories()`                                            | 현재 data context에 바인딩된 repository 조회                                                                                                                            |
| 값 파생 훅         | `useRuntimeProfile()`                                                 | 파생 세션 프로필(`SessionProfile`: userRole/isGuest/isCloudActive/userName/photo)                                                                                       |
| 값 파생 훅         | `useRuntimeSocketState()`                                             | socket 연결/인증 상태(`isConnected`/`isVerified`)                                                                                                                       |
| 세션 액션 훅       | `useSiteSwitch` · `useSessionLogout` · `useLogoutCloudSession`        | site 전환 / relay·cloud 로그아웃(소켓 구동 액션의 react-query 래퍼, `src/session/`)                                                                                     |
| sync 등록 훅       | `useChatSync` · `useChannelSync` · `usePlaceSync`                     | 화면에서 sync target 등록([sync/README.md](./socket/sync/README.md))                                                                                                    |
| lifecycle 컴포넌트 | `<RuntimeConnectionHost>`                                             | 런타임 조립 루트 + web-core init 게이트 + delegate 소유(내부 바인더 마운트)                                                                                             |
| lifecycle 훅       | `useDeviceTokenRegistration(delegate)`                                | 네이티브 셸 푸시 토큰 force 등록(스로틀·재시도)                                                                                                                         |
| 매니저 진입점      | `getSocketManager()` · `getSyncManager()`                             | socket/sync 매니저 접근                                                                                                                                                 |
| delegate 계약      | `DeviceTokenDelegate`                                                 | 셸별 푸시 토큰 획득/식별자 주입 계약                                                                                                                                    |
| 핵심 타입          | `ISocketManager` · `SessionProfile`                                   | 매니저 반환/프로필 타입                                                                                                                                                 |
| 부팅 전 정책 주입  | `configureDataRuntime(repoOpts, cacheOpts?)` · `setChatCacheLimit(n)` | 데이터 런타임 생성 **전 1회** 등록(늦으면 경고 후 무시). `setChatCacheLimit`은 deprecated — desktop-web 전용 구 이름이며 `configureDataRuntime`의 cache 옵션에 위임한다 |
| 캐시 capability    | `setNativeCacheSupport(report)` · `getNativeCacheSupport()`           | 네이티브가 핸드셰이크로 보고한 저장 가능 타입·스키마 버전. 웹 선배포 스큐 방어                                                                                          |
| 저장소 환경 판별   | `isNativeApp()`                                                       | 네이티브 WebView 여부                                                                                                                                                   |

> **back-compat 별칭:** `useSocketState`(=`useRuntimeSocketState`) · `useSessionProfile`(=`useRuntimeProfile`)은 desktop-web이 리팩터 중이라 churn을 피하려고 남긴 구(舊) 이름 별칭이다. 신규 코드는 `useRuntime*` 이름을 쓰고, desktop-web 마이그레이션 후 제거한다.

## 외부에서 알 필요 없는 것 (비공개)

- **세션 액션 원함수** `switchSite` · `logoutSession` · `logoutCloudSession` — `src/socket/auth/`에 있고 루트에서 export하지 않는다. 앱은 위 `useSiteSwitch`/`useSessionLogout`/`useLogoutCloudSession` 훅으로만 소비한다.
- **소켓 배선 함수** `bootstrapSocketConnection` · `reauthenticateActiveSocket` — `SocketBinder`/`SocketReauthBinder`가 내부에서만 호출한다.
- **connection 바인더** `<RuntimeDataBinder>` · `<SocketBinder>` · `<SocketReauthBinder>` — `RuntimeConnectionHost`가 내부에서 마운트한다.
- **delegate 계약** `SocketSessionDelegate` (`socket/auth/types.ts`) — app-runtime 내부(`useSocketSessionDelegate`)에서만 배선한다.
- **저수준 socket 타입** `SocketKind` · `SocketBindingConfig` · `SocketState` — 내부 전용.
- `useSyncTarget` · `useProfileSync` — 내부 전용(앱 미사용).
- `getSocketRuntime()` · `getDataRuntime()` — 조립체 접근자. **export하지 않는다**.
- `DataManager` · `SyncManager` · `SocketManager` 클래스, `getDataManager()` · `getRepositories()` · `createSyncPlans()`
- `RuntimeBinding` / `RuntimeSocketSlot` **타입** — `useRuntimeBinding()` 반환값으로만 소비.
- `createClientSocketV2` · `createDeviceRuntime` · raw `ClientSocketV2` · raw sync runtime

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

- `RuntimeConnectionHost`는 **`{ binding, children }`만** 받는다. delegate는 Host 내부(`useSocketSessionDelegate`)가 소유하므로 앱이 주입하지 않는다.
- Host 내부에서 `useInitWebCore` init 게이트 뒤에 `RuntimeDataBinder`·`SocketBinder`·`SocketReauthBinder`를 조립하고, relay keep-alive(`useRelaySessionKeepAlive`)는 게이트 위에서 인라인 호출한다([runtime/session-lifecycle.md](./runtime/session-lifecycle.md)).
- 인증 문맥(토큰/site) 변경은 SDK `AuthController`(만료·재연결 자동)와 `SocketReauthBinder`(same-connection 신원 교체)가 담당한다. site 전환은 `useSiteSwitch`(내부 `switchSite` 래퍼).
- sync는 별도 binder 없이 `SyncManager` 내부 서비스로 동작한다.

## 관련 문서

- [architecture.md](./architecture.md)
- [runtime/README.md](./runtime/README.md)
- [socket/README.md](./socket/README.md)
- [sync/README.md](./socket/sync/README.md)
- [data/README.md](./data/README.md)
