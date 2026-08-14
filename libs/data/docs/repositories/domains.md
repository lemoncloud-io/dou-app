# 도메인별 repository

> 개요·계약은 [README.md](./README.md). 각 도메인의 메서드와 sync 결과 해석을 정리한다. 시그니처 정본은 각 `*RepositoryV2.ts`.

repository V2는 서버에서 온 변경분을 local read-model로 해석하는 계층이다. 외부 sync orchestrator가 `refresh*` / `sync*` / `cacheWrite*`를 호출하면, repository는 그 결과를 local에 반영하고 stream으로 재방출한다.

---

## Channel

`observeList` · `observeItem` · `refreshList(query)` · `syncChannels(since)` · `createChannel` · `updateChannel` · `inviteChannel` · `leaveChannel` · `deleteChannel` · `getSelfChannel` · `getUnreads` · `cache*`

- `syncChannels(since)` — `channel.sync({ since })` 결과를 해석한다. `since: 0`은 full sync, `since > 0`은 변경분이다. 응답의 `list`는 변경된 채널 스냅샷, `ids`는 현재 내가 속한 전체 채널 id, `syncedAt`은 다음 `since`로 저장할 값이다. repository는 `list`를 local에 write하고, `ids`에 없는 채널을 **stale remove**한다.
- `refreshList(query)` — `channel.mine` 기반 보조 초기 조회 경로. sync 중심 구조에서 canonical source는 `syncChannels`다.
- `leaveChannel` / `deleteChannel` — optimistic local remove 후 실패 시 복구.
- **chat 메시지는 fetch하지 않는다.** channel sync는 각 채널의 `chatNo` / `lastChat$`만 포함한 **채널 목록**만 갱신한다. 실제 메시지는 chat 화면이 `ChatRepositoryV2.refreshList`(=`chat.feed`)로 따로 가져온다.

## Chat

`observeList` · `observeItem` · `refreshList(query)` · `getChat` · `sendChat` · `updateChat` · `deleteChat` · `cache*` · `cacheClearByChannelId(channelId)`

- `sendChat` — optimistic pending message 생성, 실패 시 `isFailed` 마킹.
- `refreshList` — `chat.feed` 응답을 local에 merge한다. `ChatRefreshResult`로 cursor 메타(`cursorNo`, `readNo` 등)를 반환할 수 있지만, **메시지 렌더 source는 항상 local stream**이다. 반환 메타는 pagination 입력에만 쓴다.
- list query key는 `channelId + cursorNo + limit`로 구분된다(이전 페이지와 최신 페이지는 다른 query).
- 커서 책임 분리 → [채팅 커서](#채팅-커서) 참조.

## Cloud

`observeList` · `observeItem` · `getCloud` · `updateCloud` · `deleteCloud` · `cache*`

- `CloudGateway`의 `get` / `update` / `delete` 기반. **create는 없다.**
- Cloud는 최상위 조직 단위(`cid`)로, place/site와 달리 scope root 역할이다.
- 캐시 정책은 item 중심(`cid` 기반).

## Join

`observeList` · `observeItem` · `refreshList(query)` · `getJoin` · `readChat` · `updateJoin` · `joinChannel` · `cache*`

- 단건 조회/수정은 1급 `JoinGateway`(`getJoin`=`join.get`, `updateJoin`=`join.update`), 읽음(`readChat`=`chat.read`)·참여(`joinChannel`=`channel.join`)는 보조 command다.
- `readChat` — optimistic read cursor 전진 후 remote 실패 시 복구. unread 감소는 `chat.read` 단일 결과가 아니라, join 스냅샷과 channel 스냅샷이 다시 만나는 과정에서 확정된다.
- `updateJoin` — nick / notify / role 메타 수정.
- read-state의 sync는 외부 orchestrator가 `getJoin` 결과를 `cacheWrite` / `cacheDelete`로 밀어넣는 식으로 처리하고, `JoinRepositoryV2`는 그 결과의 local cache 소유자다.

## Place

`observeList` · `observeItem` · `refreshList(query?)` · `createPlace` · `getPlace` · `updatePlace` · `deletePlace` · `cache*`

- `PlaceGateway`(`place.create/get/update/delete`) + 목록 조회용 `UserGateway.mySite` 기반의 도메인.
- Place는 사용자가 소속/생성한 공간(workspace) 단위다. 주기적 delta sync가 아니라 scope(cid) 전환 시 `refreshList`로 현재 cloud의 place 목록을 다시 읽는 방식이다.
- local-first: remote 결과를 `PlaceLocalDataSourceV2`에 적재 후 `observe*`로 읽는다.

## Profile

`observeList` · `observeItem` · `refreshItem(id)` · `getMyProfile()` · `setProfile` · `setMyProfile` · `syncProfiles(since)` · `cache*`

- **User 도메인에서 완전히 분리된** site별 사용자 프로필 도메인. 전용 `ProfileGateway`(`get`/`getMine`/`set`/`sync`)만 의존한다.
- `refreshItem(id)` — `profile.get`(id = `${sid}:${uid}`) 결과를 local 반영.
- `getMyProfile()` — `profile.get-mine`(현재 세션) 결과를 local 반영.
- `setProfile` / `setMyProfile` — optimistic write + 실패 rollback.
- `syncProfiles(since)` — `profile.sync` delta 결과를 local cache에 upsert / remove. 응답에서 특정 uid가 `null`이면 해당 프로필을 삭제한다.
- 캐시 key는 `${sid}:${uid}` 형식.

## User

`observeList` · `observeItem` · `refreshList(query)` · `updateProfile` · `requestInvite` · `requestInviteBatch` · `syncChannelUsers` · `cache*`

- `syncChannelUsers` — `channel.sync-users` 결과를 local에 반영.
- `updateProfile`(`user.update`)은 사용자 본인 **계정** 프로필 수정으로, site-profile(→ Profile 도메인)과 별개다.
- profile 관련 책임은 User에서 제거됐다.

## SyncMeta

`getSyncedAt(kind)` · `setSyncedAt(kind, syncedAt)`

- **remote data source가 없는 local-only repository.** sync cursor(예: `channel.sync`의 `since`)를 `cid`/`uid` scope에 보관·조회한다.
- 즉, "다음 `since`를 어디에 저장하나"의 답이 이 repository다. 정본: [SyncMetaRepositoryV2.ts](../../src/data/repositories-v2/SyncMetaRepositoryV2.ts).

---

## 채팅 커서

채팅은 cursor 기반이라 두 책임을 분리한다.

- **최신 메시지 감지**는 `channel`의 `chatNo` 기준 — channel sync가 준 `chatNo`와 local max `chatNo`를 비교한다.
- **이전 페이지 pagination**은 `chat.feed`의 `cursorNo` 기준.

둘은 같은 값이 아니다. `cursorNo`는 older page 조회용 query 구분자이지 latest sync 기준값이 아니다.

## cache clear 원칙

- `cacheClear()`는 현재 repository scope 기준 clear다(전체 clear 아님).
- `ChatRepositoryV2`는 `cacheClearByChannelId(channelId)`를 추가로 제공한다.
- 로그아웃 · cloud 전환 · 테스트 초기화에서 clear 범위를 명확히 결정해야 한다.

## 구현 / 테스트 시 주의

- remote 응답 적재 전 요청 시점 context를 캡처한다(`getRequestContext`). cloud 전환 중 늦게 도착한 응답이 현재 scope를 오염시키면 안 된다.
- `sid` fallback 오류는 cross-place 오염으로 이어진다.
- `chat.feed`는 overwrite보다 merge가 중요하다.
- hook이 remote 반환 리스트를 직접 렌더하는 경로가 남으면 V2 목표를 어긴다.
