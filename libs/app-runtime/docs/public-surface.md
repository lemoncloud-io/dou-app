# App Runtime Public Surface

Date: 2026-06-19

## 1. 목적

`@chatic/app-runtime`를 소비하는 앱(`apps/*`)이 실제로 만지는 공개 표면을 정의한다. 앱은 **"값은 훅으로 읽고, lifecycle은 컴포넌트를 트리에 꽂는"** 두 종류만 다룬다. 세션 전이 자체(로그인·토큰·refresh)는 `@chatic/web-core`가 소유하며, app-runtime은 그것을 마운트·반영할 표면만 제공한다.

## 2. 현재 export

```ts
// libs/app-runtime/src/index.ts
export * from './socket'; // types, useSocketState
export { getSocketManager }; // socket/runtime
export { getRuntimeManager, useRuntimeBinding, useRuntimeRepositories };
```

앱 현황: app.tsx가 `getRuntimeManager`, `useRuntimeBinding`, `WebSocketV2Connection`(desktop은 `useAutoSelectCloud` 추가)을 사용. `WebSocketV2Connection`/`SocketAuthCoordinator`는 **교체 대상**이다 ([architecture.md](./architecture.md), [socket/socket.md](./socket/socket.md) §2).

## 3. 목표 표면

| 역할                                             | 심볼                                                                                 | 비고                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **값 파생 훅**                                   | `useRuntimeBinding()`                                                                | `RuntimeBinding`(cid/sid/uid + socket config). **활성 서버 관측** 기반 ([runtime/runtime.md](./runtime/runtime.md) §11) |
|                                                  | `useRuntimeRepositories()`                                                           | `DataRepositories` 조회                                                                                                 |
|                                                  | `useSocketState()`                                                                   | `isConnected`/`isVerified`/`isDeviceRegistered` 관측 ([socket/socket.md](./socket/socket.md) §2-1)                      |
| **lifecycle 컴포넌트** (render-null, JSX 마운트) | `<RuntimeDataBinder binding>`                                                        | data context 반응 ([runtime/runtime.md](./runtime/runtime.md) §14)                                                      |
|                                                  | `<SocketBinder binding>`                                                             | socket scope 반응 (§14)                                                                                                 |
|                                                  | `<SessionBackgroundRunner>`                                                          | ①②⑪ 백그라운드 시나리오 ([runtime/session-runner.md](./runtime/session-runner.md))                                      |
|                                                  | `<TransportBootstrap>`                                                               | webTransport ready 게이트 (session-runner.md §4)                                                                        |
| **delegate 주입**                                | `SocketSessionDelegate`                                                              | 앱이 web-core 토큰/refresh hook으로 구현해 주입 ([socket/socket.md](./socket/socket.md) §8)                             |
| **편의 진입** (축소 대상)                        | `getRuntimeManager()` / `getSocketManager()`                                         | 컴포넌트 도입 후 비중 축소 ([runtime/runtime.md](./runtime/runtime.md) §8)                                              |
| **타입**                                         | `RuntimeBinding`, `SocketBindingConfig`, `SocketScope`, `SocketState`, `DataContext` |                                                                                                                         |

훅/컴포넌트 역할 분리의 근거는 [runtime/runtime.md](./runtime/runtime.md) §13(훅 vs 컴포넌트)을 따른다.

## 4. 제거 대상

- `WebSocketV2Connection` — binder/runner 컴포넌트 + delegate로 대체
- `SocketAuthCoordinator` — `SocketSessionController`(socket 도메인 내부) + delegate 주입으로 대체

## 5. 앱 조립 예 (목표)

```tsx
const binding = useRuntimeBinding(); // 활성 서버 관측 → cid/sid/uid

<TransportBootstrap>
    <SessionBackgroundRunner /> {/* ① keepAlive · ② tokenRefresh · ⑪ deviceId */}
    <RuntimeDataBinder binding={binding} /> {/* data context 반응 */}
    <SocketBinder binding={binding} /> {/* socket 재연결 반응 */}
    {/* …앱 UI… */}
</TransportBootstrap>;
```

- 토큰/refresh 등 세션 전이는 web-core 소유이며, `SessionBackgroundRunner`가 그 훅들을 감싸 마운트한다.
- binder는 `useRuntimeBinding`이 활성 서버에서 파생한 cid/sid/uid diff에만 반응한다.

> **상태:** 목표 표면이다. 현 코드에는 `WebSocketV2Connection`/`SocketAuthCoordinator`가 남아 있고 binder/runner 컴포넌트는 미구현이다.

## 관련 문서

- [architecture.md](./architecture.md) — 전체 아키텍처와 모듈 구조
- [runtime/runtime.md](./runtime/runtime.md) — §11 활성 서버 관측, §13 훅 vs 컴포넌트, §14 binder
- [runtime/session-runner.md](./runtime/session-runner.md) — 백그라운드 시나리오 러너, webTransport
- [socket/socket.md](./socket/socket.md) — 소켓 5책임, delegate 계약
