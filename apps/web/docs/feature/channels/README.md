# channels

> 대상: `apps/web/src/app/features/channels` · 참조 구현: `apps/testbed/src/app/pages/CreateChannelPage.tsx`

## 책임

채팅방(Channel)의 생성·대화·설정을 담당한다. 채널 메타·멤버·메시지를 관측하고, 메시지 전송/읽음/초대 같은 쓰기를 repository로 수행한다.

## 화면

| 페이지                | 경로(`ROUTES.channels.*`)       | 설명                                  |
| --------------------- | ------------------------------- | ------------------------------------- |
| `ChannelRoomPage`     | `/channels/:channelId/room`     | 채팅방 — 메시지 목록·입력·스크롤·읽음 |
| `ChannelSettingsPage` | `/channels/:channelId/settings` | 채널 설정 — 멤버·초대·나가기/삭제     |
| `CreateRoomPage`      | `/channels/create`              | 방 생성                               |

## 구조

```
features/channels/
  types/      # 모델/뷰 타입만 (Domain* re-export + ClientChatView/ClientChannelView/ChannelMember 등)
  hooks/      # 읽기·쓰기 액션 훅 (→ data-layer.md)
  components/ # 프레젠테이션 (Props는 각 파일에 co-locate)
  pages/      # 위 3개 화면
  index.ts    # ChannelRoutes
```

훅은 `hooks/`에, 모델·뷰 타입은 `types/`에 모은다. 컴포넌트 Props는 각 컴포넌트에 co-locate한다(중앙화하지 않음).

## 데이터 흐름

repository observe + sync 등록 모델을 따른다([architecture/data-flow.md](../../architecture/data-flow.md)). 훅별 상세는 [data-layer.md](./data-layer.md). 입퇴장 시스템 메시지 모델·렌더는 [system-message.md](./system-message.md). 채팅방 화면 UI는 [chat-room-ui.md](./chat-room-ui.md), 채널 설정·프로필·알림 UI는 [channel-settings-ui.md](./channel-settings-ui.md). 채널 유형별 상세는 나와의 채팅 [self-chat.md](./self-chat.md), 1:1(DM) [dm-chat.md](./dm-chat.md).

요약:

- **채널 메타** — `useChannel`이 `observeItem` + `useChannelSync`.
- **멤버** — `useChannelMembers`가 user(신원) + join(읽음/역할) observe를 병합. `isVerified` 이후 로드.
- **메시지** — `useChats`가 `observeList({channelId, limit})`. cursor 페이징은 관측 윈도우 확장.
- **읽음** — `useChatMutations.readMessage` → `repos.join.readChat`. `useJoinPositions`가 멤버별 readNo 동기화.

## 네이티브 브릿지

신규 네이티브 기능은 없다. 기존 `appBridge`만 사용한다 — `getContacts`(연락처), `openShareSheet`(초대 공유), `copyClipBoard`(복사), `openSettings`(권한 거부 시 설정 이동). 권한 거부 시 `PermissionDeniedBanner`가 `openSettings()`로 안내한다.

## 미구현(의도적 부재)

- **UI만 있고 미연동** — 알림 설정(토글 로컬 상태), 멤버 프로필의 `신고`·`친구 설정`(인라인 리스트 행, 토스트만).
  백엔드 뮤테이션이 없어 표시/행만 둔다([channel-settings-ui.md](./channel-settings-ui.md), [ADR-0022](../../../../docs/adr/0022-channel-detail-dialogs-figma-redesign.md)).
- **연동됨** — 초대받은 멤버의 **개인 방 이름**(`join.update` nick, "나에게만 표시")과 멤버 추방(kick,
  `leaveChannel({channelId, userId})`, 소유자만)은 실제 연동([channel-settings-ui.md](./channel-settings-ui.md), [ADR-0022](../../../../docs/adr/0022-channel-detail-dialogs-figma-redesign.md)).
- **범위 밖** — 타 멤버 별명 편집(`친구 설정` 보류), 멤버 차단, 방 생성 사진 업로드. 필요해지면 재도입한다.
