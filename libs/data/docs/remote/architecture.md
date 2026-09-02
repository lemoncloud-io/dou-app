# remote 아키텍처

> 개요는 [README.md](./README.md). 정본 코드: [gateways/socket.ts](../../src/data/remote/gateways/socket.ts), [socket-data-sources/index.ts](../../src/data/remote/socket-data-sources/index.ts).

## gateway 매핑

`gateways/socket.ts`는 각 소켓 도메인이 쓰는 capability만 `Pick<>`으로 추려 도메인 gateway 타입을 만든다. 한 도메인이 여러 원본 gateway를 묶기도 한다(`join`, `place`, `user`).

| 도메인 gateway                  | 타입 정의                                                                                                                     | 소비하는 SocketDataSource    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `AuthSocketDomainGateway`       | `Pick<AuthGateway, 'linkAccount'>`                                                                                            | `AuthSocketDataSource`       |
| `ChannelSocketDomainGateway`    | `Pick<ChannelGateway, 'mine' \| 'sync' \| 'update' \| 'delete' \| 'create' \| 'invite' \| 'leave' \| 'getSelf' \| 'unreads'>` | `ChannelSocketDataSource`    |
| `ChatSocketDomainGateway`       | `Pick<ChatGateway, 'send' \| 'feed' \| 'get' \| 'update' \| 'delete' \| 'reaction'>`                                          | `ChatSocketDataSource`       |
| `JoinSocketDomainGateway`       | `JoinGateway & Pick<ChatGateway, 'read'> & Pick<ChannelGateway, 'join'>`                                                      | `JoinSocketDataSource`       |
| `PlaceSocketDomainGateway`      | `Pick<PlaceGateway, 'create' \| 'get' \| 'update' \| 'delete'> & Pick<UserGateway, 'mySite'>`                                 | `PlaceSocketDataSource`      |
| `UserSocketDomainGateway`       | `Pick<ChannelGateway, 'listUser' \| 'syncUsers'> & Pick<UserGateway, 'update' \| 'profile' \| 'invite' \| 'inviteBatch'>`     | `UserSocketDataSource`       |
| `InviteSocketDomainGateway`     | `Pick<InviteGateway, 'create' \| 'get' \| 'list' \| 'accept' \| 'cancel' \| 'reject'>`                                        | `InviteSocketDataSource`     |
| `DeviceSocketDomainGateway`     | `Pick<DeviceGateway, 'save' \| 'read' \| 'sync' \| 'updateRemote'>` — 번들에는 `RoutedGateway<>`로 들어간다                   | `DeviceSocketDataSource`     |
| `CloudSocketDomainGateway`      | `Pick<CloudGateway, 'update' \| 'get' \| 'delete'>`                                                                           | `CloudSocketDataSource`      |
| `ProfileSocketDomainGateway`    | `Pick<ProfileGateway, 'get' \| 'getMine' \| 'set' \| 'sync'>`                                                                 | `ProfileSocketDataSource`    |
| `ConnectionSocketDomainGateway` | `Pick<DomainGateway, 'request'>`                                                                                              | `ConnectionSocketDataSource` |

설계 포인트:

- **Join**은 1급 `JoinGateway`(단건 `join.get` / `join.update`)에 보조 command(`chat.read`, `channel.join`)를 합쳐 묶는다.
- **Place**는 `PlaceGateway` CRUD에 목록 조회용 `UserGateway.mySite`를 더한다. Site 도메인은 Place로 일원화됐고, 물리 캐시 슬롯은 기존 `site`를 재사용한다([local/architecture.md](../local/architecture.md#스코프와-캐시-슬롯) 참조).
- **Cloud**는 `get` / `update` / `delete`만 노출한다. `cloud.create`는 gateway 묶음에 없다.
- **User**는 계정 프로필(`user.profile`)까지 포함한다. 사이트(플레이스) 프로필은 별개 도메인이고 `ProfileSocketDomainGateway`가 전담한다.
- **Auth**의 `linkAccount`는 phone/email/social × link/login × send/resend/verify/confirm을 하나로 받는 계정 증명 패킷이다. 이것이 대체한 `verifyHashAlias`·`attachSocial`은 와이어에 `@deprecated`로 남아 있지만 이 `Pick`에 **일부러 없다** — 호출부가 옛 패킷에 닿는 것을 막는 유일한 장치다(ADR-0042).
- **Device**만 라우팅된다. 번들 항목이 `RoutedGateway<DeviceSocketDomainGateway>`라서 `save`/`read`/`sync`는 `active` 슬롯으로, relay 소유 푸시 설정인 `updateRemote`는 relay로 간다(ADR-0027, [kind-scoped-routing.md](../../../app-runtime/docs/socket/kind-scoped-routing.md)).
- **Invite**(1:1 DM 초대 코드)는 컴포지션 루트가 relay 슬롯에 **고정**한다 — 활성 클라우드를 따라가면 안 되기 때문이다. `UserSocketDomainGateway.invite`(클라우드 대량 초대, ADR-0016)와 다른 도메인이다(ADR-0033).
- **Connection**의 번들 키는 `connection`이지만 와이어 모듈은 `sockets`다(액션 `sockets/find-connection`). 와이어 이름은 `socketFactory`의 `createDomainGateway('sockets', …)` 한 줄에만 있다.

## DataSource별 호출

| SocketDataSource             | 공개 메서드 → gateway 호출                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthSocketDataSource`       | `sendPhoneCode()` · `verifyPhoneCode()` · `confirmPhoneCode()` · `verifySocialAccount()` · `confirmSocialAccount()`(모두 `auth.linkAccount`, `type`·`mode`·`step` 조립을 이 층이 독점)               |
| `ChannelSocketDataSource`    | `fetchChannel()`, `syncChannel()`, `createChannel()`, `updateChannel()`, `deleteChannel()`, `inviteChannel()`, `leaveChannel()`, `getSelfChannel()`, `getUnreads()`                                  |
| `ChatSocketDataSource`       | `sendChat()`, `fetchChat()`, `getChat()`, `updateChat()`, `deleteChat()`, `setReaction()`(`chat.reaction`)                                                                                           |
| `JoinSocketDataSource`       | `getJoin()`(`join.get`), `updateJoin()`(`join.update`), `readChat()`(`chat.read`), `joinChannel()`(`channel.join`)                                                                                   |
| `PlaceSocketDataSource`      | `fetchPlace()`(`user.mySite`, 목록), `createPlace()`, `getPlace()`, `updatePlace()`, `deletePlace()`                                                                                                 |
| `UserSocketDataSource`       | `fetchUsers()`(`channel.listUser`), `syncChannelUsers()`(`channel.syncUsers`), `getMyProfile()`(`user.profile`), `updateProfile()`(`user.update`), `requestInvite()`(`user.invite`), `inviteBatch()` |
| `InviteSocketDataSource`     | `listInvites()`, `createInvite()`, `getInvite()`, `acceptInvite()`, `cancelInvite()`, `rejectInvite()`                                                                                               |
| `DeviceSocketDataSource`     | `saveDevice()` · `readDevice()` · `syncDevice()`(`active` 슬롯), `updateRemoteDevice()`(`relay` 고정)                                                                                                |
| `CloudSocketDataSource`      | `getCloud()`, `updateCloud()`, `deleteCloud()`                                                                                                                                                       |
| `ProfileSocketDataSource`    | `get()`, `getMine()`, `set()`, `sync()`                                                                                                                                                              |
| `ConnectionSocketDataSource` | `findConnection()` → `request('find-connection', payload)`                                                                                                                                           |

## 클라이언트 측 요청 제한

`SocketDataSource` 호출자는 socket 클라이언트의 클라이언트 측 backpressure를 인지해야 한다. 이 값들은 socket 클라이언트(외부 모듈) 소유지만, 호출 결과(특히 reject)를 해석하는 것은 `libs/data` 호출자의 몫이라 소비 관점에서 정리한다.

| 항목                | 기본값 | 비고                                                |
| ------------------- | ------ | --------------------------------------------------- |
| 동시 in-flight 허용 | 32     | 초과분은 pending으로                                |
| pending 허용        | 512    | in-flight 포화 시 대기                              |
| request timeout     | 30s    | 서버 무응답 시 클라이언트가 timeout                 |
| client-side 429     | —      | pending 초과 시 서버와 무관하게 클라이언트가 reject |

클라이언트 측 429는 서버 HTTP 429와 다르다. sync 루프 요청도 같은 in-flight 슬롯을 공유하므로, 호출자는 두 종류의 reject를 구분해 처리해야 한다.
