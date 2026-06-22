# Repositories (`libs/data/src/data/repositories-v2`)

repository V2는 remote data source, local data source V2, domain event를 묶어 앱에 노출하는 데이터 facade 입니다.

핵심 목표는 하나입니다.

- 읽기는 항상 local
- remote는 side effect command
- hook은 stream만 본다

## 현재 구조

- V1: `libs/data/src/data/repositories`
- V2: `libs/data/src/data/repositories-v2`

V2 구현 파일:

- [ChannelRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/ChannelRepositoryV2.ts)
- [ChatRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/ChatRepositoryV2.ts)
- [JoinRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/JoinRepositoryV2.ts)
- [PlaceRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/PlaceRepositoryV2.ts)
- [UserRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/UserRepositoryV2.ts)
- [InviteCloudRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/InviteCloudRepositoryV2.ts)
- [ProfileRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/ProfileRepositoryV2.ts)
- 공통 타입: [types.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/types.ts)
- 팩토리: [index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/index.ts)

## 궁극적 목표

**UI는 네트워크 콜을 직접 하지 않는다.**

UI 레이어의 계약은 두 가지뿐이다.

1. **쓰기 명령**: `sendChat`, `createPlace`, `updateProfile` 등 사용자 의도 반영
2. **읽기 스트림**: `observeList` / `observeItem` 구독

동기화 타이밍, `refresh*` 호출, `since` cursor 관리, reconnect 후 full sync — 이 모든 것은 `app-runtime/sync` 레이어가 내부에서 처리한다. UI는 데이터가 언제 갱신됐는지 알 필요가 없다. `observe*` stream이 바뀌면 렌더가 반응한다.

## V2 원칙

- `fetch* + cachePolicy` 패턴은 버립니다.
- UI hook은 `observe*` 만 읽습니다. `refresh*` 반환값을 직접 렌더하지 않습니다.
- `refresh*`는 sync 플랜(`app-runtime/sync`)이 호출하지만, 상황에따라 UI가 직접 호출합니다. (user event, ...)
- repository가 remote를 호출하고 local cache를 갱신합니다.
- 기존 호환성보다 새 방향이 맞으면 V1 패턴을 유지하지 않고 새로 구현합니다.

## API 호출 주체

| API 그룹      | 호출 주체               | 예시                                             |
| ------------- | ----------------------- | ------------------------------------------------ |
| `observe*`    | UI hook                 | `observeList(query, cb)`                         |
| write command | UI action               | `sendChat()`, `createPlace()`, `updateProfile()` |
| `refresh*`    | sync 플랜 (app-runtime) | `refreshListSince(since)`, `refreshList()`       |
| `cache*`      | sync 플랜 / 테스트      | `cacheClear()`, `cacheWrite(item)`               |

UI가 `refresh*`를 직접 호출하면 sync 레이어와 타이밍이 충돌한다. 필요하다면 sync 플랜의 `onConnected` 또는 `onTrigger` 경로를 통해 처리한다.

## 서버 sync 스펙과의 관계

기준 문서:

- [sync/README.md](/Users/raine/Project/lemon/chatic-front/libs/data/docs/sync/README.md)

repository V2는 sync 스펙을 해석하는 계층입니다.

- `channel.sync({ since: 0 })` -> canonical full sync
- `channel.sync({ since })` -> 증분 채널 반영
- `channel.sync.ids` -> stale local remove
- `chat.feed` -> 메시지 페이지 반영
- `chat.read` -> join/read 상태 반영
- socket/domain event -> local 즉시 반영
- `channel.mine` -> 필요 시 보조 초기 조회 경로

중요한 경계:

- `device` scheduler / runtime 자체는 repository V2 책임이 아니다.
- repository V2는 주로 `channel`, `chat`, `join`, `user`, `site`의 remote 결과를 local read-model로 해석한다.
- transport 계층의 keep-alive / reconnect / rotation 정책은 repository 문서의 범위 밖이다.

## 구현된 V2 도메인 기준

### Place

- `observeList`, `observeItem`
- `refreshList`
- `createPlace`, `getPlace`, `updatePlace`, `deletePlace`
- `cache*`

특징:

- `PlaceGateway`(`place.create`, `place.get`, `place.update`, `place.delete`) 기반의 신규 도메인이다.
- UserGateway의 `makeSite` / `updateSite` 는 deprecated 처리됐으며, 신규 코드는 이 repository를 사용해야 한다.
- Place는 사용자가 소속되거나 생성한 공간(workspace) 단위를 나타낸다.
- local-first V2 패턴 적용: remote 결과를 `PlaceLocalDataSourceV2`에 적재 후 `observeList` / `observeItem`으로 읽는다.

### Channel

- `observeList`, `observeItem`
- `refreshList(query)`
- `refreshListSince(since)`
- `createChannel`, `updateChannel`, `inviteChannel`, `leaveChannel`, `deleteChannel`
- `getSelfChannel`, `getUnreads`
- `cache*`

특징:

- `channel.sync({ since: 0 })` 를 full sync 기준으로 사용할 수 있음
- `channel.mine` 은 보조 초기 조회 경로로 남아 있음
- `leave/delete` 는 optimistic local remove 후 실패 시 복구
- `chat:create`, `join:update` 이벤트를 받아 unread 관련 채널 스냅샷을 갱신
- **chat 메시지는 fetch하지 않는다**: `refreshListSince`는 `channel.sync` 응답으로 **채널 목록만** 갱신한다(각 채널 `chatNo`/`lastChat$` 포함). chat 메시지는 chat 화면이 `ChatRepositoryV2.refreshList`(=`chat.feed`)를 직접 호출해 가져온다(app-runtime sync 문서 결정 2).

### Chat

- `observeList`, `observeItem`
- `refreshList(query)`
- `sendChat(payload)`
- `cacheClearByChannelId(channelId)`
- `cache*`

특징:

- `sendChat` 은 optimistic pending message 생성
- 실패 시 `isFailed` 로 마킹
- `refreshList` 는 cursor meta를 반환할 수 있지만, 메시지 렌더 source는 여전히 local stream

### Join

- `observeList`, `observeItem`
- `refreshList(query)` 는 현재 local snapshot 반환
- `readChat`, `updateJoin`, `joinChannel`
- `cache*`

특징:

- `readChat` 은 optimistic read cursor 전진 후 remote 실패 시 복구

### User

- `observeList`, `observeItem`
- `refreshList`
- `updateProfile`
- `requestInvite`, `requestInviteBatch`
- `refreshChannelUsers`
- `cache*`

특징:

- `refreshChannelUsers` 는 `channel.sync-users` 결과를 local에 반영한다.
- **profile 관련 책임은 User에서 제거됐다.** 사이트 프로필 조회/저장/동기화는 전용 `ProfileRepositoryV2`(아래 Profile)가 담당한다. `updateProfile`(`user.update`)은 사용자 본인 계정 프로필 수정으로 site-profile과 별개다.
- 따라서 user domain의 모든 메서드가 local-first sync로 동작한다고 가정하면 안 된다.

### InviteCloud

- local-only repository
- `observeList`, `observeItem`
- `cache*`

### Cloud

- `getCloud`, `updateCloud`, `createCloud`, `deleteCloud`
- cache 정책: item 중심 (`cid` 기반)

특징:

- `CloudGateway`(`cloud.create`, `cloud.get`, `cloud.update`, `cloud.delete`) 기반이다.
- 기존 `CloudRemoteDataSource`는 `update()` 만 노출하고 있었으나, 이제 풀 CRUD로 확장된다.
- Cloud는 최상위 조직 단위(cid)를 나타낸다. site / place와 달리 scope root 역할이다.
- `cloud.create`는 서버 측 NOT IMPLEMENTED 상태일 수 있으므로 호출 전 확인이 필요하다.

### Profile

V2 구현 완료.

현재 코드 기준:

- remote: `ProfileRemoteDataSource` — 신규 `ProfileGateway` (`profile.get`, `profile.get-mine`, `profile.set`, `profile.sync`) 기반
- repository: `ProfileRepositoryV2`
- local: `ProfileLocalDataSourceV2`

서버 action (v2 기준):

- `profile.get` → `ProfileView` (id 기반 단건)
- `profile.get-mine` → `ProfileView` (현재 세션 기반)
- `profile.set` → `ProfileView`
- `profile.sync` → `SiteProfileSyncView` (사이트 멀티프로필 delta 동기화, `since` cursor 지원)

구현된 메서드:

- `observeList`, `observeItem`
- `refreshItem(id)` — `profile.get`(id = `${sid}:${uid}`) 결과를 local 반영
- `getMyProfile()` — `profile.get-mine`(현재 세션) 결과를 local 반영
- `setProfile(payload)` / `setMyProfile(body)` — `profile.set` optimistic write + 실패 rollback
- `syncProfiles(since)` — `profile.sync` 결과를 local cache에 upsert/remove
- `cache*`

특징:

- **User 도메인에서 완전히 분리됨.** `ProfileRemoteDataSource`는 sockets-lib 전용 `ProfileGateway`(`get`/`getMine`/`set`/`sync`)만 의존하며, `UserGateway.getSiteProfile`/`setSiteProfile`·`ChannelGateway.syncProfile`은 사용하지 않는다. `ProfileRepositoryV2`는 더 이상 `UserRemoteDataSource`를 주입받지 않는다.
- `syncProfiles(since)` 는 delta sync 기준이며 `app-runtime/sync`의 `ProfileSyncPlan`이 호출 타이밍을 결정한다.
- profile 캐시 key는 `${sid}:${uid}` 형식이다.

## 채팅 커서 전략

채팅은 cursor 기반이라 repository에서 역할을 분리해야 합니다.

1. 메시지 목록 source of truth

- local cache
- hook은 `observeList({ channelId, cursorNo?, limit? })` 만 본다

2. refresh command 반환 메타

- `refreshList()` 는 `cursorNo`, `readNo`, `total`, `wroteCount` 를 반환할 수 있다
- 이 메타는 pagination control이나 다음 command 입력에만 쓴다
- 메시지 배열 자체는 이 반환값으로 렌더하지 않는다

3. latest sync 기준

- 최신 메시지 반영은 `channel.sync` 의 `chatNo` 와 local max `chatNo` 비교로 풀어야 한다
- older pagination cursor와 latest sync 기준은 같은 값으로 취급하지 않는다

정리:

- cursor는 "older page" 용
- channel chatNo는 "latest sync" 용
- 둘의 책임을 섞지 않는다

## cache clear 원칙

- `cacheClear()` 는 현재 repository scope 기준 clear
- `ChatRepositoryV2` 는 `cacheClearByChannelId(channelId)` 도 제공
- 테스트 환경에서는 scenario 시작 전에 clear 범위를 명시해야 함

## 구현 / 테스트 시 주의 사항

- remote 응답 적재 전 요청 시점 context를 캡처해야 합니다.
- cloud 전환 중 늦은 응답이 현재 scope를 오염시키면 안 됩니다.
- hook이 remote 반환 리스트를 직접 읽는 경로가 남으면 V2 목표를 어깁니다.
- `channel.sync.syncedAt` 저장 위치는 상위 orchestration 레이어에서 명확히 관리해야 합니다.
- `chat.feed` 는 overwrite보다 merge 정책이 중요합니다.
- 검증 목적 테스트를 추가할 때는 필요한 설명 주석을 영어로 남겨 테스트 의도를 바로 읽을 수 있게 합니다.
