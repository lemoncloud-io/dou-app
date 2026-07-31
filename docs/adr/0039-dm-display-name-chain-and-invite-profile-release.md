# ADR-0039: DM 표시 이름 체인 통일과 초대 수락의 프로필 강제 해제

> 상태: Accepted · 결정일: 2026-07-31

## 맥락 (Context)

ADR-0032가 1:1(DM) 화면을 만든 뒤, 표시 이름에 관해 세 지점이 어긋난 채 남았다.

| 지점    | 현재                                                                                                                                          | 문제                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 방 헤더 | `dmPeer?.nick` 단독 ([ChannelRoomPage.tsx:121](../../apps/web/src/app/features/channels/pages/ChannelRoomPage.tsx:121))                       | 내 `join.nick`을 보지 않는다                   |
| 홈 목록 | `resolveChannelTitle`에 `'dm'` 분기 없음 ([resolveChannelTitle.ts:38-40](../../apps/web/src/app/features/home/lib/resolveChannelTitle.ts:38)) | 이름 없는 DM이 "이름 없는 채팅방"으로 뜬다     |
| 방 본문 | 인트로 없음                                                                                                                                   | 상대가 누구인지, 뭘 하는 방인지 첫 화면에 없다 |

가장 눈에 띄는 결과는 **같은 방이 두 이름으로 보이는 것**이다. 초대로 생긴 DM은
`channel.name`이 없어 홈에서 "이름 없는 채팅방"이지만, 열면 헤더가 상대 nick으로
바뀐다. 홈 목록의 owner 분기가 `channel.name`을 쓰고 내 `join.nick`을 **무시**하는데
DM의 owner는 초대한 사람이라 이 어긋남이 초대자 쪽에서 항상 발생한다.

조사에서 확인한 사실들이 결정을 좌우했다.

1. **`join.nick`은 "내가 이 방에 붙인 이름"이다** — 사람 이름이 아니다
   ([channels/types/index.ts:26](../../apps/web/src/app/features/channels/types/index.ts:26),
   [utils/channel.ts:13](../../apps/web/src/app/utils/channel.ts:13)). 쓰기 주체는
   `UpdateChannelDialog`·`SelfChatNameDialog`이며, ADR-0032 결정 3이 DM에서 그
   진입을 닫아뒀다. 즉 **DM의 `join.nick`은 현재 아무도 쓰지 않는다.**
2. **Figma 인트로 첫 줄은 이미 존재하는 문구다.** `chat.room.system.join` =
   `"님이 채팅방에 입장했습니다."`로 글자까지 같다. 지금은 가운데 정렬 pill
   (`SystemNotice`)로 스트림 안에 렌더되고, `isOwnSystemChat` 필터 때문에 **상대
   입장 메시지만** 보인다.
3. **쓰일 곳을 기다리는 컴포넌트가 이미 있다.**
   [`SystemMessage.tsx`](../../libs/web-ui-kit/src/composites/chat/SystemMessage.tsx)는
   kit에 정의·export되어 있으나 소비처가 없고, doc 주석이 이 케이스 그대로다
   (`"<친구>님이 채팅방에 입장했습니다."` + `"1:1 대화를 시작해 보세요."`).
4. **프로필 강제는 한 줄이다.**
   [useRelayInviteFlow.ts:237](../../apps/web/src/app/features/invite/accept/hooks/useRelayInviteFlow.ts:237)의
   `if (!latest.current.nick) return setPhase('profiling')`. 그리고 커밋 `98a4685ff`
   (2026-07-28)가 플레이스 진입 시의 프로필 강요를 이미 걷어냈으므로 **이 relay 수락
   경로가 앱에 남은 마지막 강제 지점이다.** 프로필은 DM 진입을 막지 않는다
   ([useEnterInvitedChannel.ts:11-14](../../apps/web/src/app/features/invite/accept/hooks/useEnterInvitedChannel.ts:11),
   [HomePage.tsx:184-188](../../apps/web/src/app/features/home/pages/HomePage.tsx:184)).
5. `profileMap`은 `activeMemberIds`만 채운다
   ([useChannelProfiles.ts](../../apps/web/src/app/features/channels/hooks/useChannelProfiles.ts)) —
   수락 전 pending 상대는 프로필 항목이 없어 user 캐시로 폴백한다.

## 결정 (Decision)

### 1. DM 표시 이름 체인을 하나로 통일한다

**내 `join.nick` → 상대 `profile.nick` → `channel.name` → 공통 라벨**

> **구현 중 개정 (2026-07-31)** — 원안의 마지막 단계는 상대 `user.nick`/`user.name`이었다. 그 값은
> 채널당 `syncChannelUsers` 네트워크 호출로만 채워져서(`useChannelMembers.ts:75`) 목록 화면이 싸게
> 가질 수 없고, 체인에 넣으면 **방만 다른 답을 내 이 ADR이 고치려던 어긋남이 되살아난다.** 그래서
> 네 화면이 전부 갖고 있는 `channel.name`으로 바꿨다. `***<뒷4자리>` 표시명을 어디에도 보여주지
> 않게 된 것은 결정 3의 "이름 없으면 이름 없다고 말한다"와도 맞는다.

이 체인을 방 헤더·방 설정 화면·홈 목록·채팅방 관리 목록이 **모두 같은 것을 쓴다.**
`useDmPeer`가 이미 뒤쪽 두 단계를 갖고 있으므로 앞에 `join.nick`을 얹고,
`resolveChannelTitle`에 `'dm'` 분기를 추가해 owner/member 분기 이전에 가로챈다.
DM에서는 `channel.name`을 보지 않는다.

### 2. DM 방 이름 변경을 되살린다 — ADR-0032 결정 3 철회

`ChannelSettingsPage`가 DM일 때 닫아둔 "방 이름 변경" row를 다시 열어 `join.nick`을
기록하게 한다. 1의 체인에서 `join.nick`이 최우선인데 쓰는 경로가 없으면 그 우선순위가
영구히 죽은 분기이기 때문이다.

한편 **초대 시 입력한 친구 이름(`invite.create({ phone, name })`)을 `join.nick`으로
자동 반영하는 배선은 이번 범위가 아니다** — 담당자가 별도로 진행한다. 그때까지 DM
이름은 사용자가 직접 붙이지 않으면 상대 프로필로 폴백한다.

### 3. 본문 첫 블록: 정적 인트로와 시스템 메시지를 **병존**시킨다

- kit의 `SystemMessage`를 **첫 소비**한다 (2줄: 굵은 제목 + 보조 설명).
- 위치는 self-chat intro와 동일하게 잡는다 — 가장 오래된 날짜 divider 바로 아래
  (`isOldestGroup`), Figma의 `[날짜][인트로][메시지]` 순서와 일치한다.
- **항상 표시한다.** 메시지가 없는 빈 상태에서도 뜬다 → **ADR-0032 결정 5 철회**
  (DM 빈 상태 = "버블 없음").
- 이름은 **상대 `profile.nick`만** 쓴다(1의 체인이 아니다 — 이 문장은 "누가 입장했다"는
  사실 서술이므로 내가 붙인 별칭을 넣으면 어색하다). `profile.nick`이 없으면 **이름
  없는 일반 문구로 대체**한다. 신규 i18n 키가 필요하다(제목 2종 + 설명 1종). 이름
  없는 변형의 카피는 우리가 정하는 것이므로 디자이너 확인 대상이다(초안:
  `"대화 상대가 채팅방에 입장했습니다."`).
- **기존 join/leave `SystemNotice` pill은 그대로 둔다.** 같은 문장이 한 화면에 두 모양으로
  나오는 것을 의도된 것으로 받아들인다.

### 4. 홈 목록의 DM 행

- 제목: 1의 체인. 상대 프로필은 **DM 행들의 peer id를 모아 목록 단위로 한 번에 배치
  조회**한다(`channel.memberIds`에서 peer id 추출 → `useChannelProfiles(sid, peerIds)`).
  행마다 구독하지 않는다.
- 아바타: 상대 `thumbnail`. 없으면 1인 글리프 폴백 — 방 헤더와 일치시킨다.
- 인원수 pill 숨김: DM은 항상 2인이라 정보가 없다.

`resolveChannelTitle`은 `PlaceChannelManagePage`와 공유하므로 수정이 두 화면에 함께
내린다.

### 5. 초대 수락의 `profiling` 스텝을 완전 삭제한다 — ADR-0033 D10 개정

수락 순서는 **인증 → 수락**이 된다.

- `RelayInvitePhase`에서 `'profiling'` 제거, `RelayInviteProfileDialog.tsx` 삭제,
  `RelayInviteAccept`의 해당 분기와 `onProfileSaved` 제거.
- `relayInviteAccept.profile.*` i18n 키 정리(ko/en).
- `useRelayInviteFlow.test.ts`·`RelayInviteAccept.test.tsx`의 프로필 순서 테스트 수정.
- [docs/invite-accept-entry.md](../invite-accept-entry.md)의 S1 step 7과 relay 상태도
  갱신(`submitting --> profiling` 간선 삭제).
- `PlaceProfileFormDialog`·`PlaceProfileForm`·`useSaveMyPlaceProfile`은 **유지한다** —
  플레이스 설정 허브(ADR-0031)와 홈 드롭다운이 쓰는 경로다. 프로필은 그쪽에서 나중에
  설정한다.

### 범위 밖 (Out of scope)

- 초대 시 입력한 이름 → `join.nick` 자동 반영 배선 (별도 진행)
- 백엔드 신규 요청(`stereo`·`memberCount` 비정규화 등)
- 그룹/self 화면의 표시 규칙 — 손대지 않는다
- 프로필 미설정자에 대한 재권유 UX(배너·토스트 등)
- `HomePage`에 남아 있는 레거시 `InviteDialog` 정리 (ADR-0038 소관)

## 대안 (Alternatives)

**인트로를 join 시스템 메시지의 렌더 교체로 처리** (pill → `SystemMessage` 블록) —
문구 중복이 없고 실제 데이터에 근거한다는 점에서 가장 깔끔했다. 버린 이유는 두
가지다. 상대가 아직 수락하지 않은 pending DM에서는 아무것도 뜨지 않고, 대화가 쌓인
뒤에는 블록의 위치가 스트림 도착 순서에 묶여 "본문 가장 처음"을 보장하지 못한다.

**`profile.nick`이 없을 때 `user.name`으로 폴백** (= 헤더와 같은 체인) — 헤더와 문구의
이름이 항상 일치하는 장점이 있지만, 전화번호 유저의 표시명이 `***1234`꼴이라
(ADR-0033 D10) `"***1234님이 채팅방에 입장했습니다."`가 읽히지 않는다. 이름 없는 일반
문구를 택했다.

**홈 목록에서 행마다 `useDmPeer` 호출** — 방 화면과 로직이 완전히 같아지는 이점이
있으나 행 수만큼 프로필 구독이 생긴다. 배치 조회를 택했다.

**프로필 스텝을 "건너뛰기 가능"으로 완화** — 다이얼로그 유지 비용이 남고, 수락 직전에
방해 단계가 하나 있는 상태 자체는 그대로다. 삭제를 택했다.

**ADR-0032를 그대로 두고 DM 이름 변경 금지 유지** — `join.nick` 최우선 요구와 정면
충돌한다. 버렸다.

## 결과 (Consequences)

**얻는 것**

- 같은 DM이 홈과 방에서 다른 이름으로 보이는 어긋남이 사라진다. 표시 이름이 네 화면
  한 체인으로 수렴한다.
- 초대 수락에서 강제 단계가 하나 줄어 이탈 지점이 줄고, **앱 전체의 프로필 강제가
  0이 된다** — 2026-07-28에 시작한 정리의 마무리다.
- 1:1 방 첫 화면이 상대가 누구이고 뭘 하는 곳인지 말해준다. 빈 상태의 침묵도 사라진다.
- kit의 유령 컴포넌트(`SystemMessage`)가 소비처를 얻는다. 신규 kit 컴포넌트는 없다.

**감수하는 트레이드오프**

- **프로필 없는 상대가 늘어난다.** 강제를 없앤 직접적 결과다. 결정 1의 개정으로 `***1234`가
  보이는 일은 없어졌지만, 대신 그 자리에 `channel.name`(서버가 정한 값) 또는 `대화 상대`라는
  일반 라벨이 온다. `join.nick` 쓰기 배선이 되기 전까지 이 상태가 **기본값**이며, 사용자가 직접
  방 이름을 붙이는 것(결정 2)이 현재 유일한 해소 경로다.
- **`channel.name`이 relay DM에 실제로 채워지는지 확인되지 않았다.** 비어 있으면 체인 3단계가
  사실상 죽은 분기이고 프로필 없는 상대는 전부 일반 라벨로 보인다(동작은 정상).
- **i18n `placeProfileCreate.*`(16키)가 죽은 카피가 됐다.** 그 네임스페이스를 읽던 것은 삭제된
  `RelayInviteProfileDialog` 하나뿐이었다(남은 프로필 UI는 `placeProfileEdit.*`를 쓴다). 범위 밖으로
  미룬 "재권유 UX"가 쓸 가능성이 있어 지우지 않고 남겼다.
- 같은 문장이 한 화면에 두 모양(가운데 pill + 왼쪽 블록)으로 나온다.
- DM 방 이름 변경이 다시 열려 ADR-0032가 확보한 "DM 이름 = 항상 상대"의 단순함을
  잃는다. 상대가 프로필 이름을 바꿔도 내가 붙인 이름이 계속 이긴다(의도된 우선순위).
- 홈 목록에 프로필 구독이 하나 늘어난다. DM이 없는 플레이스에서는 빈 배열이라 비용이
  0이지만, DM이 많은 플레이스에서는 목록 렌더가 프로필 도착에 한 번 더 반응한다.
- ADR-0032가 5개 결정 중 2개를 잃어 **Superseded**로 내려간다. 남은 결정(DM 식별,
  `kind='direct'`, 읽음 '1' 뱃지)은 이 ADR이 승계한다.
- 신규 i18n 키 3종 중 이름 없는 변형의 카피는 디자이너 미확인 상태로 시작한다.

## 참고

- [ADR-0032](0032-dm-chat-room-screen.md) — 본 ADR이 대체(결정 3·5 철회)
- [ADR-0033](0033-relay-dm-invite-and-auth-parallel-tracks.md) D10 — 수락 스텝 순서 개정
- [ADR-0020](0020-place-profile-edit-dialog.md) · [ADR-0031](0031-place-settings-hub.md) — 프로필 설정의 잔존 경로
- [ADR-0035](0035-relay-invite-accepted-channel-resolution.md) · [ADR-0037](0037-invite-accept-popup-group-and-dm-variants.md)
- [apps/web/docs/feature/channels/dm-chat.md](../../apps/web/docs/feature/channels/dm-chat.md) — DM 표시 규칙의 피처 문서(결정 1~4)
- [docs/invite-accept-entry.md](../invite-accept-entry.md) · [apps/web/docs/feature/invite/relay-invite-accept.md](../../apps/web/docs/feature/invite/relay-invite-accept.md) — 수락 흐름(결정 5)
- Figma: `3086-14439`(인트로 블록) · `3086-14299` / `3399-26059`(1:1 방 전체) · `3080-12440`(삭제 대상 프로필 화면)
