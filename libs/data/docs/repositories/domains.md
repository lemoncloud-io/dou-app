# 도메인 13종

> 상태: Live · 정본 코드: [repositories-v2/](../../src/repositories-v2/)

`repositories-v2/`의 도메인별 facade 카탈로그다. 어느 메서드가 local을 읽고 어느 것이 remote를
때리는지, 도메인마다 다른 규칙이 무엇인지 찾아보는 표 — 읽는 문서가 아니라 **찾는 문서**다.

계약·context·cache clear 같은 공통 규칙은 [README.md](./README.md)에 있다.

`local`이 없는 것과 `socket`이 없는 것이 섞여 있다. 어느 도메인이 무엇을 받는지는
[README.md의 repository 배선](./README.md#repository-배선)이 표로 갖고 있다.

---

### Channel

`observeList` · `observeItem` · `refreshList(query)` · `fetchList(query)` · `syncChannels(since)` ·
`createChannel` · `updateChannel` · `inviteChannel` · `leaveChannel` · `deleteChannel` ·
`getSelfChannel` · `getUnreads` · `cache*`

- `syncChannels(since)` — `channel.sync({ since })` 결과를 해석한다. `since: 0`은 full sync, `since > 0`은 변경분이다. 응답의 `list`는 변경된 채널 스냅샷, `ids`는 현재 내가 속한 전체 채널 id, `syncedAt`은 다음 `since`로 저장할 값이다. repository는 `list`를 local에 write하고, `ids`에 없는 채널을 **stale remove**한다.
- `refreshList(query)` — `channel.mine` 기반 보조 초기 조회 경로. sync 중심 구조에서 canonical source는 `syncChannels`다.
- `fetchList(query)` — `refreshList`와 짝이지만 **로컬에 쓰지 않고 결과를 반환한다.** 캐시를 건드리지 않고 서버 목록만 필요할 때 쓴다.
- `leaveChannel` / `deleteChannel` — optimistic local remove 후 실패 시 복구. 본인 나가기는 **서버 응답이 온 뒤에** 그 채널의 chat 캐시까지 비운다 → [퇴장과 재입장](#퇴장과-재입장).
- 나간 직후 짧은 시간(`LEFT_CHANNEL_GUARD_MS`, 10초) 동안은 `refreshList`/`syncChannels` 응답에 그 채널이 들어 있어도 캐시에 다시 쓰지 않는다. 나가기 직전에 발행된 in-flight 응답이 방금 지운 채널을 되살리는 것을 막는 가드다. **시한부인 것이 핵심** — 영구히 잡아 두면 재입장한 채널도 세션 내내 목록에 돌아오지 못한다.
- **chat 메시지는 fetch하지 않는다.** channel sync는 채널 목록만 갱신한다. 실제 메시지는 chat 화면이 `ChatRepositoryV2.refreshList`(=`chat.feed`)로 따로 가져온다.
- 서버는 채널마다 `lastChat$`를 실어 보내지만 **매퍼는 그것을 읽지 않는다.** 마지막 메시지와 그 시각은 chat 캐시 소관이다(ADR-0057, `domain/mappers.ts`). 프리뷰 시드로도 쓰지 않는다.

### Chat

`observeList` · `observeItem` · `observeLastList` · `refreshList(query)` · `getChat` · `sendChat` ·
`updateChat` · `deleteChat` · `setReaction` · `cache*` · `cacheReadLastList` ·
`cacheClearByChannelId(channelId)`

- `sendChat` — optimistic pending message 생성, 실패 시 `isFailed` 마킹.
- `refreshList` — `chat.feed` 응답을 local에 merge한다. `ChatRefreshResult`로 cursor 메타(`cursorNo`, `readNo` 등)를 반환할 수 있지만, **메시지 렌더 source는 항상 local stream**이다. 반환 메타는 pagination 입력에만 쓴다.
- list query key는 **스토리지에 닿는 필드 전부**로 만든다 — `chats` · `channel` · `cursor` · `limit` · `unsent` · `sort` · `keyword` 7파트다(`local/data-sources-v2/ChatLocalDataSourceV2.ts`). 하나라도 빠지면 서로 다른 두 읽기가 한 키로 합쳐져 틀린 답을 공유한다. 그래서 이전 페이지와 최신 페이지는 다른 query다.
- `setReaction`은 UI 쓰기 명령이다(`chat.reaction`). `observeLastList` / `cacheReadLastList`는 홈 프리뷰용 채널별 마지막 메시지 경로다(ADR-0057).
- 커서 책임 분리 → [채팅 커서](#채팅-커서).
- `cacheClearByChannelId(channelId)` — 한 채널의 메시지만 비운다. 호출자는 `ChannelRepositoryV2`(본인 나가기)와 join sync plan(강퇴·타 기기 퇴장) 둘뿐이다 → [퇴장과 재입장](#퇴장과-재입장).

### Cloud

`observeList` · `observeItem` · `getCloud` · `updateCloud` · `deleteCloud` ·
`fetchCloudCatalog` · `verifyCloudEmail` · `makeCloud` · `releaseCloud` · `cache*`

- 소켓 축은 `CloudGateway`의 `get` / `update` / `delete` 기반이다. **`cloud.create`는 소켓 묶음에 없다.**
- HTTP 축이 카탈로그(`list`)와 `make`/`release`/`verifyEmail`을 담당한다. **HTTP 결과는 로컬에 쓰지 않는다** — 카탈로그의 캐시 주인은 react-query 어댑터다.
- Cloud는 최상위 조직 단위(`cid`)로, place/site와 달리 scope root 역할이다.

### Join

`observeList` · `observeItem` · `refreshList(query)` · `getJoin` · `readChat` · `updateJoin` ·
`joinChannel` · `cache*`

- 단건 조회/수정은 1급 `JoinGateway`(`getJoin`=`join.get`, `updateJoin`=`join.update`), 읽음(`readChat`=`chat.read`)·참여(`joinChannel`=`channel.join`)는 보조 command다.
- `readChat` — optimistic read cursor 전진 후 remote 실패 시 복구. unread 감소는 `chat.read` 단일 결과가 아니라, join 스냅샷과 channel 스냅샷이 다시 만나는 과정에서 확정된다.
- `updateJoin` — nick / notify / role 메타 수정.
- read-state의 sync는 외부 orchestrator가 `getJoin` 결과를 `cacheWrite` / `cacheDelete`로 밀어넣는 식으로 처리하고, `JoinRepositoryV2`는 그 결과의 local cache 소유자다.

### Place

`observeList` · `observeItem` · `refreshList(query?)` · `createPlace` · `getPlace` ·
`updatePlace` · `deletePlace` · `cache*`

- `PlaceGateway`(`place.create/get/update/delete`) + 목록 조회용 `UserGateway.mySite` 기반.
- Place는 사용자가 소속/생성한 공간(workspace) 단위다. 주기적 delta sync가 아니라 scope(cid) 전환 시 `refreshList`로 현재 cloud의 place 목록을 다시 읽는 방식이다.
- local-first: remote 결과를 `PlaceLocalDataSourceV2`에 적재 후 `observe*`로 읽는다.

### Profile

`observeList` · `observeItem` · `refreshItem(id)` · `getMyProfile()` · `setProfile` ·
`setMyProfile` · `syncProfiles(since)` · `cache*`

- **User 도메인에서 완전히 분리된** site별 사용자 프로필 도메인. 전용 `ProfileGateway`(`get`/`getMine`/`set`/`sync`)만 의존한다.
- `refreshItem(id)` — `profile.get`(id = `${sid}:${uid}`) 결과를 local 반영.
- `getMyProfile()` — `profile.get-mine`(현재 세션) 결과를 local 반영.
- `setProfile` / `setMyProfile` — optimistic write + 실패 rollback.
- `syncProfiles(since)` — `profile.sync` delta 결과를 local cache에 upsert / remove. 응답에서 특정 uid가 `null`이면 해당 프로필을 삭제한다.
- 캐시 key는 `${sid}:${uid}` 형식.

### User

`observeList` · `observeItem` · `getMyProfile` · `updateProfile` · `requestInvite` ·
`requestInviteBatch` · `syncChannelUsers` · `listRelayUsers` · `tryFetchProfile` ·
`updateProfileHttp` · `cache*`

- `syncChannelUsers` — `channel.sync-users` 결과를 local에 반영.
- `updateProfile`(`user.update`)은 사용자 본인 **계정** 프로필 수정으로, site-profile(→ Profile 도메인)과 별개다.
- HTTP 축(`listRelayUsers` · `tryFetchProfile` · `updateProfileHttp`)은 relay 콘솔·프로필 프로브 경로다.
- 초대 후보 조립을 위해 `join`·`place` 로컬까지 함께 읽는다.
- `refreshList`는 **인터페이스에 없다** — 클래스 public 메서드로만 있다. Channel·Join·Place는 인터페이스에 선언돼 있어 User만 예외다.

### Invite

`list` · `create` · `get` · `accept` · `cancel` · `reject` · `dismiss` · `undismiss` ·
`observeList` · `cacheReadList` · `cache*`

- 1:1 DM 초대 코드 도메인이다. 컴포지션 루트가 gateway를 relay 슬롯에 **고정**한다 — 활성 클라우드를 따라가면 안 된다(ADR-0033).
- 자기 목록 읽기는 local-first지만(ADR-0052로 캐시 슬롯 `invite`가 생겼다), 나머지 command(`create`/`accept`/`cancel`/`reject`/`get`)에는 캐시 슬롯이 없다.
- `dismiss` / `undismiss`는 서버 상태가 아니라 로컬 표시 상태다.

### Auth

`sendPhoneCode` · `verifyPhoneCode` · `confirmPhoneCode` · `verifySocialAccount` ·
`confirmSocialAccount` · `registerUser` · `registerUserV2` · `findAlias` · `verifyAlias` ·
`loginWithInviteCode` · `fetchInviteInfo` · `registerDevice` · `login` · `verifyNativeToken` ·
`exchangeCode` · `delegateCloud` · `exchangeToken`

- **remote-only.** 캐시할 것이 없는 세션 신원 명령 표면이다.
- 소켓 축의 phone/social 증명은 모두 `auth.linkAccount` 한 패킷으로 나간다 — `type`·`mode`·`step` 조립은 `AuthSocketDataSource`가 독점한다.
- HTTP 축은 가입·별칭·초대 로그인에 더해 세션 재료를 낳는 액션(`login` · `exchangeCode` · `delegateCloud` · `exchangeToken`)까지 갖는다. 없는 것은 refresh 계열 둘이고, 와이어 어휘 자체에 없어서 넣을 수도 없다 → [remote.md의 gateway Pick](../remote/README.md#gateway-pick).

### Device

`syncDevice` · `syncStatus` · `updateRemotePushMute` · `registerPushDevice`

- **remote-only.** 조회 신호와 푸시 설정이라 캐시할 것이 없다.
- 소켓 gateway만 라우팅된다 — `save`/`read`/`sync`는 `active` 슬롯으로, relay 소유 푸시 설정인 `updateRemote`는 relay로 간다(ADR-0027).
- `registerPushDevice`는 HTTP 축이고 `IDeviceRegistrationHttpSource`(메서드 하나)만 주입받는다. **이 repository는 아무 제한도 하지 않는다** — `body`와 `opts?.force`를 그대로 넘긴다. 설치당 1회 게이트는 `libs/app-runtime`의 `useDeviceTokenRegistration`에 있다(ADR-0077).

### Report

`submitIssue` · `uploadLogBatch`

- **remote-only이자 HTTP-only.** 소켓 data source조차 없다.
- 진단은 도메인 데이터가 아니지만 데이터 콜이므로 이 층을 지난다(ADR-0036). 에러를 감싸지 않고 그대로 던진다 — 상태 코드가 상위 분류의 입력이다 → [remote.md의 리포트 lane](../remote/README.md#리포트-lane).

### Subscription

`fetchPlans` · `validateGoogle` · `validateApple` · `fetchActiveSubscriptions` ·
`fetchReceiptDetail` · `fetchMembershipInfo` · `validateMembership`

- **remote-only이자 HTTP-only.** `Report`와 같은 형태다.
- 티어·쿼터는 서버가 판정한다(ADR-0060). 캐시 의미는 소비자 쪽 react-query 어댑터가 소유한다.

### SyncMeta

`getSyncedAt(kind)` · `setSyncedAt(kind, syncedAt)`

- **remote data source가 없는 local-only repository.** sync cursor(예: `channel.sync`의 `since`)를 `cid`/`uid` scope에 보관·조회한다.
- 즉 "다음 `since`를 어디에 저장하나"의 답이 이 repository다.
- cursor는 다른 도메인의 데이터를 가리키므로, 그 데이터가 저장소를 옮기면 cursor가 "이미 sync했다"고 거짓말한다. `routingFingerprint`가 그 어긋남을 잡는다(ADR-0053).

---
