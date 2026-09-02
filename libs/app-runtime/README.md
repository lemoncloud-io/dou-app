# @chatic/app-runtime

Chatic 앱의 **런타임 단일 창구**입니다. 세션(토큰·선택 상태·identity·스코프)을 소유하고, 그
세션으로부터 WebSocket 연결·HTTP 클라이언트·repository 그래프·sync 런타임을 파생시키는
**Composition Root** 라이브러리입니다.

앱이 직접 import하는 런타임 패키지는 `@chatic/app-runtime`와 `@chatic/data` 둘뿐입니다.
`@chatic/http` · `@chatic/db` · `@chatic/auth-sign` · `@chatic/web-config`는 이 라이브러리가
조립하는 대상이며 앱 코드에 새지 않습니다.

---

## 핵심 컨셉

앱은 **"값은 훅으로 읽고, lifecycle은 컴포넌트를 마운트하여 제어한다"** 는 원칙으로 동작합니다.

세션 상태의 유일한 보관처·writer는 이 패키지의 `session/store`입니다. 스토어는 **수동적**이라
저장과 통지만 하고, 소켓·데이터·HTTP를 모릅니다.

소켓 인증 수명주기는 SDK(`@lemoncloud/chatic-sockets-lib`)의 `ClientSocketAuth`가 소유합니다.
app-runtime은 부팅 시 토큰을 `register`하고 상태를 구독만 하며, **refresh 엔드포인트를 직접 치는
코드는 이 리포에 없습니다** — 자세한 소유 경계는 [docs/socket/auth/README.md](docs/socket/auth/README.md).

---

## 사용 방법 (How to Use)

먼저 엔트리(`main.tsx`)에서 런타임을 **부팅**합니다. render 전에 한 번, 앱의 로깅 배선 뒤에,
세션을 읽는 어떤 코드보다 앞에 옵니다 — 자세한 순서 계약은 [docs/architecture.md §부팅](docs/architecture.md).

```ts
import { initAppRuntime } from '@chatic/app-runtime';

initAppRuntime({ data: { cache: { maxChatsPerChannel: 1000 } } }); // data는 선택
```

그다음 컴포넌트 트리에서 런타임을 조립합니다. `RuntimeConnectionHost`는 **`binding`만** 받으며,
소켓 인증 delegate는 Host가 내부에서(`useSocketSessionDelegate`) 소유하므로 앱이 주입하지 않습니다.

```tsx
import React from 'react';
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

export const App = () => {
    // 세션 상태를 관측해 데이터 컨텍스트 + relay/cloud 소켓 슬롯을 파생시킵니다.
    const binding = useRuntimeBinding();

    return (
        // Host가 세션 init을 게이트하고, 완료 후 아래를 마운트합니다:
        //   SocketBinder · SocketReauthBinder
        //   (relay keep-alive는 Host가 게이트 위에서 useRelaySessionKeepAlive로 인라인 호출)
        <RuntimeConnectionHost binding={binding}>
            <MainLayout />
        </RuntimeConnectionHost>
    );
};
```

조립 구조·마운트 순서는 [docs/runtime/session-lifecycle.md](docs/runtime/session-lifecycle.md)를 참조하세요.

---

## 주요 API 및 Hooks

### 1. 데이터 리포지토리 획득 (`useRuntimeRepositories`)

현재 활성 스코프(`cid`/`sid`/`uid`)에 바인딩된 Chatic 리포지토리 묶음을 가져옵니다.

```tsx
import { useRuntimeRepositories } from '@chatic/app-runtime';

const ChannelListPage = () => {
    const { channel } = useRuntimeRepositories();
    // channel 등 도메인 리포지토리로 조회/구독. 조립 규칙은 docs/data/README.md 참조.
    return <div>Channel List</div>;
};
```

### 2. 소켓 연결 상태 관측 (`useRuntimeSocketState`)

물리 소켓의 연결 여부와 핸드셰이크 인증 성공 여부를 관측합니다.

```tsx
import { useRuntimeSocketState } from '@chatic/app-runtime';

const ConnectionStatusBadge = () => {
    const { isConnected, isVerified } = useRuntimeSocketState();
    return (
        <span className={isVerified ? 'bg-green-500' : 'bg-red-500'}>
            {isConnected ? (isVerified ? 'Online' : 'Authenticating') : 'Offline'}
        </span>
    );
};
```

### 3. 그 외 공개 표면

- 값 파생 훅: `useRuntimeBinding` · `useRuntimeRepositories` · `useRuntimeProfile` ·
  `useRuntimeSocketState` · `useKindVerified` · `useGlobalCacheSearch`
- 세션 훅: readers(`useGlobalSession` · `useSessionAuth` · `useSessionIdentity` ·
  `useSessionSelection`) · 액션(`useSiteSwitch` · `useSessionLogout` · `useLogoutCloudSession` ·
  `useSwitchCloudSession` · `useInviteFlow`) · 로그인(`useLogin` · `useLoginRelaySocial` …)
- sync 등록 훅: `useChatSync` · `useChannelSync` · `usePlaceSync`
- lifecycle: `<RuntimeConnectionHost>` · `<RuntimeAuthHost>` · `useDeviceTokenRegistration(delegate)`
- 매니저: `getSocketManager` · `getSyncManager`

전체 목록·비공개 항목은 [docs/public-surface.md](docs/public-surface.md).

---

## 관련 문서 가이드

내부 구현·도메인 사양은 `docs/` 폴더를 참조하십시오.

- **[전체 아키텍처 개요](docs/architecture.md)** — 5축 소유 규칙, 스코프 세 뷰, 모듈 구조
- **[공개 인터페이스 리스트](docs/public-surface.md)** — 노출 훅/컴포넌트/타입
- **[세션 허브](docs/session/architecture.md)** — store·auth·scope·hooks, refresh 소유, `ActiveScope`
- **[소켓 도메인](docs/socket/README.md)** — 듀얼 슬롯·active-facade·bootstrap·switch/logout
- **[인증(SDK ClientSocketAuth)](docs/socket/auth/README.md)** — 소유 경계·상태 머신·서명/writeback
- **[런타임 바인딩](docs/runtime/README.md)** — `RuntimeBinding` 파생·바인더 역할
- **[데이터 런타임 및 캐싱](docs/data/README.md)** — 레포지토리 조립·캐시 정책
- **[Sync 도메인](docs/socket/sync/README.md)** — `SyncManager`·plan·target 등록
