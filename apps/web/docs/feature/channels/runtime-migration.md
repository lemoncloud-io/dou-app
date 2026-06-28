# Channels 피쳐 — 데이터 레이어 런타임 마이그레이션

> 작성일: 2026-06-25 · 브랜치: `feature/raine-migrate-socket`

`apps/web/src/app/features/channels`의 데이터 레이어를 구 소켓 스택(`@chatic/socket` +
`@lemoncloud/*-api` 직접 의존)에서 신규 런타임(`@chatic/app-runtime` repos/sync +
`@chatic/data` Domain + `@chatic/web-core` 세션 훅)으로 재구축한 작업 기록.
참조 구현은 `apps/testbed/src/app/pages/CreateChannelPage.tsx`.

## 배경

이 브랜치의 reorg 커밋(`53509f79`) 이후 channels는 **컴파일 불가** 상태였다. 페이지들이
존재하지 않는 모듈을 import하고 있었다:

- `../../../hooks` 의 데이터 훅 7종 (`useChannel`, `useChannelMembers`, `useChats`,
  `useChatMutations`, `useJoinPositions`, `useChannelMutations`, `useUserMutations`) —
  apps/web `app/hooks`에는 `useBackHandler`만 존재.
- `../../../shared/types` 의 `ClientChatView`, `FOREGROUND_RESYNC_EVENT_NAME` — 해당 디렉토리 없음.
- `@chatic/socket`(`useWebSocketV2Store`), web-core의 stale 훅(`useDynamicProfile`, `useUserContext`).

원본 훅은 대규모 디렉토리 reorg 이전의 IDE shelf에만 diff로 남아 복구 불가했다. 따라서
현재 V2 repo API(testbed/home과 동일)를 기준으로 feature-local 하게 새로 작성했다.

## 아키텍처

```
features/channels/
├── types/                    # 모델/뷰 타입만 (React 훅 없음)
│   └── index.ts              #   Domain* re-export + ClientChatView/ClientChannelView/
│                             #   ChannelMember + FOREGROUND_RESYNC_EVENT_NAME
├── hooks/                    # 읽기·쓰기 액션 훅 전부
│   ├── useChannel.ts         #   채널 메타 관측 (+ useChannelSync 등록)
│   ├── useChannelMembers.ts  #   멤버 관측 (user 캐시 + join 병합, isVerified 게이팅)
│   ├── useChannelMutations.ts#   채널 CRUD (create/update/delete/leave/invite, per-action pending)
│   ├── useChats.ts           #   메시지 관측 + cursor 페이징 (ClientChatView 매핑)
│   ├── useChatMutations.ts   #   전송/읽음/삭제
│   ├── useJoinPositions.ts   #   메시지별 읽음 수 + 멤버별 join 동기화 등록
│   ├── useUserMutations.ts   #   초대 단건/일괄
│   ├── useCreateChannel.ts   #   채널 생성 래퍼 (useChannelMutations 기반)
│   └── useCreateInviteBatch.ts# 초대 래퍼 (useUserMutations + 공유시트/클립보드)
├── components/               # 프레젠테이션 (Props는 각 파일에 co-locate)
└── pages/
    ├── ChannelRoomPage.tsx   #   채팅방 (목록/입력/스크롤/읽음)
    ├── ChannelSettingsPage.tsx
    └── CreateRoomPage.tsx
```

원칙은 home과 동일 — **훅은 `hooks/`에, 모델·뷰 타입은 `types/`에** 모은다. 컴포넌트 Props는
관례대로 각 컴포넌트에 co-locate 유지(중앙화하지 않음).

## 데이터 흐름

- **채널 메타** — `useChannel(channelId)`가 `repos.channel.observeItem`을 구독하고 `useChannelSync`를
  등록해 런타임이 메타를 갱신하게 한다. `DomainChannel`을 `ClientChannelView`로 매핑한다
  (`isOwner = ownerId === myUid`, `isSelfChat = stereo === 'self'`, `memberCount = memberIds.length`).
- **멤버** — `useChannelMembers({channelId})`가 `repos.user.observeList`(신원)와
  `repos.join.observeList`(읽음/역할)를 함께 구독해 `userId` 기준으로 병합한다. 네트워크 로드는
  `useSocketState().isVerified` 이후에만 실행(stale 세션 회피, 재인증 시 자동 재시도).
- **메시지** — `useChats({channelId, limit})`가 `repos.chat.observeList({channelId, limit: pageLimit})`를
  구독한다. `DomainChat`을 `ClientChatView`로 매핑(owner 이름은 user 캐시 → `owner$` → ownerId 순,
  `timestamp = new Date(createdAtMs)`, `isSystem = stereo === 'system'`)하고 **오래된→최신 순**으로
  정렬해 `messages[last]`가 최신이 되게 한다(페이지가 auto-read에 사용).
- **동기화 등록** — `useJoinPositions`가 멤버별 read-state를 `sync.registerJoin(`${channelId}@${userId}`)`로
  등록해 모든 멤버의 `readNo`가 실시간 갱신되게 한다(testbed 패턴). `register()`는 키 기준 refcount라
  `useJoinSync`의 내 join 등록과 dedup된다.

## 페이징

`observeList`는 최신 `limit`개만 반환한다(`chat_no` 역순 cursor 페이징). 과거를 더 보려면
**관측 윈도우(`pageLimit`)를 키워** 캐시에 적재된 과거 페이지를 다시 포함시킨다.

```
loadMore():
  oldest = messages[0]                       # 오름차순이라 0번이 가장 오래된 메시지
  result = repos.chat.refreshList({ channelId, cursorNo: oldest.chatNo, limit: 50 })
  result.fetchedCount === 0  → hasMore = false
  else                       → pageLimit += 50   # 윈도우 확장 → 재구독 → 과거 포함 재emit
```

스크롤 위치 보존은 페이지의 `useLayoutEffect`가 담당한다(`flex-col-reverse` 기준 `scrollTop` 복원).

## 읽음 처리

- **읽음 전진** — `useChatMutations.readMessage({channelId, chatNo})` → `repos.join.readChat`.
  채널 진입 즉시 `channel.chatNo`로 한 번, 메시지 로드 후 최신 `chatNo`로 보정, visibility 복귀 및
  포그라운드 resync(`FOREGROUND_RESYNC_EVENT_NAME`) 시 재전송한다.
- **읽음 수 표시** — `useJoinPositions.getReadCount(chatNo)`가 `readNo >= chatNo`인 멤버 수(읽음)와
  미만 수(안읽음)를 센다. 메시지 발신자는 자신의 메시지를 이미 읽은 것으로 보므로 안읽음 수를
  부풀리지 않는다. relay(default) 클라우드에서는 읽음 수를 노출하지 않는다.

## 변경된 동작 (의도적 제거)

미구현 stub은 (구현하지 않을 것이므로) 제거했다.

- **알림 설정** — `RoomNotificationSettingsPage`(전부 TODO) + 라우트 + Settings 진입 버튼 +
  `ROUTES.channels.roomNotifications`(및 해당 테스트) 제거.
- **멤버 신고/차단** — `ReportMemberDialog` 삭제, `ChannelSettingsPage`의 report/block 핸들러·
  다이얼로그 제거, `MemberListItem`의 액션 메뉴(`onReport`/`onBlock`/`showActions`) 제거.
- **방 생성 사진 업로드** — `CreateRoomPage`의 비동작 사진 placeholder 버튼 제거.
- **초대 batch payload** — `MyUserInviteBody` 스키마 변경(`to`/`cloudId` → `alias`/`type`)에 맞춰
  `createBatchInvite`를 새 형태로 적응(phones를 콤마 결합으로 전달).

> 보류: `CreateRoomPage`의 초대코드는 실제 API 응답 연동 전까지 현행(하드코딩) 유지.

## 브리지 (네이티브)

신규 네이티브 기능은 추가하지 않았다. 기존 `appBridge` 호출만 유지한다 — `getContacts`(연락처),
`openShareSheet`(초대 공유), `copyClipBoard`(복사), `openSettings`(권한 거부 → 설정 이동).
권한은 현행대로 `getContacts()` 호출 시 암묵 처리되며, 거부 시 `PermissionDeniedBanner`가
`openSettings()`로 안내한다.

## 검증

- 유닛 테스트: `useJoinPositions.test.ts`(읽음/안읽음 카운트·등록), `useChats.test.ts`
  (매핑·정렬·cursor 페이징), `copyMessageToClipboard.test.ts`(`appBridge.copyClipBoard` 기준으로
  mock 불일치 수정) — 3 suites 10건 통과.
- 타입체크: 본 작업이 생성/수정한 channels·routes 파일 **0 에러**.
- 브라우저 검증은 보류 — `features/mypage`의 pre-existing 컴파일 에러로 앱 전체 빌드 불가.

## 범위 외 (다른 피쳐)

- `features/mypage`가 아직 구 스택(`cloudCore`, `useWebCoreStore`, `subscribeList` 등) +
  삭제된 `../../../hooks` export(`useUserMutations` 등)를 참조 — 별도 마이그레이션 필요(44 에러).
