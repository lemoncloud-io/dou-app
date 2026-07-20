# ADR-0024: 채팅방별 알림 끄기 — join.update notify 연동 (apps/web)

> 상태: Accepted · 결정일: 2026-07-20

관련 ADR:
[[0015-channel-settings-ui-refresh]](./0015-channel-settings-ui-refresh.md) (알림 토글을 UI-only로 최초 도입),
[[0019-group-channel-settings-section-layout]](./0019-group-channel-settings-section-layout.md) (인라인 알림 토글을 그룹방 설정 섹션에 배치),
[[0023-channel-detail-dialogs-figma-redesign.md]](./0023-channel-detail-dialogs-figma-redesign.md) (개인 방 이름 join.nick 도입 — 동일한 join.update 경로)

## 맥락 (Context)

`ChannelSettingsPage`의 "채팅방 알림" 스위치는 [ADR-0015]/[ADR-0019]에서 **UI-only**로 도입됐다.
현재 [ChannelSettingsPage.tsx:37-39](../../apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx)의
`useState(true)`에 묶여 있어 재진입 시 초기화되고 서버에 반영되지 않는다.

`chatic-sockets-api@0.26.703`에서 `join.update`가 `notify` 필드를 받는다
(`JoinNotify = '' | 'all' | 'mention' | 'none'`). 이를 사용해 채팅방별로 알림을 끄고
그 상태를 서버에 영속화하는 것이 이번 작업의 목표다.

조사에서 확인한 현황:

- **데이터 계층은 이미 완비돼 있다.** [`JoinRepositoryV2.updateJoin`](../../libs/data/src/data/repositories-v2/JoinRepositoryV2.ts)이
  `{ channelId, userId, notify }` 입력을 받아 local cache에서 join id를 해석하고, **낙관적 캐시 write + 실패 롤백** 후
  `join.update` 소켓을 호출한다. `DomainJoin`(= `CacheJoinView`)에 `notify` 필드가 이미 있고 `toDomainJoin`이
  그대로 흘려보낸다. [`useJoinMutations.updateJoin`](../../apps/web/src/app/features/channels/hooks/useJoinMutations.ts)도
  이미 노출돼 있다.
- **동일 기능이 `apps/desktop-web`에 구현돼 있다** ([ChannelSettingsPanel.tsx](../../apps/desktop-web/src/app/features/channels/components/ChannelSettingsPanel.tsx)).
  단, 데스크톱은 **앱 내에서 직접 알림을 렌더링**하기 때문에 즉시 gating용 로컬 pref store(`useNotificationPrefsStore`)를 추가로 뒀다.
- **apps/web은 서버 푸시에 의존**한다(device token 등록 → 서버가 push 발송). notify 상태로 알림을 거르는 클라이언트 notifier가 없다.
- 웹 채널 행은 `syncChannels` 델타로 `$join`을 인라인으로 싣는다. 따라서 `channel.$join?.notify`를 초기 상태 소스로 쓸 수 있다
  (이미 `resolveChannelName`이 `channel.$join?.nick`을 읽어 하이드레이션이 검증됨).

## 결정 (Decision)

`ChannelSettingsPage`의 알림 스위치를 실제 `join.update`에 연동한다.

**포함(In-scope)**

- 스위치 초기값을 `channel.$join?.notify`에서 파생한다: `notify === 'none'` → 꺼짐, 그 외(`'all'`/`''`/undefined) → 켜짐.
- 토글 시 [`useJoinMutations.updateJoin`](../../apps/web/src/app/features/channels/hooks/useJoinMutations.ts)을
  `{ channelId, userId, notify: 켬 ? 'all' : 'none' }`로 호출한다. `userId`는 `channel.$join?.userId ?? 세션 userId`.
  (`ChannelUpdateJoinInput`은 `userId`를 타입에 두지 않으므로 데스크톱과 동일하게 캐스팅으로 전달 —
  엔진이 `channelId + userId`로 join 행을 해석한다.)
- **컴포넌트 레벨 낙관적 상태**로 즉시 UI 반영을 처리한다. 실패 시 스위치를 원복하고 destructive toast를 띄운다
  (기존 `handleLeaveRoom`/`handleDeleteRoom` 패턴과 동일).
- 작업 범위는 `apps/web` 한 곳. `libs/data`는 변경하지 않는다.

**제외(Out-of-scope)**

- `notify = 'mention'` — 모바일 토글은 켬/끔 이진(`all`/`none`)만 노출한다.
- 데스크톱식 로컬 pref store(`useNotificationPrefsStore`) — apps/web에는 클라이언트 notifier가 없어 불필요하다.
- 서버 푸시 gating 로직(백엔드가 `join.notify`를 존중해 push를 거른다는 전제).
- 셀프 채팅(self) 토글 — 알림 토글은 이미 비-self 채널에서만 렌더된다.

## 대안 (Alternatives)

- **로컬 pref store 추가(데스크톱 미러링)** — apps/web은 자체 알림을 그리지 않아 즉시 gating 대상이 없다.
  서버(`join.notify`)만 신뢰하면 되므로 store는 과설계. 기각.
- **`channel.$join?.notify`만으로 즉시 반영** — `updateJoin`의 낙관적 write는 **join 캐시**에 쓰지
  채널 행의 임베디드 `$join`을 갱신하지 않으므로, 토글 직후 `useChannel`이 보는 값이 즉시 바뀌지 않는다.
  → 컴포넌트 낙관적 상태로 보완하기로 함.
- **`libs/data`에 notify 전용 경로 신설** — 기존 `updateJoin`이 이미 nick/notify를 모두 처리한다. 중복이라 기각.

## 결과 (Consequences)

- 얻는 것: 채팅방별 알림 끄기가 서버에 영속화되고 재진입·기기 간에 유지된다. 데이터 계층 변경 없이 최소 표면적으로 구현된다.
- 트레이드오프:
    - 초기 상태 정확도는 `channel.$join` 하이드레이션 시점에 의존한다. `$join`이 아직 안 실린 채널은 기본 "켬"으로 보이며,
      싱크 후 실제 값으로 정정된다.
    - 실제 알림 억제는 서버가 `join.notify`를 존중하는지에 달려 있다. 프론트는 상태 저장까지만 책임진다.
    - [ADR-0015]의 "알림 토글은 UI-only" 서술은 본 ADR로 대체된다(해당 결정 항목에 한해).
