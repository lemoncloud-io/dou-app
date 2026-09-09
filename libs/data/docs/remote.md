# remote — outbound 서버 호출

> 상태: Live · 최종 갱신: 2026-09-09 · 개요는 [architecture.md](./architecture.md) · 정본 코드: [gateways/socket.ts](../src/remote/gateways/socket.ts) · [gateways/http.ts](../src/remote/gateways/http.ts)

remote 레이어는 **outbound 서버 호출**만 담당한다. gateway thin wrapper이며, socket 연결의
생애주기·재연결·sync 타이밍은 알지 못한다.

## 구성

`remote`는 **축**(local의 반대편)이고, 그 아래 이름은 **전송 수단**을 말한다.

```text
remote/
  gateways/
    socket.ts              SocketGatewayBundle + 도메인별 Pick<>
    http.ts                HttpGatewayBundle + 도메인별 Pick<>
    index.ts               배럴
  socket-data-sources/     SocketDataSource 11종 + 팩토리
  http-data-sources/       HttpDataSource 5종 + 팩토리
```

- **`gateways/`** — 각 도메인이 실제로 쓰는 capability만 추려 도메인 gateway 타입을 정의한다(`Pick<>` 조합). `@chatic/http`·소켓 lib에서 **타입만** 가져온다.
- **`socket-data-sources/`** — 도메인별 `SocketDataSource`. 주입받은 gateway 메서드를 호출하는 얇은 래퍼다. `createSocketDataSources({ gateways })`가 생성 지점을 한곳에 모은다.
- **`http-data-sources/`** — 도메인별 `HttpDataSource`. 같은 층의 HTTP 축이며 `createHttpDataSources({ gateways })`가 대칭 팩토리다.

## 핵심 계약

`SocketDataSource`는 gateway 타입만 주입받는다. socket action string이나 model-event 라우팅을 알지 않는다.

```ts
// 예: ChatSocketDataSource 는 ChatSocketDomainGateway 만 안다
export const createSocketDataSources = ({ gateways }: { gateways: SocketGatewayBundle }): SocketDataSources => ({
    chat: new ChatSocketDataSource(gateways.chat),
    // ...
});
```

번들 키는 **앱 쪽 도메인 이름**이지 와이어 모듈 이름이 아니다 — `join`이 `chat.read`·`channel.join`을
합치고 `place`가 `user.mySite`를 끌어오듯, `connection`도 와이어 모듈 `sockets`(액션
`sockets/find-connection`)에 붙는다. 와이어 이름은 `socketFactory`의 `createDomainGateway('sockets', …)`
한 줄에만 남는다.

## 소켓 gateway 매핑

`gateways/socket.ts`는 각 소켓 도메인이 쓰는 capability만 `Pick<>`으로 추려 도메인 gateway 타입을
만든다. 한 도메인이 여러 원본 gateway를 묶기도 한다(`join`, `place`, `user`).

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
- **Place**는 `PlaceGateway` CRUD에 목록 조회용 `UserGateway.mySite`를 더한다. Site 도메인은 Place로 일원화됐고, 물리 캐시 슬롯은 기존 `site`를 재사용한다([local.md](./local.md#스코프와-캐시-슬롯) 참조).
- **Cloud**는 `get` / `update` / `delete`만 노출한다. `cloud.create`는 gateway 묶음에 없다.
- **User**는 계정 프로필(`user.profile`)까지 포함한다. 사이트(플레이스) 프로필은 별개 도메인이고 `ProfileSocketDomainGateway`가 전담한다.
- **Auth**의 `linkAccount`는 phone/email/social × link/login × send/resend/verify/confirm을 하나로 받는 계정 증명 패킷이다. 이것이 대체한 `verifyHashAlias`·`attachSocial`은 와이어에 `@deprecated`로 남아 있지만 이 `Pick`에 **일부러 없다** — 호출부가 옛 패킷에 닿는 것을 막는 유일한 장치다(ADR-0042).
- **Device**만 라우팅된다. 번들 항목이 `RoutedGateway<DeviceSocketDomainGateway>`라서 `save`/`read`/`sync`는 `active` 슬롯으로, relay 소유 푸시 설정인 `updateRemote`는 relay로 간다(ADR-0027, [kind-scoped-routing.md](../../app-runtime/docs/socket/kind-scoped-routing.md)).
- **Invite**(1:1 DM 초대 코드)는 컴포지션 루트가 relay 슬롯에 **고정**한다 — 활성 클라우드를 따라가면 안 되기 때문이다. `UserSocketDomainGateway.invite`(클라우드 대량 초대, ADR-0016)와 다른 도메인이다(ADR-0033).
- **Connection**의 번들 키는 `connection`이지만 와이어 모듈은 `sockets`다(액션 `sockets/find-connection`).

## SocketDataSource별 호출

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

## HTTP 축

소켓 축과 같은 파일 계층·같은 패턴이다. `@chatic/http`에서 **타입만** 가져온다.

### gateway Pick

`gateways/http.ts`의 `HttpGatewayBundle`은 도메인 5종이다.

| 도메인 gateway                  | Pick 대상                                                                                                                                                                                                                         | 소비하는 HttpDataSource      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `AuthHttpDomainGateway`         | `OAuthHttpGateway` — 12종: `registerUser` · `registerUserV2` · `findAlias` · `verifyAlias` · `loginInvite` · `inviteInfo` · `registerDevice` · `login` · `verifyNativeToken` · `exchangeCode` · `delegateCloud` · `exchangeToken` | `AuthHttpDataSource`         |
| `UserHttpDomainGateway`         | `UserHttpGateway` — `list` · `tryProfile` · `updateProfile` · `registerDevice`                                                                                                                                                    | `UserHttpDataSource`         |
| `CloudHttpDomainGateway`        | `CloudHttpGateway` — `list` · `update` · `make` · `release` · `verifyEmail`                                                                                                                                                       | `CloudHttpDataSource`        |
| `SubscriptionHttpDomainGateway` | `SubscriptionHttpGateway` — `plans` · `validateGoogle` · `validateApple` · `receipts` · `receiptDetail` · `membership` · `validateMembership`                                                                                     | `SubscriptionHttpDataSource` |
| `ReportHttpDomainGateway`       | `ReportHttpGateway` — `reportIssue` · `uploadLogBatch` (전량)                                                                                                                                                                     | `ReportHttpDataSource`       |

`Pick<>`의 목적은 소비자가 계약을 소유하는 것이다. 소켓 번들은 그 부재를 봉쇄 장치로도 쓴다 —
`@deprecated` 패킷을 빼서 호출부가 옛 어휘에 닿지 못하게 한다. HTTP auth 번들은 그렇지 않다:
세션 재료를 낳는 액션(`login` · `exchangeCode` · `delegateCloud` · `exchangeToken` ·
`verifyNativeToken`)까지 전부 들어 있다.

빠진 것은 `refreshCloudToken` · `refreshAuthToken` 둘이고, **넣을 수가 없다** — 와이어 어휘 자체에
더 이상 존재하지 않는다(ADR-0070 결정 2). 그 부재는 주석이 아니라 테스트가 지킨다:
`@chatic/http`의 `gateways/refreshAbsence.spec.ts`.

`ReportHttpDomainGateway`도 전량을 취한다. 이 게이트웨이에는 withhold할 것이 없고, `Pick<>`은
계약을 소비자가 소유하게 두기 위해서만 남아 있다.

### HttpDataSource와 캐시 의미

`HttpDataSource`는 소켓 data-source와 같은 형태다 — `implements I*` + gateway 생성자 주입 +
view→domain 단일 경계. 다른 점이 하나 있다.

**HTTP 계열은 local cache에 쓰지 않는다.** 소켓 쪽 `getCloud`가 하는 `persistCloud` 같은 미러링을
하지 않는다. 카탈로그의 캐시 주인은 소비자 쪽 react-query 어댑터다.

`context: DataContext`를 받는 이유는 소켓 data-source와 같다 — 늦게 도착한 응답이 전환된 스코프를
오염시키지 않도록 요청 시점 문맥을 고정한다. HTTP 카탈로그는 캐시를 안 쓰므로 지금은 매핑
부가정보용이지만, 시그니처 대칭을 지켜 두면 캐시 의미가 생겨도 인터페이스가 바뀌지 않는다.

`UserHttpDataSource`는 인터페이스 분리를 하나 더 갖는다. 디바이스 등록의 소비자는 device
repository이므로 `IDeviceRegistrationHttpSource`(`registerPushDevice` 하나)를 별도 선언하고,
`IUserHttpDataSource`가 그것을 `extends`한다. repository 생성자는 항상 자기가 쓸 인터페이스만
받는다 — device repository는 좁은 쪽을, user repository는 넓은 쪽을 받는다.

### 두 `UserView`는 서로 대입되지 않는다

HTTP 축의 사용자 매핑에는 함정이 하나 있다. `toDomainUser`(`domain/mappers.ts`)는 소켓 축의
`UserView`(`@lemoncloud/chatic-socials-api`)로 타입이 고정돼 있고, HTTP/OAuth 축의 동명 타입
(`@lemoncloud/chatic-backend-api`)은 `stereo` 유니온이 더 넓다(`'#alias'` · `'session'` · `'#code'`
— 소켓 도메인이 볼 일 없는 OAuth 내부 마커). 신원 필드는 같지만 **구조적으로 대입되지 않는다.**

`http-data-sources/httpUserMapping.ts`의 `toDomainUserFromHttp`가 명시적 캐스트로 이 둘을 잇는다 —
새 매퍼를 만들지 않고 기존 것을 다리로 쓴다. `stereo` 값에 따라 분기해야 할 일이 생기면, 그때가
캐스트를 더 넓히는 게 아니라 **HTTP 축에 자기 `toDomainUser`를 주는** 신호다.

### 리포트 lane

`ReportHttpDataSource`는 이 층의 예외다. **매핑할 도메인도 캐시 슬롯도 없다.** 진단(diagnostics)은
도메인 데이터가 아니지만 데이터 콜이긴 하므로, ADR-0036의 "모든 데이터 콜은 repository를 거친다"에
남은 마지막 예외를 없애는 쪽을 택했다(2026-09-02). 통과 계층이다 — 매핑 없음, 캐시 없음, 로깅 없음.

이관에서 성질이 바뀐 것 넷:

1. **로깅 예외가 관례에서 계약으로.** "로그 업로드는 `withNetworkLog`를 안 타는 진입점을 골라 쓴다"는 주석 규율이 게이트웨이의 `bypass: ['networkLog']`가 됐다. 호출부가 전송을 조립하지 않으므로 규율을 어길 여지가 사라진다.
2. **`allowRecordError`가 `report-bulk`에 붙는다.** 200 본문의 `dropped`는 서버가 개별 엔트리에 내린 판정이지 실패한 호출이 아니다 — `throwIfApiError`로 승격되면 업로더가 이미 수락된 배치를 재전송한다.
3. **endpoint가 정적 env에서 동적 relay로.** 예전 상수는 `WEB_DOU_ENDPOINT`(빌드 값)를 읽었고 게이트웨이는 `resolveEndpoint('relay')`를 읽는다. 값은 같은 `DOU_ENDPOINT`이고, 달라지는 것은 딥링크 `?_backend` 오버라이드가 리포트에도 적용된다는 점이다.
4. **자격증명 회복 1회가 붙는다.** `HttpClient.run`이 서명 만료로 실패한 요청을 재발급 후 한 번 재전송한다. 오래 백그라운드에 있던 뒤의 flush가 실제로 나가는 경로다. 회복 경로는 로깅을 하므로 "업로드 실패가 로그를 낳지 않는다"는 성질은 **요청 자체**에 한정된다(회복 시도당 최대 1건, 재귀 없음).

분류(`retry`/`discard`/`ok`)는 `app-runtime/report/logBatch.ts`에 있다 — 큐의 어휘
(`UploadOutcome`)는 로거 파이프라인 소유이고 data가 그것을 알 이유가 없다. 그래서 데이터소스와
repository는 **에러를 감싸지 않고 그대로 던진다**(상태 코드가 분류의 입력이다).

### REST 훅 소비처 — ADR-0070의 수치는 과다 계상이다

ADR-0070 §맥락은 REST 훅 6개의 소비를 `18·22·8·6·4·2`로 적었다. 부푼 값이다. `desktop-web`에
`useCloudSessionCatalog`를 감싼 **동명의 자체 `useClouds`**가 있어서 합산됐다.

2026-08-27에 전수 grep으로 다시 셌을 때는 훅마다 한 자리 수였고 `useVerifyNativeAppToken`은 0곳,
즉 이관 대상이 아니라 삭제 후보였다. 그 표는 여기 옮기지 않았다 — 이관이 끝난 뒤로 소비처가 계속
움직이고(그 사이 `libs/web-core`는 4개 형제 lib으로 갈라졌다), 문서에 박아 둔 숫자는 읽는 사람을
틀리게 만든다. 지금 값이 필요하면 직접 세는 것이 맞다.

## 클라이언트 측 요청 제한

`SocketDataSource` 호출자는 socket 클라이언트의 클라이언트 측 backpressure를 인지해야 한다. 이
값들은 `@lemoncloud/chatic-sockets-lib` 소유이고 **이 리포에서는 확인할 수 없다** — 아래는 소비
관점의 참고값이니, 정확한 값이 필요하면 그 lib을 봐야 한다. 호출 결과(특히 reject)를 해석하는 것은
`libs/data` 호출자의 몫이라 여기 남긴다.

| 항목                | 기본값 | 비고                                                |
| ------------------- | ------ | --------------------------------------------------- |
| 동시 in-flight 허용 | 32     | 초과분은 pending으로                                |
| pending 허용        | 512    | in-flight 포화 시 대기                              |
| request timeout     | 30s    | 서버 무응답 시 클라이언트가 timeout                 |
| client-side 429     | —      | pending 초과 시 서버와 무관하게 클라이언트가 reject |

클라이언트 측 429는 서버 HTTP 429와 다르다. sync 루프 요청도 같은 in-flight 슬롯을 공유하므로,
호출자는 두 종류의 reject를 구분해 처리해야 한다.

## 이름 규약

이 레이어는 두 번 개명됐다. 옛 이름으로 쓰인 문서를 만나면 아래 표로 옮겨 읽으면 된다.
**과거 ADR 본문은 그대로 둔다** — 그 시점의 기록이다.

### 2026-09-01 — 소켓 축이 `Socket` 접두로

`remote`는 축(local의 반대)이고 그 아래 이름은 전송 수단을 말한다. 예전에는 소켓 축이 `Remote`를
선점하고 HTTP만 `Http`를 써서, `remote/http-data-sources/`의 클래스가 "remote가 아닌 것"처럼
읽혔다. 소켓 축을 `Socket`으로 옮겨 둘을 대칭으로 맞췄다. HTTP 축은 한 글자도 바뀌지 않았다.

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

### 2026-09-09 — `V2` 접미사 제거 (ADR-0081)

V1이 제거된 뒤에도 데이터 레이어 전체가 `V2`를 달고 있었다. 디렉토리와 식별자에서 뗐다. 데이터
레이어와 무관한 `V2`(`ClientSocketV2` · `registerUserV2` · `RegisterUserV2Body` 등)는 그대로다.

| 예전                                               | 지금                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| `libs/data/src/data/**`                            | `libs/data/src/**` (중첩 한 단계 제거)                   |
| `repositories-v2/`                                 | `repositories/`                                          |
| `local/data-sources-v2/`                           | `local/data-sources/`                                    |
| `XxxRepositoryV2` · `IXxxRepositoryV2`             | `XxxRepository` · `IXxxRepository`                       |
| `BaseRepositoryV2` · `DisposableRepositoryV2`      | `BaseRepository` · `DisposableRepository`                |
| `createRepositoriesV2`                             | `createRepositories`                                     |
| `DataRepositoriesV2` · `DataRepositoriesV2Options` | `DataRepositories` · `DataRepositoriesOptions`           |
| `XxxLocalDataSourceV2` · `IXxxLocalDataSourceV2`   | `XxxLocalDataSource` · `IXxxLocalDataSource`             |
| `BaseLocalDataSourceV2` · `ILocalDataSourceV2`     | `BaseLocalDataSource` · `ILocalDataSource`               |
| `LocalDataSourcesV2` · `createLocalDataSourcesV2`  | `LocalDataSources` · `createLocalDataSources`            |
| `LocalDataSourceV2ContextOverride`                 | `LocalDataSourceContextOverride`                         |
| `LocalDataSourceV2Callback` · `…V2Unsubscribe`     | `LocalDataSourceCallback` · `LocalDataSourceUnsubscribe` |
| app-runtime `factories/repositoryFactory.ts`       | 삭제 — `DataManager`가 lib 팩토리를 직접 부른다          |
