# Runtime Domain Spec

## 목적

`runtime` 도메인은 `app-runtime`의 composition root다. 상위 세션 레이어(`@chatic/web-core`)가 제공한 `RuntimeBinding`을 받아 `data`, `socket`, `sync` 계층을 연결한다. `runtime` 자체는 transport 엔진을 직접 만들지 않고, 생성 책임은 하위 manager들에 위임한다.

## 핵심 개념: `RuntimeBinding`

`useRuntimeBinding()`이 `useGlobalSession()`(web-core) + `useDynamicDeviceId()`를 관측해 파생한다. 현재 앱이 어떤 데이터 문맥·소켓 슬롯으로 동작해야 하는지를 나타낸다. (프로필 파생값은 `useRuntimeProfile`이 `useGlobalSession`에서 직접 계산한다 — 이 binding을 거치지 않는다.)

```ts
export interface RuntimeSocketSlot {
    config: SocketBindingConfig; // { url, deviceId, wssType, cid }
    // 슬롯 서버의 identity token. config 밖에 둬서 토큰 교체가 소켓을 재부팅하지 않게 한다.
    identityToken?: string;
}

export interface RuntimeBinding {
    context: DataContext; // { cid, sid?, uid? }
    // 듀얼 소켓: relay는 relay 토큰이 생기면 상시, cloud는 cloud 세션 활성 동안만.
    socket: {
        relay?: RuntimeSocketSlot;
        cloud?: RuntimeSocketSlot;
    };
}
```

파생 규칙(`useRuntimeBinding.ts`):

- **context** — `cid`는 **선택된** cloud(`cloud.cloudId`, optimistic)를 따른다. cloud 전환 시 토큰 교환 전에 cid를 선반영해 cid-scoped observe 스트림이 즉시 재구독된다. `sid`=`activeServer.siteId`, `uid`=`identity.userId`.
- **socket** — 두 슬롯은 **각자의 서버가 토큰을 가질 때만** 켜진다(relay wss는 로그인 전에도 존재하는 env 값이라 wss만으로 게이팅하면 토큰 전에 부팅됨). `identityToken`은 슬롯에 실리되 **config에 넣지 않는다** — 토큰 refresh(값 변경)가 config를 흔들어 소켓을 재부팅하지 않도록. 로그인(null→token)이 슬롯을 켜고 로그아웃이 끈다. cloud 슬롯의 cid는 **커밋된** cloud라 optimistic cid 선반영에도 고정된다. `SocketReauthBinder`가 각 슬롯의 `identityToken` 변화를 관측한다.

## binder 역할

`RuntimeConnectionHost`가 아래 순서로 마운트한다(§[session-lifecycle.md](./session-lifecycle.md)):

### `RuntimeDataBinder`

- `binding.context` 변경(JSON 비교) 시 `DataManager.ensure(binding.context)`.

### `SocketBinder`

- `binding.socket.relay?.config`·`binding.socket.cloud?.config`를 **독립 슬롯**으로 관리(`useSocketSlot`). 슬롯 config가 켜지면 `bootstrapSocketConnection`, 꺼지면 `manager.destroy(kind)`.
- reboot 키는 `url|deviceId|wssType`로 **cid를 제외**한다 — cid만 바뀌면 재부팅하지 않는다.
- active server 종류가 바뀌어(`relay`↔`cloud`) wss URL이 달라지면 그 슬롯의 config가 바뀌어 재부팅된다.

### `SocketReauthBinder`

- 물리 소켓 재생성 없이 **신원(토큰)만 바뀌는** 경우(게스트→소셜 승격, 같은 wss cloud site 전환)를 재인증한다. 각 슬롯의 `identityToken` 변화를 reboot가 아닐 때만 관측 → `reauthenticateActiveSocket`(상세 → [../socket/README.md](../socket/README.md), [../auth/README.md §3](../socket/auth/README.md)).

> 만료 refresh·재연결 재인증은 별도 binder 없이 SDK `AuthController`가 자동 처리한다. `SocketReauthBinder`는 그 자동 경로가 못 잡는 same-connection **신원 교체**만 담당한다.

## 조립 규칙

`runtime`이 직접 생성하지 않는 것: `createClientSocketV2`, `createDeviceRuntime`.

`runtime`이 조립하는 것: `SocketManager`, `SyncManager`(`createSocketRuntime()`), `DataManager`.

인증은 별도 조립 객체 없이 SDK `AuthController`(`client.auth`)가 소유하고, bootstrap 시퀀싱은 `SocketBinder`가 `bootstrapSocketConnection(...)`으로 수행한다.

## 관련 문서

- [../architecture.md](../architecture.md)
- [./session-lifecycle.md](./session-lifecycle.md) — Host 마운트 라이프사이클
- [../socket/README.md](../socket/README.md)
- [../sync/README.md](../socket/sync/README.md)
- [../data/README.md](../data/README.md)
