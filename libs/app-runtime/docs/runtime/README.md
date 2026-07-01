# Runtime Domain Spec

Date: 2026-06-24
Status: Target Architecture

## 목적

`runtime` 도메인은 `app-runtime`의 composition root다. 상위 세션 레이어가 제공한 `RuntimeBinding`을 받아 `data`, `socket`, `sync` 계층을 연결한다.

`runtime` 자체는 transport 엔진을 직접 만들지 않는다. 생성 책임은 하위 manager들에 위임한다.

## 핵심 개념: `RuntimeBinding`

`RuntimeBinding`은 현재 앱이 어떤 데이터 문맥과 어떤 소켓 문맥으로 동작해야 하는지를 나타낸다.

```ts
export interface RuntimeBinding {
    context: {
        cid: string;
        sid?: string;
        uid?: string;
    };
    socket: {
        config: {
            url: string;
            deviceId: string;
            wssType?: 'relay' | 'cloud';
        };
    } | null;
}
```

## binder 역할

### `RuntimeDataBinder`

- `binding.context`를 `DataManager.ensure()`에 반영한다.

### `SocketBinder`

- `binding.socket.config`를 `SocketManager.ensure()`에 반영한다.
- active server 종류가 바뀌어(`relay`↔`cloud`) wss URL이 달라지면 새 소켓 생성/재부팅(register)으로 처리한다.

> 별도 `SocketAuthBinder`는 두지 않는다. 물리 소켓 재생성 없이 auth 문맥만 바뀌는 경우(만료 refresh·재연결 재인증·같은 소켓 내 site 전환)는 SDK `AuthController`가 담당한다 — 만료·재연결은 자동, site 전환은 `client.auth.switch(`${uid}@${siteId}`)`([../auth/usage.md](../auth/usage.md) §1.4). 이전 구현의 `SocketAuthBinder`(identity token 변경 관측 → `updateAuth('session-switch')`)는 SDK 도입 시 삭제된다.

## 조립 규칙

`runtime`이 직접 생성하지 않는 것:

- `createClientSocketV2`
- `createDeviceRuntime`

`runtime`이 조립하는 것:

- `SocketManager`
- `SyncManager`
- `DataManager`

인증은 별도 조립 객체 없이 SDK `AuthController`(`client.auth`)가 소유하고, bootstrap 시퀀싱은 `SocketBinder`가 `bootstrapSocketConnection(...)` 함수로 수행한다.

## 관련 문서

- [../architecture.md](../architecture.md)
- [./session-lifecycle.md](./session-lifecycle.md) — Runner / Bootstrap 라이프사이클
- [../socket/README.md](../socket/README.md)
- [../sync/README.md](../sync/README.md)
- [../data/README.md](../data/README.md)
