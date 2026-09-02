# Runtime Domain Spec

## 목적

`runtime` 도메인은 세션 상태를 앱이 소비할 **값**으로 파생시키는 훅 층이다. transport 엔진을 직접
만들지 않고, 생성 책임은 하위 manager들에 위임한다.

## 핵심 개념: `RuntimeBinding`

[`useRuntimeBinding()`](../../src/runtime/useRuntimeBinding.ts)이 `useGlobalSession()`(세션 허브) +
`useDynamicDeviceId()`를 관측해 파생한다. 현재 앱이 어떤 데이터 문맥·소켓 슬롯으로 동작해야 하는지를
나타낸다. (프로필 파생값은 `useRuntimeProfile`이 `useGlobalSession`에서 직접 계산한다 — 이 binding을
거치지 않는다.)

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

파생 규칙:

- **context** — `cid`는 **선택된** cloud(`cloud.cloudId`, optimistic)를 따른다. cloud 전환 시 토큰
  교환 전에 cid를 선반영해 cid-scoped observe 스트림이 즉시 재구독된다. `sid`=`activeServer.siteId`,
  `uid`=`identity.userId`.

    > `binding.context`는 **소비되지 않는다.** 데이터 스코프의 실제 원천은
    > [`ActiveScope`](../../src/session/scope/ActiveScope.ts)가 매 read마다 `session/store`에서
    > 파생하는 값이다(ADR-0070 결정 7). 이 필드는 호출부 호환을 위해 남아 있다.

- **socket** — 두 슬롯은 **각자의 서버가 토큰을 가질 때만** 켜진다(relay wss는 로그인 전에도
  존재하는 env 값이라 wss만으로 게이팅하면 토큰 전에 부팅됨). 로그인(null→token)이 슬롯을 켜고
  로그아웃이 끈다.
    - **relay 슬롯**은 `identityToken`을 슬롯에 싣되 **config에 넣지 않는다** — 토큰 refresh(값 변경)가
      config를 흔들어 소켓을 재부팅하지 않도록. `SocketReauthBinder`가 이 값의 변화를 관측한다.
    - **cloud 슬롯**은 의도적으로 `identityToken`을 **싣지 않는다**. 두 클라우드가 wss 호스트를
      공유하지 않으므로(2026-09-02 확인) cloud 전환은 항상 URL을 바꾸고, 그러면 `SocketBinder`가
      슬롯을 다시 세운다 — 재인증할 살아 있는 커넥션 자체가 없다. 전제가 아니라 **불변조건**이고,
      깨질 경우 조용히 옛 신원이 남으므로 `SocketBinder`의 같은-wss 가드가 그것을 에러로 보고한다.
      한편 **같은 클라우드에 머문 채 토큰만 재발급**되는 경우는 어느 바인더도 반응하지 않으므로
      명시적 재등록이 필요하다 — `useCloudCredentialGuard` → `renewCloudSession`이 그 역할을
      한다([session/architecture.md](../session/architecture.md)).
    - cloud 슬롯 config의 cid는 **커밋된** cloud(`getCommittedCloudId()`)다. `cloud.cloudId`는
      전환 시작 시점에 뒤집히는 **선택된** 값이라, 그것을 쓰면 낙관 창 동안 슬롯이 나가는 클라우드의
      `wss`/토큰 옆에 대상 cid를 실은 — 두 클라우드를 동시에 서술하는 — config가 된다.

## binder 역할

`RuntimeConnectionHost`가 아래를 마운트한다([session-lifecycle.md](./session-lifecycle.md)).

### 데이터 스코프 바인더는 없다

한때 `RuntimeDataBinder`가 `binding.context`를 매 변경마다 데이터 컨텍스트로 밀어 넣었고, effect에서
도는 그 push가 바로 cloud 전환 중 하위 훅이 stale cid로 구독하게 만든 원인이었다. `ActiveScope`가 read
시점에 파생하게 되자 커밋할 것이 없어져 no-op으로 남았고, 이제는 파일 자체가 삭제됐다 — 마운트 자리가
없으니 그 push를 되살릴 방법도 없다.

### `SocketBinder`

- `binding.socket.relay?.config`·`binding.socket.cloud?.config`를 **독립 슬롯**으로 관리
  (`useSocketSlot`). 슬롯 config가 켜지면 `bootstrapSocketConnection`, 꺼지면 `manager.destroy(kind)`.
- reboot 키는 `url|deviceId|wssType`로 **cid를 제외**한다. 이유 둘: binding은 세션 변이마다 새 객체라
  안정 문자열로 키잉해야 benign 리렌더가 진행 중인 bootstrap의 SDK 구독을 떼지 않고, cid만 바뀌는
  것은 **낙관적** cloud 전환이라 그때 재부팅하면 나가는 소켓에 붙은 채 boundCid만 대상 클라우드로
  재동결돼 캐시를 오염시킨다. 실제 재부팅 시에는 ref에서 읽은 현재 config(cid 포함)를 넘긴다.
- active server 종류가 바뀌어(`relay`↔`cloud`) wss URL이 달라지면 그 슬롯의 config가 바뀌어 재부팅된다.

### `SocketReauthBinder`

- 물리 소켓 재생성 없이 **신원(토큰)만 바뀌는** 경우(게스트→소셜 승격)를 재인증한다. 각 슬롯의
  `identityToken` 변화를 reboot가 아닐 때만 관측 → `reauthenticateActiveSocket`
  (상세 → [../socket/README.md](../socket/README.md), [../socket/auth/README.md §3](../socket/auth/README.md)).

> 만료 refresh·재연결 재인증은 별도 binder 없이 SDK `ClientSocketAuth`가 자동 처리한다.
> `SocketReauthBinder`는 그 자동 경로가 못 잡는 same-connection **신원 교체**만 담당한다.

## 조립 규칙

`runtime`이 직접 생성하지 않는 것: `createClientSocketV2`, `createDeviceRuntime`.

`runtime`이 조립하는 것: `SocketManager`·`SyncManager`(`createSocketRuntime()`), `DataManager`.

인증은 별도 조립 객체 없이 SDK `ClientSocketAuth`(`client.auth`)가 소유하고, bootstrap 시퀀싱은
`SocketBinder`가 `bootstrapSocketConnection(...)`으로 수행한다.

## 관련 문서

- [../architecture.md](../architecture.md)
- [./session-lifecycle.md](./session-lifecycle.md) — Host 마운트 라이프사이클
- [../session/architecture.md](../session/architecture.md) — 세션 스토어·스코프 세 뷰
- [../socket/README.md](../socket/README.md)
- [../socket/sync/README.md](../socket/sync/README.md)
- [../data/README.md](../data/README.md)
