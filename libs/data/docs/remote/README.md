# remote (`libs/data/src/data/remote`)

remote 레이어는 **outbound 서버 호출**만 담당한다. gateway thin wrapper이며, socket 연결의 생애주기·재연결·sync 타이밍은 알지 못한다.

## 구성

```txt
remote/
  gateways/        gateway 타입 매핑 (RemoteGatewayBundle)
  data-sources/    RemoteDataSource 10종 + 팩토리
  sockets/         ISocketClient 최소 계약
```

- **`gateways/index.ts`** — 각 도메인이 실제로 쓰는 capability만 추려 도메인 gateway 타입을 정의한다(`Pick<>` 조합). 묶음 타입이 `RemoteGatewayBundle`.
- **`data-sources/`** — 도메인별 `RemoteDataSource`. 주입받은 gateway 메서드를 호출하는 얇은 래퍼다. `createRemoteDataSources({ gateways })`가 생성 지점을 한곳에 모은다.
- **`sockets/`** — `ISocketClient`(`request` / `send` / `onType`)는 socket bridge가 의존하는 최소 규약이다. `RemoteDataSource`는 더 이상 이 타입을 직접 쓰지 않고 gateway만 사용한다.

## 핵심 계약

`RemoteDataSource`는 gateway 타입만 주입받는다. socket action string이나 model-event 라우팅을 알지 않는다.

```ts
// 예: ChatRemoteDataSource 는 ChatDomainGateway 만 안다
export const createRemoteDataSources = ({ gateways }: { gateways: RemoteGatewayBundle }): RemoteDataSources => ({
    chat: new ChatRemoteDataSource(gateways.chat),
    // ...
});
```

도메인 목록: `auth`, `channel`, `chat`, `join`, `place`, `user`, `device`, `sockets`, `cloud`, `profile`.

## 더 읽기

- [architecture.md](./architecture.md) — gateway 매핑 표(현행), DataSource별 호출, 클라이언트 측 요청 제한.
