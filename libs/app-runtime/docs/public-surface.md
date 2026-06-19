# App Runtime Public Surface

Date: 2026-06-19

## 1. 목적

`@chatic/app-runtime`를 사용하는 앱(`apps/*`)이 참조하고 실행하는 공개 인터페이스(Public Surface)를 정의한다.
앱은 **"값은 훅으로 읽고, lifecycle은 컴포넌트를 트리에 마운트하여 제어하는"** 원칙을 따른다. 세션 자체의 로그인 및 토큰 제어는 `@chatic/web-core`가 소유하며, `app-runtime`은 이를 주입받아 바인딩 및 런타임을 구동하는 통로 역할을 수행한다.

---

## 2. 공개 표면 (API Surface)

외부로 노출되는 실제 심볼 목록은 다음과 같다.

| 구분                   | 심볼                                                                                           | 설명 / 역할                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **값 파생 훅**         | `useRuntimeBinding()`                                                                          | 활성 서버(`activeServer`) 관측에 기반하여 파생된 `RuntimeBinding` (cid/sid/uid 및 소켓 구성 정보) 반환     |
|                        | `useRuntimeRepositories()`                                                                     | 활성화된 런타임 데이터 컨텍스트에 바인딩된 `DataRepositories` 조회                                         |
|                        | `useSocketState()`                                                                             | 소켓의 연결 및 검증 상태(`isConnected`, `isVerified`, `isDeviceRegistered`, `connectionId`) 실시간 관측    |
| **Lifecycle 컴포넌트** | `<RuntimeConnectionHost>`                                                                      | 런타임 호스트 컨텍스트 및 `RuntimeBinding` 변화에 따른 최상위 주입 컴포넌트                                |
|                        | `<TransportBootstrap>`                                                                         | `webTransport` 초기화 상태(`isReady`)를 검증하는 라이프사이클 게이트 컴포넌트                              |
|                        | `<SessionBackgroundRunner>`                                                                    | 백그라운드 세션 훅들(KeepAlive, TokenRefresh, DeviceId)을 마운트하여 주기적 백그라운드 오케스트레이션 실행 |
|                        | `<RuntimeDataBinder>`                                                                          | `RuntimeBinding` 값에 맞춰 데이터 저장소 컨텍스트(DataContext) 동기화                                      |
|                        | `<SocketBinder>`                                                                               | `RuntimeBinding` 값에 맞춰 소켓 연결 갱신 및 소켓 동기화                                                   |
| **Delegate 계약**      | `SocketSessionDelegate`                                                                        | 소켓 리팩터링 결과에 따라 토큰 및 401 재인증 로직을 외부(`web-core` 등)에서 주입받기 위한 인터페이스       |
| **편의 진입점**        | `getRuntimeManager()`                                                                          | 싱글톤 `RuntimeManager` 인스턴스 획득                                                                      |
|                        | `getSocketRuntime()`                                                                           | 싱글톤 `SocketSessionController` 및 `ManagedSocketClientProxy` 인스턴스 획득                               |
|                        | `getDataRuntime()`                                                                             | 싱글톤 `DataManager` 인스턴스 획득                                                                         |
| **핵심 타입**          | `RuntimeBinding`, `SocketBindingConfig`, `SocketState`, `DataContext`, `SocketSessionDelegate` | 주요 통신 및 런타임 데이터 스키마 타입                                                                     |

---

## 3. 앱 조립 예시

앱의 메인 진입점(예: `app.tsx`)에서 다음과 같이 컴포넌트 및 바인더 트리로 라이프사이클을 조립하여 사용한다.

```tsx
import {
    RuntimeConnectionHost,
    TransportBootstrap,
    SessionBackgroundRunner,
    RuntimeDataBinder,
    SocketBinder,
    useRuntimeBinding,
} from '@chatic/app-runtime';

const App = () => {
    const binding = useRuntimeBinding(); // 활성 서버(activeServer) 관측에 기반한 실시간 바인딩 파생

    return (
        <RuntimeConnectionHost>
            <TransportBootstrap>
                {/* ① 백그라운드 유지 및 갱신 시나리오 구동 (keepAlive, tokenRefresh, deviceId) */}
                <SessionBackgroundRunner />

                {/* ② 데이터 런타임에 context 동기화 */}
                <RuntimeDataBinder binding={binding} />

                {/* ③ 소켓 런타임에 scope 및 config 동기화 */}
                <SocketBinder binding={binding} />

                {/* 앱 메인 UI 영역 */}
                <MainLayout />
            </TransportBootstrap>
        </RuntimeConnectionHost>
    );
};
```

---

## 관련 문서

- [architecture.md](./architecture.md) — 전체 아키텍처와 모듈 구조 개요
- [runtime/runtime.md](./runtime/runtime.md) — 활성 서버 관측 및 Binder/Host 컴포넌트 동작 방식
- [runtime/session-runner.md](./runtime/session-runner.md) — 백그라운드 러너 및 `TransportBootstrap`
- [socket/socket.md](./socket/socket.md) — 소켓 5대 책임 모델 및 `SocketSessionDelegate` 위임 계약
