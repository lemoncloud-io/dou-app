# remote (`libs/data/src/data/remote`)

remote 레이어는 **outbound 서버 호출**만 담당한다. gateway thin wrapper이며, socket 연결의 생애주기·재연결·sync 타이밍은 알지 못한다.

## 구성

```txt
remote/                    축 = local의 반대(서버). 그 아래는 전송 수단으로 나뉜다.
  gateways/
    socket.ts              SocketGatewayBundle + 도메인별 Pick<>
    http.ts                HttpGatewayBundle + 도메인별 Pick<>
    index.ts               배럴
  socket-data-sources/     SocketDataSource 11종 + 팩토리
  http-data-sources/       HttpDataSource 5종 + 팩토리
```

- **`gateways/`** — 각 도메인이 실제로 쓰는 capability만 추려 도메인 gateway 타입을 정의한다(`Pick<>` 조합). 전송별로 파일이 갈린다: `socket.ts`(`SocketGatewayBundle`) · `http.ts`(`HttpGatewayBundle`), `index.ts`는 배럴.
- **`socket-data-sources/`** — 도메인별 `SocketDataSource`. 주입받은 gateway 메서드를 호출하는 얇은 래퍼다. `createSocketDataSources({ gateways })`가 생성 지점을 한곳에 모은다.
- **`http-data-sources/`** — 도메인별 `HttpDataSource`. 같은 층의 HTTP 축이며 `createHttpDataSources({ gateways })`가 대칭 팩토리다. 도메인이 아닌 하나가 섞여 있다: `ReportHttpDataSource`(사용자 이슈 제보·로그 배치)는 매핑할 도메인도 캐시 슬롯도 없고, 리포트 전송이 스스로 서명 요청을 만들지 않게 하려고 이 층을 지난다. 자세한 것은 [../http-data-path.md](../http-data-path.md).

## 핵심 계약

`SocketDataSource`는 gateway 타입만 주입받는다. socket action string이나 model-event 라우팅을 알지 않는다.

```ts
// 예: ChatSocketDataSource 는 ChatSocketDomainGateway 만 안다
export const createSocketDataSources = ({ gateways }: { gateways: SocketGatewayBundle }): SocketDataSources => ({
    chat: new ChatSocketDataSource(gateways.chat),
    // ...
});
```

도메인 목록(소켓): `auth`, `channel`, `chat`, `join`, `place`, `user`, `device`, `invite`, `connection`, `cloud`, `profile`.

번들 키는 **앱 쪽 도메인 이름**이지 와이어 모듈 이름이 아니다 — `join`이 `chat.read`·`channel.join`을
합치고 `place`가 `user.mySite`를 끌어오듯, `connection`도 와이어 모듈 `sockets`(액션
`sockets/find-connection`)에 붙는다. 와이어 이름은 `socketFactory`의 `createDomainGateway('sockets', …)`
한 줄에만 남는다.

## 이름 규약 (2026-09-01 리네임)

`remote`는 **축**(local의 반대)이고, 그 아래 이름은 **전송 수단**을 말한다. 예전에는 소켓 축이
`Remote`를 선점하고 HTTP만 `Http`를 써서, `remote/http-data-sources/`의 클래스가 "remote가
아닌 것"처럼 읽혔다. 소켓 축을 `Socket`으로 옮겨 둘을 대칭으로 맞췄다.

| 예전                                              | 지금                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `remote/data-sources/`                            | `remote/socket-data-sources/`                               |
| `XxxRemoteDataSource` · `IXxxRemoteDataSource`    | `XxxSocketDataSource` · `IXxxSocketDataSource`              |
| `RemoteDataSources` · `createRemoteDataSources`   | `SocketDataSources` · `createSocketDataSources`             |
| `RemoteGatewayBundle`                             | `SocketGatewayBundle`                                       |
| `XxxDomainGateway` (소켓)                         | `XxxSocketDomainGateway`                                    |
| `MockRemoteGateways` · `createMockRemoteGateways` | `MockSocketGateways` · `createMockSocketGateways`           |
| app-runtime `factories/remoteFactory.ts`          | `factories/socketFactory.ts`                                |
| app-runtime `createHttpDataSourceBundle`          | `createHttpDataSources`                                     |
| `SocketsRemoteDataSource` · 번들 키 `sockets`     | `ConnectionSocketDataSource` · 번들 키 `connection`         |
| `SocketDomainGateway`                             | `ConnectionSocketDomainGateway`                             |
| `gateways/index.ts`(소켓 타입 본문 + http 재수출) | `gateways/socket.ts` ‖ `gateways/http.ts` + 배럴 `index.ts` |

HTTP 축은 한 글자도 바뀌지 않았다. 2026-09-01 이전 ADR은 옛 이름으로 쓰여 있고 그대로 둔다 —
당시 기록이므로, 옛 이름을 만나면 이 표로 옮겨 읽으면 된다.

## 더 읽기

- [architecture.md](./architecture.md) — gateway 매핑 표(현행), DataSource별 호출, 클라이언트 측 요청 제한.
