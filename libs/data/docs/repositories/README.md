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
- [SiteRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/SiteRepositoryV2.ts)
- [UserRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/UserRepositoryV2.ts)
- [InviteCloudRepositoryV2.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/InviteCloudRepositoryV2.ts)
- 공통 타입: [types.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/types.ts)
- 팩토리: [index.ts](/Users/raine/Project/lemon/chatic-front/libs/data/src/data/repositories-v2/index.ts)

## V2 원칙

- `fetch* + cachePolicy` 패턴은 버립니다.
- 운영 hook은 `observe*` 만 읽습니다.
- repository가 remote를 호출하고 local cache를 갱신합니다.
- UI는 repository의 remote 반환 데이터를 직접 렌더하지 않습니다.
- 기존 호환성보다 새 방향이 맞으면 V1 패턴을 유지하지 않고 새로 구현합니다.

## 공통 계약

도메인마다 세부 메서드는 다르지만, 공통 방향은 같습니다.

- `observeItem`
- `observeList`
- `refresh*`
- write command
- `cacheRead`
- `cacheReadList`
- `cacheWrite`
- `cacheWriteMany`
- `cacheDelete`
- `cacheClear`

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

### Site

- `observeList`, `observeItem`
- `refreshList`
- `createSite`, `updateSite`
- `cache*`

### User

- `observeList`, `observeItem`
- `refreshList`
- `updateProfile`
- `requestInvite`, `requestInviteBatch`
- `refreshChannelUsers`
- `refreshSiteProfile`
- `cache*`

특징:

- `refreshChannelUsers` 는 `channel.sync-users` 결과를 local에 반영한다.
- `refreshSiteProfile` 는 현재 remote passthrough 성격이며, local cache 반영까지 책임지지 않는다.
- 따라서 user domain의 모든 메서드가 local-first sync로 동작한다고 가정하면 안 된다.

### InviteCloud

- local-only repository
- `observeList`, `observeItem`
- `cache*`

### Profile

현재 구현 상태는 V2가 아니라 V1 remote passthrough 쪽에 가깝다.

현재 코드 기준:

- remote: `ProfileRemoteDataSource`
- repository: `ProfileRepository`
- local V2: 없음

서버 action:

- `user.get-site-profile` -> `ProfileView`
- `user.set-site-profile` -> `ProfileView`

문서상 목표 구조:

- `ProfileView` 를 직접 UI에 흘리지 않고 `DomainProfile` 로 normalize
- `ProfileRepositoryV2` 가 remote 결과를 local cache에 적재
- UI/hook은 `observeItem(profileId)` 기준으로 읽기
- `setSiteProfile()` 는 optimistic patch + rollback 가능 구조로 정리

즉 profile 은 현재 `refreshSiteProfile()` 과 달리 "아직 local-first 로 이관되지 않은 별도 도메인"으로 취급해야 한다.

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
