# @chatic/app-runtime

이 패키지는 Chatic 어플리케이션의 세션 바인딩, WebSocket 연결 관리, 그리고 API 레포지토리 조립을 담당하는 런타임 Composition Root 라이브러리입니다.

---

## 핵심 컨셉

앱은 **"값은 훅으로 읽고, lifecycle은 컴포넌트를 마운트하여 제어한다"**는 원칙 하에 동작합니다.
세션 상태(로그인, 토큰 등)의 실시간 상태 전이는 `@chatic/web-core`가 소유하며, `app-runtime`은 이 상태 변화를 감지하여 데이터 컨텍스트와 물리 소켓 연결을 동기화합니다.

---

## 사용 방법 (How to Use)

어플리케이션의 엔트리 포인트(예: `apps/web/src/app/app.tsx`)에서 다음과 같이 세션 관리 및 런타임을 조립합니다.

### 1. 런타임 호스트 및 바인더 조립 예제

```tsx
import React from 'react';
import { RuntimeConnectionHost, useRuntimeBinding, SocketSessionDelegate } from '@chatic/app-runtime';
import { useGlobalSession, useRefreshCloudToken } from '@chatic/web-core';

// web-core의 인증/토큰 훅과 소켓 컨트롤러를 연결해주는 위임(Delegate) 계약을 정의합니다.
const useSocketDelegate = (): SocketSessionDelegate => {
    const session = useGlobalSession();
    const refreshCloud = useRefreshCloudToken();

    return {
        // 소켓 인증 갱신을 위해 현재 보존 중인 토큰을 획득합니다.
        getSocketToken: async () => {
            const activeServer = session.activeServer;
            return activeServer.identityToken ?? null;
        },
        // 소켓이 401 Unauthorized 에러를 수신했을 때 실행할 클라우드 세션 재인증 동작을 정의합니다.
        refreshSocketToken: async reason => {
            console.log(`[Socket Reauth] Triggered due to ${reason}`);
            const refreshed = await refreshCloud();
            return refreshed.identityToken ?? null;
        },
        onRefreshFailed: error => {
            console.error('[Socket Reauth] Failed recovery sequence', error);
            // 필요 시 강제 로그아웃 또는 로그인 화면 이동 처리를 여기에 수행합니다.
        },
    };
};

export const App = () => {
    // 1. 활성 서버(activeServer)를 관측하여 실시간 데이터/소켓 바인딩을 파생시킵니다.
    const binding = useRuntimeBinding();
    const delegate = useSocketDelegate();

    // 2. RuntimeConnectionHost 하나만 마운트하면 됩니다.
    //    내부에서 TransportBootstrap(초기화 가드) → SessionBackgroundRunner(백그라운드 세션) →
    //    RuntimeDataBinder(context 동기화) → SocketBinder(소켓 config 동기화) →
    //    SocketAuthBinder(token 변경 시 재인증)를 순서대로 마운트합니다.
    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
            {/* 실제 화면 레이아웃만 children으로 전달 */}
            <MainLayout />
        </RuntimeConnectionHost>
    );
};
```

> 개별 바인더(`TransportBootstrap` / `SessionBackgroundRunner` / `RuntimeDataBinder` / `SocketBinder` / `SocketAuthBinder`)는 `RuntimeConnectionHost`가 내부에서 조립하므로 직접 마운트하지 않습니다. 조립 상세는 [docs/architecture.md](docs/architecture.md) §3 참조.

---

## 주요 API 및 Hooks 사용 가이드

하위 컴포넌트(예: `MainLayout` 또는 각 Page 컴포넌트) 내에서 조립된 데이터 레포지토리와 소켓 상태를 읽을 때 아래의 API들을 활용합니다.

### 1. 데이터 리포지토리 획득 (`useRuntimeRepositories`)

현재 활성화된 데이터 컨텍스트(`cid`, `sid`, `uid`)에 바인딩된 Chatic 리포지토리 묶음을 가져옵니다.

```tsx
import { useRuntimeRepositories } from '@chatic/app-runtime';

const ChannelListPage = () => {
    const { channelRepository } = useRuntimeRepositories();

    useEffect(() => {
        // 활성화된 클라우드/사이트의 채널 리스트를 조회합니다.
        channelRepository.getChannels().then(console.log);
    }, [channelRepository]);

    return <div>Channel List</div>;
};
```

### 2. 소켓 연결 상태 관측 (`useSocketState`)

현재 물리 소켓의 연결 여부 및 핸드셰이크 인증 성공 여부를 관측하여 UI에 표시할 수 있습니다.

```tsx
import { useSocketState } from '@chatic/app-runtime';

const ConnectionStatusBadge = () => {
    const { isConnected, isVerified } = useSocketState();

    return (
        <span className={isVerified ? 'bg-green-500' : 'bg-red-500'}>
            {isConnected ? (isVerified ? 'Online' : 'Authenticating') : 'Offline'}
        </span>
    );
};
```

---

## 관련 문서 가이드

자세한 내부 구현 및 도메인 사양은 `docs/` 폴더 내의 마크다운 문서를 참조하십시오.

- **[전체 아키텍처 개요](docs/architecture.md)**: 패키지 내 각 도메인간 관계 및 책임 분리 정리
- **[공개 인터페이스 리스트](docs/public-surface.md)**: 노출되는 훅/컴포넌트 API 명세
- **[소켓 도메인 및 401 복구](docs/socket/socket.md)**: 소켓 연결 라이프사이클 및 single-flight 401 재시도 흐름
- **[Sync 도메인 사양](docs/sync/README.md)**: `SyncManager` + `SyncPlan` 기반 동기화 소유 경계 및 register API
- **[도메인별 동기화 & SyncPlan](docs/sync/domain-sync-and-plans.md)**: plan 패밀리·콜백 매핑·chat prime 상세
- **[런타임 바인딩 사양](docs/runtime/runtime.md)**: 활성 서버 관측 및 Binder의 데이터/소켓 동기화 상세
- **[데이터 런타임 및 캐싱 정책](docs/data/data.md)**: 레포지토리 조립 및 Cache-First 표시 정책
