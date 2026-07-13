# channels — 데이터 레이어

> 대상: `apps/web/src/app/features/channels/hooks` · 기준: [architecture/data-flow.md](../../architecture/data-flow.md)

훅 구성과 각 훅의 관측·매핑·동기화 책임.

```
hooks/
  useChannel.ts          # 채널 메타 관측 (+ useChannelSync 등록)
  useChannelMembers.ts   # 멤버 관측 (user 캐시 + join 병합, isVerified 게이팅)
  useChannelMutations.ts # 채널 CRUD (create/update/delete/leave/invite, per-action pending)
  useChats.ts            # 메시지 관측 + cursor 페이징 (ClientChatView 매핑)
  useChatMutations.ts    # 전송/읽음/삭제
  useJoinPositions.ts    # 메시지별 읽음 수 + 멤버별 join 동기화 등록
  useUserMutations.ts    # 초대 단건/일괄
  useCreateChannel.ts    # 채널 생성 래퍼
  useCreateInviteBatch.ts# 초대 래퍼 (공유시트/클립보드)
```

## 채널 메타

`useChannel(channelId)`가 `repos.channel.observeItem`을 구독하고 `useChannelSync`를 등록해 런타임이 메타를 갱신하게 한다. `DomainChannel` → `ClientChannelView` 매핑:

- `isOwner = ownerId === myUid`
- `isSelfChat = stereo === 'self'`
- `memberCount = memberIds.length`

## 멤버

`useChannelMembers({channelId})`가 `repos.user.observeList`(신원)와 `repos.join.observeList`(읽음/역할)를 함께 구독해 `userId` 기준으로 병합한다. 네트워크 로드는 `useRuntimeSocketState().isVerified` 이후에만 실행한다(stale 세션 회피, 재인증 시 자동 재시도).

## 메시지

`useChats({channelId, limit})`가 `repos.chat.observeList({channelId, limit: pageLimit})`를 구독한다. `DomainChat` → `ClientChatView` 매핑:

- 작성자 이름: user 캐시 → `owner$` → ownerId 순
- `timestamp = new Date(createdAtMs)`, `isSystem = stereo === 'system'`
- **오래된→최신 순** 정렬 → `messages[last]`가 최신(페이지 auto-read에 사용)

### 페이징

`observeList`는 최신 `limit`개만 반환한다(`chat_no` 역순 cursor). 과거를 더 보려면 **관측 윈도우(`pageLimit`)를 키워** 캐시의 과거 페이지를 다시 포함시킨다.

```
loadMore():
  oldest = messages[0]                       # 오름차순이라 0번이 가장 오래됨
  result = repos.chat.refreshList({ channelId, cursorNo: oldest.chatNo, limit: 50 })
  result.fetchedCount === 0  → hasMore = false
  else                       → pageLimit += 50   # 윈도우 확장 → 재구독 → 과거 포함 재emit
```

스크롤 위치 보존은 페이지의 `useLayoutEffect`가 담당한다(`flex-col-reverse` 기준 `scrollTop` 복원).

## 읽음 처리

- **읽음 전진** — `useChatMutations.readMessage({channelId, chatNo})` → `repos.join.readChat`. 채널 진입 즉시 `channel.chatNo`로 한 번, 메시지 로드 후 최신 `chatNo`로 보정, visibility 복귀·포그라운드 resync 시 재전송.
- **읽음 수 표시** — `useJoinPositions.getReadCount(chatNo)`가 `readNo >= chatNo`인 멤버 수(읽음)/미만 수(안읽음)를 센다. 발신자는 자기 메시지를 읽은 것으로 보므로 안읽음 수를 부풀리지 않는다. relay(default) 클라우드에서는 읽음 수를 노출하지 않는다.

## 동기화 등록

`useJoinPositions`가 멤버별 read-state를 `sync.registerJoin(`${channelId}@${userId}`)`로 등록해 모든 멤버의 `readNo`가 실시간 갱신되게 한다. `register()`는 키 기준 refcount라 `useJoinSync`의 내 join 등록과 dedup된다.
