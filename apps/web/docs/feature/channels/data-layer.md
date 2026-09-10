# channels — 데이터 레이어

> 상태: Live · 최종 갱신: 2026-09-10 · 대상: `apps/web/src/app/features/channels/hooks` (23개)
> · 기준: [architecture/data-flow.md](../../architecture/data-flow.md)
> · 관련 ADR: [ADR-0067](../../../../../docs/adr/0067-rejoin-hides-prior-messages.md) (표시 게이트),
> [ADR-0048](../../../../../docs/adr/0048-unread-count-derivation-contract.md) (unread 파생),
> [ADR-0058](../../../../../docs/adr/0058-navigation-churn-grace-and-seeding.md) (시드)

훅 23개의 관측·매핑·동기화 책임. 여기서는 구조를 정하는 것만 다루고, 화면별 서술은
[chat-room-ui.md](./chat-room-ui.md) · [channel-settings.md](./channel-settings.md)가 소유한다.

```
hooks/
  useChannel.ts            채널 메타 관측 (+ 시드·resolve 타임아웃)
  useChannelJoins.ts       화면의 단일 join 관측자 — myJoin · activeMemberIds · cursorByUser 소유
  useChannelMembers.ts     멤버 신원 조회 (join 은 주입받는다)
  useChannelTitle.ts       stereo 별 제목 해석 (resolveChannelTitle 위임)
  useChannelProfiles.ts    플레이스 프로필 병합
  useChats.ts              메시지 관측 + 표시 게이트 + cursor 페이징
  useReadMarker.ts         읽음 전진 2단 + 포그라운드 재전송
  useJoinPositions.ts      메시지별 읽음 수 + 멤버별 join sync 등록
  useReactions.ts          이모지 리액션
  useMessageJump.ts        특정 메시지로 점프 (필요한 만큼 과거 로드)
  useForegroundChatRefresh.ts  포그라운드 복귀 시 재조회
  useDmPeer.ts / useDmPeers.ts / useDmInviteState.ts   1:1 상대·재초대 상태
  useChatScroll.ts         스크롤 보존
  useUrlMetadata.ts        링크 프리뷰
  useChannelMutations.ts / useChatMutations.ts / useJoinMutations.ts / useUserMutations.ts
  useCreateChannel.ts / useCreateInviteBatch.ts / useInviteCandidates.ts
```

## 채널 메타

`useChannel(channelId, { seed })`가 `repos.channel.observeItem`을 구독한다. 시드는 내비게이션
직후 캐시가 아직 비었을 때 화면이 빈손으로 그리지 않게 하고, 10초 resolve 타임아웃이 붙는다
(ADR-0058).

`DomainChannel` → `ClientChannelView` 매핑은 셋뿐이다.

- `isOwner = ownerId === myUid`
- `isSelfChat = stereo === 'self'`
- `memberCount = memberIds?.length ?? memberNo ?? 0`

**표시 이름은 여기서 나오지 않는다.** 제목은 `stereo`와 이 훅이 갖지 않은 데이터(내 join 닉,
DM 상대 프로필)에 달려 있어서 `useChannelTitle` → `lib/resolveChannelTitle`이 해석한다. 홈 목록도
같은 헬퍼를 쓴다(ADR-0039).

## join 관측은 한 곳이다

`useChannelJoins`가 화면의 **단일 join 관측자**다. `myJoin`(내 커서·닉·알림), `activeMemberIds`,
`cursorByUser`를 여기서 내보낸다.

`useChannelMembers`는 join을 **직접 관측하지 않는다.** `{ channelId, memberIds, joins, detail }`를
받아 신원(user 캐시)만 조회하고 병합한다. 네트워크 로드는 `isVerified` 이후에만 실행한다(stale
세션 회피, 재인증 시 자동 재시도).

나간 멤버 판정은 `hasLeftChannel = joined === 0 && (joinedNo || reason)`이다. `joined === 0`
하나만 보면 초대 대기와 구분되지 않는다.

## 메시지 — 표시 게이트가 훅 경계에 있다

`useChats({ channelId, limit, joinedNo })`가 `repos.chat.observeList`를 구독한다. 그리고 **캐시를
받는 자리에서 창을 자른다.**

```ts
const chats = cachedChats.filter(chat => isInJoinWindow(chat, joinedNo));
```

이 창이 피드·페이징 커서·`rawChats` 전부의 입력이다. 표시용 목록에만 걸면 `rawChats`(리액션
폴딩·스레드 구성·"1번 행이 로드됐나")가 다른 경계를 갖게 되고, 중간에 재입장한 사람에게만
"대화의 시작" 블록이 뜬다(ADR-0067). `joinedNo`는 join 캐시에서 마운트보다 조금 늦게 오므로
**페이징 리셋 대상이 아니다** — 늦은 도착을 채널 변경으로 취급하면 읽던 창을 버린다.

창을 지난 뒤 `messages`는 두 번 더 걸러진다.

- `isOwnSystemChat` — **내가 주체인 입퇴장 알림은 나에게 보이지 않는다**
- `isFeedVisible` — `subType: 'reaction'` 이벤트와 스레드 답글 제거

`rawChats`는 이 두 필터를 거치지 않은 창 전체다. 낙관적 전송 행은 `chatNo` 대신 `+Infinity`로
정렬돼 맨 아래에 붙는다.

반환값: `messages` · `rawChats` · `isEmpty` · `isThreadStartLoaded` · `loadMore` · `loadUntil`.

### 페이징

`observeList`는 최신 `limit`개만 반환한다. 과거를 더 보려면 관측 윈도우(`pageLimit`)를 키워
캐시의 과거 페이지를 다시 포함시킨다.

`loadMore`는 `messages[0]`이 아니라 `chatsRef.current`에서 최소 `chatNo`를 스캔해 커서를 만든다 —
`chats`/`messages`를 의존성에 넣으면 실시간 메시지가 붙을 때마다 콜백 정체성이 바뀌어 스크롤
리스너가 재부착된다. `refreshList`의 `fetchedCount === 0`이면 `hasMore = false`다.

## 읽음 처리

- **읽음 전진의 소유자는 `useReadMarker`다.** 진입 즉시 `channel.chatNo`로 한 번 보내고, 메시지 로드 후 최신 커밋 메시지로 보정하며, 포그라운드 복귀(`visibilitychange`)에 재전송한다. 중복 억제(`lastReadChatNoRef`)와 실패 시 리셋도 여기 있다. 전송 직후 읽음은 `markSent`다. `useChatMutations.readMessage`는 `joinRepository.readChat` 위임 한 줄이다.
- **읽음 수 표시** — `useJoinPositions.getReadCount(chatNo)`가 `readNo >= chatNo`인 멤버 수를 센다. 발신자는 자기 메시지를 읽은 것으로 보므로 안읽음 수를 부풀리지 않는다. 표시 조건은 `!isSelfChat && activeCount >= 2` 하나이고 **클라우드 종류로 가르지 않는다** — 1:1도 표시 대상이며 거기서는 안읽음 개수만 뜬다.

## 동기화 등록

`useJoinPositions`가 멤버별 read-state를 `sync.registerJoin(`${channelId}@${userId}`)`로 등록해
모든 멤버의 `readNo`가 실시간 갱신되게 한다. `register()`는 키 기준 refcount라 홈·플레이스
화면이 부르는 `useJoinSyncRegistration`의 내 join 등록과 dedup된다.
