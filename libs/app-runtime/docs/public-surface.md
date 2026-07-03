# App Runtime Public Surface

Date: 2026-06-24
Status: Target Architecture

## 목적

이 문서는 `@chatic/app-runtime`를 사용하는 앱이 어떤 공개 표면을 기준으로 런타임을 조립해야 하는지 정의한다.

원칙:

- 값은 훅으로 읽는다.
- lifecycle은 컴포넌트 마운트로 제어한다.
- socket/session/sync의 내부 구현 세부사항은 외부에 새지 않는다.

## 공개 표면

| 구분               | 심볼                                                                                           | 설명                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 값 파생 훅         | `useRuntimeBinding()`                                                                          | 활성 서버 기준 `RuntimeBinding` 파생                  |
| 값 파생 훅         | `useRuntimeRepositories()`                                                                     | 현재 data context에 바인딩된 repository 조회          |
| 값 파생 훅         | `useSocketState()`                                                                             | socket 연결/인증 상태 조회                            |
| lifecycle 컴포넌트 | `<RuntimeConnectionHost>`                                                                      | 런타임 조립 루트                                      |
| lifecycle 컴포넌트 | `<TransportBootstrap>`                                                                         | transport 초기화 게이트                               |
| lifecycle 컴포넌트 | `<SessionBackgroundRunner>`                                                                    | 백그라운드 세션 유지/리프레시                         |
| lifecycle 컴포넌트 | `<RuntimeDataBinder>`                                                                          | data context 동기화                                   |
| lifecycle 컴포넌트 | `<SocketBinder>`                                                                               | socket config 동기화                                  |
| delegate 계약      | `SocketSessionDelegate`                                                                        | active-server-aware register/sign/writeback 주입 계약 |
| 편의 진입점        | `getRuntimeManager()`                                                                          | runtime manager 접근                                  |
| 편의 진입점        | `getSocketRuntime()`                                                                           | socket/session/sync 조립체 접근                       |
| 편의 진입점        | `getDataRuntime()`                                                                             | data runtime 접근                                     |
| 핵심 타입          | `RuntimeBinding`, `SocketBindingConfig`, `SocketState`, `DataContext`, `SocketSessionDelegate` | 외부에서 알아야 하는 주요 타입                        |

## socket runtime 공개 규칙

`getSocketRuntime()`가 최종적으로 노출해야 하는 내부 조립체:

```ts
{
  socketManager,
  syncManager,
}
```

> 인증은 SDK `AuthController`(`client.auth`)가 소유하므로 조립체에 `sessionController`를 두지 않는다. bootstrap 시퀀싱은 `SocketBinder`가 `bootstrapSocketConnection(...)`로 수행한다.

주의:

- `ManagedSocketClientProxy`는 제거(request facade는 `SocketManager`로 흡수), `AppSyncRuntime`는 `SyncManager`로 재편(진입점 `getSyncManager()`)되었다. 정렬 상태 전체는 [architecture.md](./architecture.md#현재-코드와의-차이) 참조.

## 앱 조립 예시

```tsx
import { RuntimeConnectionHost, useRuntimeBinding } from '@chatic/app-runtime';

const App = () => {
    const binding = useRuntimeBinding();

    return (
        <RuntimeConnectionHost binding={binding} delegate={delegate}>
            <MainLayout />
        </RuntimeConnectionHost>
    );
};
```

설명:

- `RuntimeConnectionHost` 내부에서 `TransportBootstrap`, `SessionBackgroundRunner`, `RuntimeDataBinder`, `SocketBinder`를 조립한다.
- 인증 문맥(토큰/site) 변경은 별도 binder 없이 SDK `AuthController`가 담당한다(만료·재연결 자동, site 전환은 `client.auth.switch`). 이전 구현의 `<SocketAuthBinder>`는 SDK 도입 시 삭제된다.
- sync는 별도 binder를 두지 않고 `SyncManager` 내부 서비스로 동작한다.

## 외부에서 알 필요 없는 것

- `createClientSocketV2`
- `createDeviceRuntime`
- raw `ClientSocketV2`
- raw sync runtime 인스턴스

위 항목은 모두 내부 구현 세부사항이다.

## 관련 문서

- [architecture.md](./architecture.md)
- [runtime/README.md](./runtime/README.md)
- [socket/README.md](./socket/README.md)
- [sync/README.md](./sync/README.md)
- [data/README.md](./data/README.md)
