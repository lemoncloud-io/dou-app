# remote 아키텍처

> 개요는 [README.md](./README.md). 정본 코드: [gateways/index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/remote/gateways/index.ts), [data-sources/index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/remote/data-sources/index.ts).

## gateway 매핑

`gateways/index.ts`는 각 도메인이 쓰는 capability만 `Pick<>`으로 추려 도메인 gateway 타입을 만든다. 한 도메인이 여러 원본 gateway를 묶기도 한다(`join`, `place`, `user`).

| 도메인 gateway         | 타입 정의                                                                                                                     | 소비하는 RemoteDataSource |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `AuthDomainGateway`    | `Pick<AuthGateway, 'update'>`                                                                                                 | `AuthRemoteDataSource`    |
| `ChannelDomainGateway` | `Pick<ChannelGateway, 'mine' \| 'sync' \| 'update' \| 'delete' \| 'create' \| 'invite' \| 'leave' \| 'getSelf' \| 'unreads'>` | `ChannelRemoteDataSource` |
| `ChatDomainGateway`    | `Pick<ChatGateway, 'send' \| 'feed' \| 'get' \| 'update' \| 'delete'>`                                                        | `ChatRemoteDataSource`    |
| `JoinDomainGateway`    | `JoinGateway & Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'join'>`                                                      | `JoinRemoteDataSource`    |
| `PlaceDomainGateway`   | `Pick<PlaceGateway, 'create' \| 'get' \| 'update' \| 'delete'> & Pick<UserGateway, 'mySite'>`                                 | `PlaceRemoteDataSource`   |
| `UserDomainGateway`    | `Pick<ChannelGateway, 'listUser' \| 'syncUsers'> & Pick<UserGateway, 'update' \| 'invite' \| 'inviteBatch'>`                  | `UserRemoteDataSource`    |
| `DeviceDomainGateway`  | `Pick<DeviceGateway, 'save' \| 'read' \| 'sync'>`                                                                             | `DeviceRemoteDataSource`  |
| `CloudDomainGateway`   | `Pick<CloudGateway, 'update' \| 'get' \| 'delete'>`                                                                           | `CloudRemoteDataSource`   |
| `ProfileDomainGateway` | `Pick<ProfileGateway, 'get' \| 'getMine' \| 'set' \| 'sync'>`                                                                 | `ProfileRemoteDataSource` |
| `SocketDomainGateway`  | `Pick<DomainGateway, 'request'>`                                                                                              | `SocketsRemoteDataSource` |

설계 포인트:

- **Join**은 1급 `JoinGateway`(단건 `join.get` / `join.update`)에 보조 command(`chat.read`, `channel.join`)를 합쳐 묶는다.
- **Place**는 `PlaceGateway` CRUD에 목록 조회용 `UserGateway.mySite`를 더한다. Site 도메인은 Place로 일원화됐고, 물리 캐시 슬롯은 기존 `site`를 재사용한다([local/architecture.md](../local/architecture.md#스코프와-캐시-슬롯) 참조).
- **Cloud**는 `get` / `update` / `delete`만 노출한다. `cloud.create`는 gateway 묶음에 없다.
- **User**에서 profile/site 관련 capability는 빠졌다. site 프로필은 `ProfileDomainGateway`가 전담한다.

## DataSource별 호출

| RemoteDataSource          | 주요 호출                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `AuthRemoteDataSource`    | `update()`                                                                                                         |
| `ChannelRemoteDataSource` | `mine()`, `sync()`, `create()`, `update()`, `delete()`, `invite()`, `leave()`, `getSelf()`, `unreads()`            |
| `ChatRemoteDataSource`    | `send()`, `feed()`, `get()`, `update()`, `delete()`                                                                |
| `JoinRemoteDataSource`    | `getJoin()`(`join.get`), `updateJoin()`(`join.update`), `readChat()`(`chat.read`), `joinChannel()`(`channel.join`) |
| `PlaceRemoteDataSource`   | `create()`, `get()`, `update()`, `delete()`, `mySite()`(목록)                                                      |
| `UserRemoteDataSource`    | `listUser()`, `syncUsers()`, `update()`, `invite()`, `inviteBatch()`                                               |
| `DeviceRemoteDataSource`  | `save()`, `read()`, `sync()`                                                                                       |
| `CloudRemoteDataSource`   | `get()`, `update()`, `delete()`                                                                                    |
| `ProfileRemoteDataSource` | `get()`, `getMine()`, `set()`, `sync()`                                                                            |
| `SocketsRemoteDataSource` | `request('find-connection', payload)`                                                                              |

## 클라이언트 측 요청 제한

`RemoteDataSource` 호출자는 socket 클라이언트의 클라이언트 측 backpressure를 인지해야 한다. 이 값들은 socket 클라이언트(외부 모듈) 소유지만, 호출 결과(특히 reject)를 해석하는 것은 `libs/data` 호출자의 몫이라 소비 관점에서 정리한다.

| 항목                | 기본값 | 비고                                                |
| ------------------- | ------ | --------------------------------------------------- |
| 동시 in-flight 허용 | 32     | 초과분은 pending으로                                |
| pending 허용        | 512    | in-flight 포화 시 대기                              |
| request timeout     | 30s    | 서버 무응답 시 클라이언트가 timeout                 |
| client-side 429     | —      | pending 초과 시 서버와 무관하게 클라이언트가 reject |

클라이언트 측 429는 서버 HTTP 429와 다르다. sync 루프 요청도 같은 in-flight 슬롯을 공유하므로, 호출자는 두 종류의 reject를 구분해 처리해야 한다.
