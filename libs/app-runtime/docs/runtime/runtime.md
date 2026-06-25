# Runtime Domain Spec

Date: 2026-06-25
Status: As-Built (현재 구현 기준)

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

### `SocketAuthBinder`

- 물리 소켓 재생성이 없어도 auth 문맥이 바뀌는 경우를 담당한다.
- site/token 변경 시 `SocketSessionController.updateAuth(...)`를 호출한다.

## 조립 규칙

`runtime`이 직접 생성하지 않는 것:

- `createClientSocketV2`
- `createDeviceRuntime`

`runtime`이 조립하는 것:

- `SocketManager`
- `SocketSessionController`
- `SyncManager`
- `DataManager`

## 관련 문서

- [../architecture.md](../architecture.md)
- [../socket/socket.md](../socket/socket.md)
- [../sync/README.md](../sync/README.md)
- [../data/data.md](../data/data.md)
