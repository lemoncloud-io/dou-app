# repositories — data facade

> 상태: Live · 최종 갱신: 2026-09-09 · 개요는 [architecture.md](./architecture.md) · 정본 코드: [repositories/index.ts](../src/repositories/index.ts) · [repositories/types.ts](../src/repositories/types.ts)

repository는 remote data source와 local data source를 묶어 앱에 노출하는 **data facade**다.
서버에서 온 변경분을 로컬 read-model로 해석하는 계층이기도 하다.

핵심 목표는 하나다.

- 읽기는 항상 local
- remote는 side-effect command
- hook은 stream만 본다

## 3가지 계약

UI 레이어가 보는 것은 두 가지뿐이다.

1. **읽기 스트림** — `observeList` / `observeItem` 구독
2. **쓰기 명령** — `sendChat`, `createPlace`, `updateProfile` 등 사용자 의도 반영

세 번째 `refresh*` / `cache*`는 UI 계약이 아니라 sync 경로다.

| API 그룹                                     | 호출 주체                  | 예시                                             |
| -------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `observe*`                                   | UI hook                    | `observeList(query, cb)`                         |
| write command                                | UI action                  | `sendChat()`, `createPlace()`, `updateProfile()` |
| `refresh*` / `syncChannels` / `syncProfiles` | 외부 sync orchestrator     | `refreshList()`, `syncChannels(since)`           |
| `cache*`                                     | sync orchestrator / 테스트 | `cacheWrite(item)`, `cacheClear()`               |

UI가 `refresh*`를 직접 호출하면 sync 타이밍과 충돌할 수 있다. 필요하면 user event 경로로만
제한적으로 호출한다.

## `BaseRepository`가 주는 것

`BaseRepository`는 event bus나 cachePolicy를 쓰지 않는다. 공통으로 필요한 것만 제공한다.

- `getRequestContext()` — 호출 시점의 `cid`/`sid`/`uid` 스냅샷을 캡처한다. **요청 시점과 응답 시점의 context가 다를 수 있으므로, remote 응답을 적재하기 전 context를 캡처해야 한다.**
- `getNormalizedContext()` — `cid`는 없으면 `'default'`로 정규화.
- `assertRequiredString` — 필수 식별자 검증.
- `dispose()` — 팩토리가 모든 repository를 여기로 정리한다. 현재 base 레벨에서 놓을 자원은 없고, 자원을 잡는 서브클래스를 위한 자리다.

## context와 scope

`DataContext`는 `cid`(연결된 cloud) · `sid`(선택된 place) · `uid`(현재 사용자)다. repository는
context를 직접 보관하지 않고 `DataContextProvider`를 통해 매 호출마다 최신 값을 읽는다
(`DataContextHolder`). 따라서 cloud/place 전환이 있어도 repository를 재생성할 필요가 없고,
`withContext(snapshot)`으로 특정 context에 고정된 사본을 만들 수도 있다.

## 도메인 13종

`local`이 없는 것과 `socket`이 없는 것이 섞여 있다. 배선 표는
[architecture.md의 repository 배선](./architecture.md#repository-배선)에 있다.

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
- **chat 메시지는 fetch하지 않는다.** channel sync는 채널 목록만 갱신한다. 실제 메시지는 chat 화면이 `ChatRepository.refreshList`(=`chat.feed`)로 따로 가져온다.
- 서버는 채널마다 `lastChat$`를 실어 보내지만 **매퍼는 그것을 읽지 않는다.** 마지막 메시지와 그 시각은 chat 캐시 소관이다(ADR-0057, `domain/mappers.ts`). 프리뷰 시드로도 쓰지 않는다.

### Chat

`observeList` · `observeItem` · `observeLastList` · `refreshList(query)` · `getChat` · `sendChat` ·
`updateChat` · `deleteChat` · `setReaction` · `cache*` · `cacheReadLastList` ·
`cacheClearByChannelId(channelId)`

- `sendChat` — optimistic pending message 생성, 실패 시 `isFailed` 마킹.
- `refreshList` — `chat.feed` 응답을 local에 merge한다. `ChatRefreshResult`로 cursor 메타(`cursorNo`, `readNo` 등)를 반환할 수 있지만, **메시지 렌더 source는 항상 local stream**이다. 반환 메타는 pagination 입력에만 쓴다.
- list query key는 **스토리지에 닿는 필드 전부**로 만든다 — `chats` · `channel` · `cursor` · `limit` · `unsent` · `sort` · `keyword` 7파트다(`local/data-sources/ChatLocalDataSource.ts:296`). 하나라도 빠지면 서로 다른 두 읽기가 한 키로 합쳐져 틀린 답을 공유한다. 그래서 이전 페이지와 최신 페이지는 다른 query다.
- `setReaction`은 UI 쓰기 명령이다(`chat.reaction`). `observeLastList` / `cacheReadLastList`는 홈 프리뷰용 채널별 마지막 메시지 경로다(ADR-0057).
- 커서 책임 분리 → [채팅 커서](#채팅-커서).
- `cacheClearByChannelId(channelId)` — 한 채널의 메시지만 비운다. 호출자는 `ChannelRepository`(본인 나가기)와 join sync plan(강퇴·타 기기 퇴장) 둘뿐이다 → [퇴장과 재입장](#퇴장과-재입장).

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
- read-state의 sync는 외부 orchestrator가 `getJoin` 결과를 `cacheWrite` / `cacheDelete`로 밀어넣는 식으로 처리하고, `JoinRepository`는 그 결과의 local cache 소유자다.

### Place

`observeList` · `observeItem` · `refreshList(query?)` · `createPlace` · `getPlace` ·
`updatePlace` · `deletePlace` · `cache*`

- `PlaceGateway`(`place.create/get/update/delete`) + 목록 조회용 `UserGateway.mySite` 기반.
- Place는 사용자가 소속/생성한 공간(workspace) 단위다. 주기적 delta sync가 아니라 scope(cid) 전환 시 `refreshList`로 현재 cloud의 place 목록을 다시 읽는 방식이다.
- local-first: remote 결과를 `PlaceLocalDataSource`에 적재 후 `observe*`로 읽는다.

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
- HTTP 축은 가입·별칭·초대 로그인에 더해 세션 재료를 낳는 액션(`login` · `exchangeCode` · `delegateCloud` · `exchangeToken`)까지 갖는다. 없는 것은 refresh 계열 둘이고, 와이어 어휘 자체에 없어서 넣을 수도 없다 → [remote.md의 gateway Pick](./remote.md#gateway-pick).

### Device

`syncDevice` · `syncStatus` · `updateRemotePushMute` · `registerPushDevice`

- **remote-only.** 조회 신호와 푸시 설정이라 캐시할 것이 없다.
- 소켓 gateway만 라우팅된다 — `save`/`read`/`sync`는 `active` 슬롯으로, relay 소유 푸시 설정인 `updateRemote`는 relay로 간다(ADR-0027).
- `registerPushDevice`는 HTTP 축이고 `IDeviceRegistrationHttpSource`(메서드 하나)만 주입받는다. **이 repository는 아무 제한도 하지 않는다** — `body`와 `opts?.force`를 그대로 넘긴다. 설치당 1회 게이트는 `libs/app-runtime`의 `useDeviceTokenRegistration`에 있다(ADR-0077).

### Report

`submitIssue` · `uploadLogBatch`

- **remote-only이자 HTTP-only.** 소켓 data source조차 없다.
- 진단은 도메인 데이터가 아니지만 데이터 콜이므로 이 층을 지난다(ADR-0036). 에러를 감싸지 않고 그대로 던진다 — 상태 코드가 상위 분류의 입력이다 → [remote.md의 리포트 lane](./remote.md#리포트-lane).

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

## 채팅 커서

채팅은 cursor 기반이라 두 책임을 분리한다.

- **최신 메시지 감지**는 `channel`의 `chatNo` 기준 — channel sync가 준 `chatNo`와 local max `chatNo`를 비교한다.
- **이전 페이지 pagination**은 `chat.feed`의 `cursorNo` 기준.

둘은 같은 값이 아니다. `cursorNo`는 older page 조회용 query 구분자이지 latest sync 기준값이 아니다.

## cache clear 원칙

- `cacheClear()`는 현재 repository scope 기준 clear다(전체 clear 아님).
- `ChatRepository`는 `cacheClearByChannelId(channelId)`를 추가로 제공한다.
- 로그아웃 · cloud 전환 · 테스트 초기화에서 clear 범위를 명확히 결정해야 한다.
- **chat 삭제는 되돌릴 수 없다.** 다른 도메인은 잘못 지워도 서버가 다시 채워 주지만, 메시지 피드는 `join.joinedNo`로 창이 잡혀 있어 그 이전은 서버도 주지 않는다. 그래서 chat 삭제는 추론이 아니라 명시 신호에만 건다 → 아래.

storage가 그 요청을 어떻게 수행하는지는
[local.md의 채널 한정 삭제](./local.md#채널-한정-삭제의-세-경로)에 있다.

## 퇴장과 재입장

재입장은 처음 들어온 것과 같아야 한다. 서버는 재입장 시 join 커서를 리셋하고 피드를
`chatNo > joinedNo`로 창을 잡지만, **클라이언트는 서버 응답이 아니라 로컬 chat 캐시를 렌더한다.**
퇴장해도 그 방의 메시지 행은 캐시에 남으므로(chat sync plan에는 `onRemove`가 없다 — 이력은
lazy-load/오프라인을 위해 유지된다) 두 장치가 함께 필요하다. 결정 근거는
[ADR-0067](../../../docs/adr/0067-rejoin-hides-prior-messages.md).

**① 표시 게이트 — `isInJoinWindow(chat, joinedNo)`** (`src/domain/joinWindow.ts`)

서버와 같은 규칙(`chatNo > joinedNo`)을 캐시를 읽는 자리에 건다. 예외 둘이 의미를 갖는다:

- `joinedNo`가 없으면 아무것도 숨기지 않는다. 서버가 이 필드를 싣기 전에 쓰인 행이 있고, 없는 값을 대신 추측하면 멀쩡한 이력이 사라진다.
- `chatNo`가 falsy면 통과시킨다. 낙관적 전송 행은 서버 번호를 받기 전까지 `chatNo: 0`이라, 이 예외가 없으면 **방금 보낸 메시지가 사라진다.**

소비자는 apps/web의 방 피드·홈 프리뷰·전역 검색 셋이다. 이 게이트는 ②의 중복이 아니라 ②가 닿지
못하는 것(이미 캐시를 쌓아 둔 기존 설치, 강퇴, 타 기기 퇴장)을 덮는 소급 방어선이다.

방 피드에서는 **렌더 직전이 아니라 `useChats`가 캐시를 받는 자리**에 건다. 표시용 목록에만 걸면
같은 훅이 내보내는 `rawChats`(리액션 폴딩·스레드 구성·"1번 행이 로드됐나")가 다른 경계를 갖게
되고, 그러면 캐시에 남은 퇴장 전 1번 행 때문에 **중간에 재입장한 사람에게만 "대화의 시작" 블록이
뜬다** — 처음 초대받은 사람은 못 보는 것을. 페이징 커서도 같은 이유로 참여 이전 `chatNo`를 잡으면
안 된다.

**② purge — 명시 신호에만**

| 신호              | 위치                                      |
| ----------------- | ----------------------------------------- |
| 본인 나가기 성공  | `ChannelRepository.leaveChannel`          |
| 내 join 행의 제거 | join sync plan의 `onRemove` (app-runtime) |

`ChannelSyncPlan.onRemove`와 `syncChannels`의 stale prune에는 **붙이지 않는다.** 추론 기반 정리의
오판 한 번이 복구 불가능한 이력 손실이 되기 때문이다.

purge는 낙관적으로 하지 않고 서버 확인 뒤에 하며, 실패해도 나가기 자체는 성공으로 끝난다 — 이미
일어난 퇴장을 실패로 보고하는 쪽이 더 큰 거짓말이고, 남은 행은 ①이 가린다.

## 구현 / 테스트 시 주의

- remote 응답 적재 전 요청 시점 context를 캡처한다(`getRequestContext`). cloud 전환 중 늦게 도착한 응답이 현재 scope를 오염시키면 안 된다.
- `sid` fallback 오류는 cross-place 오염으로 이어진다.
- `chat.feed`는 overwrite보다 merge가 중요하다.
- hook이 remote 반환 리스트를 직접 렌더하는 경로가 남으면 이 lib의 목표를 어긴다.
- HTTP 주입(`httpDataSources`)은 선택적이다. 미주입 상태에서 HTTP 메서드를 부르면 명시 에러를 던진다.

## 더 읽기

- [socket sync usage](../../app-runtime/docs/socket/sync/usage.md) — join 행 제거가 purge 신호가 되는 경로(app-runtime 소관).
