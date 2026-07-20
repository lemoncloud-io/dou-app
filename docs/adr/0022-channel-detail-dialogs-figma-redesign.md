# ADR-0022: 채널 상세 팝업(방 정보·멤버 프로필) Figma 재디자인 + 개인 방 이름(join.nick) 도입

> 상태: Accepted · 결정일: 2026-07-20

관련 ADR:
[[0014-home-screen-figma-visual-refinement]](./0014-home-screen-figma-visual-refinement.md) (멤버 닉네임 편집 out-of-scope 입장 → 본 ADR로 일부 전환),
[[0015-channel-settings-ui-refresh]](./0015-channel-settings-ui-refresh.md) · [[0019-group-channel-settings-section-layout]](./0019-group-channel-settings-section-layout.md) (채널 설정 화면 베이스),
[[0020-place-profile-edit-dialog]](./0020-place-profile-edit-dialog.md) (프로필 설정 편집기 재사용 대상),
[[0021-channel-room-figma-refinement]](./0021-channel-room-figma-refinement.md) (채널 룸 Figma 반영 선행 작업)

## 맥락 (Context)

`apps/web/src/app/features/channels`의 **채널 설정 화면에서 열리는 두 팝업**을 개정 Figma에 맞춰 다듬는다.
컴포넌트는 `@chatic/web-ui-kit` 우선, 누락 프리미티브는 kit에 정의 후 사용, Figma 전용 아이콘은 리소스를 따온다.

대상 화면(2종·5개 노드):

1. **방 정보 팝업** — `UpdateChannelDialog`
    - 소유자 [3164-14803](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3164-14803&m=dev)
    - 초대받은자 [3164-14836](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3164-14836&m=dev)
2. **멤버(친구) 프로필 팝업** — `MemberProfileDialog` (채널 설정 멤버 리스트 아이템 클릭 시)
    - 소유자(뷰어) [3177-13100](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3177-13100&m=dev)
    - 초대받은자(뷰어) [3177-13312](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3177-13312&m=dev)
    - 내 프로필 [3186-24788](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3186-24788&m=dev)

### 현재 코드 상태 (조사)

- **방 정보** `UpdateChannelDialog` ([apps/web/.../components/UpdateChannelDialog.tsx](../../apps/web/src/app/features/channels/components/UpdateChannelDialog.tsx))
    - 비소유자는 `readOnly` prop으로 **전부 읽기전용**(사진 피커·저장 버튼 숨김). 이름 필드도 읽기전용.
    - 저장 경로는 소유자만: `useChannelMutations().updateChannel({ name, thumbnail })`. 글자수 카운터 없음. hex(`#B0EA10`) 직접 사용.
- **멤버 프로필** `MemberProfileDialog` ([apps/web/.../components/MemberProfileDialog.tsx](../../apps/web/src/app/features/channels/components/MemberProfileDialog.tsx))
    - 상단 뒤로가기 + `⋯` **드롭다운 메뉴**(신고 + 내보내기). 이름 읽기전용. 주석에 "nickname editing is out of scope (ADR-0014)".
    - 내보내기(kick)는 소유자 뷰어 한정: `leaveChannel({ channelId, userId })`.
- **표시 배선** `useChannel` ([apps/web/.../hooks/useChannel.ts](../../apps/web/src/app/features/channels/hooks/useChannel.ts))은 방 이름을 `channel.name`에서 **직접** 노출하며, join.nick 병합 로직이 없다.

### 백엔드 능력 (조사)

- `JoinRepositoryV2.updateJoin` ([libs/data/.../JoinRepositoryV2.ts:125](../../libs/data/src/data/repositories-v2/JoinRepositoryV2.ts))이 `join.update` 액션을 감싼다.
  입력은 `{ channelId?, userId?, id?, nick?, notify? }` — **`nick`(텍스트)과 `notify`만** 반영하며 **thumbnail 필드는 없다**.
  명시 id가 없으면 local cache에서 `channelId + userId`로 join을 해석한다. 단, 이 메서드를 감싸는 앱 훅은 아직 없다.
- 프로필 편집기 `PlaceProfileFormDialog`/`PlaceProfileEditDialog`([apps/web/.../home/components](../../apps/web/src/app/features/home/components/PlaceProfileFormDialog.tsx))가
  ADR-0020으로 이미 신 디자인·kit 기반으로 완성돼 있다(`ProfileAvatar/TextField/ModalTopBar/FloatingButton/Toast/AlertDialog`).

### Figma에서 확정한 시각 스펙

- **방 정보(소유자)** — 타이틀 "방 이름을 설정할 수 있어요". 아바타 **편집 가능**(카메라/＋ 배지). 이름 입력 + 글자수 카운터 `0/20` + 힌트 "20글자 이내로 입력해 주세요."
- **방 정보(초대받은자)** — 동일 타이틀 + **서브타이틀 "설정한 방 이름은 나에게만 표시됩니다."**. 아바타 **읽기전용**(소유자 썸네일 노출, 하단 캡션 `<소유자가 설정한 방 이름>`). 이름 입력은 **편집 가능**(placeholder `<소유자가 설정한 방 이름으로 노출>`) → 내 개인 방 이름.
- **멤버 프로필** — `⋯` 드롭다운이 아니라 **상단 X + 아바타 + 이름 아래 인라인 리스트** 풀팝업. 프레임명 `#소유자`/`#초대받은자`는 **뷰어(나)의 역할**을 뜻한다.
    - 뷰어=소유자: `친구 설정` · `내보내기` · `신고`
    - 뷰어=초대받은자: `신고`
    - 내 프로필: `프로필 설정`
    - (리스트는 범용 "채팅 리스트" 컴포넌트 재사용이라 `친구 설정`/`신고`의 목적지·동작은 Figma에 정의돼 있지 않음)

## 결정 (Decision)

개정 Figma를 **web-ui-kit 우선**으로 반영한다. ADR-0015/0019의 데이터 흐름·멤버 소스·kick/leave/delete 경로를 계승하고,
프레젠테이션과 편집 능력만 바꾼다. hex·아이콘을 화면에 직접 박지 않고, 누락 프리미티브는 kit에 정의한다.

### 1. 방 정보 팝업 — 소유자/초대받은자 2모드로 재구성

기존 `readOnly` 단일 분기를 **역할별 2모드**로 바꾼다.

- **소유자 모드**: 아바타 편집 + 이름 편집 → `updateChannel({ name, thumbnail })`(현행 경로 유지). 글자수 카운터/힌트 추가.
- **초대받은자 모드**: 서브타이틀 노출, **아바타 읽기전용**(소유자 썸네일 + 캡션), **이름 편집 → 신규 `updateJoin({ channelId, nick })`**. thumbnail 미노출(백엔드 미지원과 일치).
- 초기값: 초대받은자의 이름 필드는 현재 내 join.nick(있으면) 프리필, placeholder는 소유자 방 이름.

### 2. 개인 방 이름(join.nick) 클라이언트 병합 배선

초대받은자가 저장한 `join.nick`이 **방 이름 표시에 반영**되도록 클라이언트에서 병합한다.
표시부(방 이름 노출 지점: 채널 설정 헤더 행, 홈 채널 리스트, 룸 헤더 등 해당되는 곳)에서 **내 join.nick을 `channel.name`보다 우선**한다.
병합 지점은 파생 계층(예: `useChannel`/뷰모델 또는 채널명 셀렉터)에 두어 소비처가 중복 처리하지 않게 한다.

### 3. 멤버 프로필 팝업 — 인라인 리스트 풀팝업 + 뷰어 역할 분기

`⋯` 드롭다운을 제거하고 **상단 X + 아바타 + 이름 + 인라인 리스트** 레이아웃으로 교체한다. 항목은 뷰어 역할로 분기:

- 뷰어=소유자, 대상=타 멤버: `친구 설정`(보류) · `내보내기`(`leaveChannel({channelId,userId})`, 현행) · `신고`(UI-only)
- 뷰어=초대받은자: `신고`(UI-only)
- 대상=나: `프로필 설정` 1개

### 4. `친구 설정`·`신고` = UI-only 보류

- **`신고`**: 현행대로 미구현 — 행은 노출, 클릭 시 toast만(백엔드 미배선).
- **`친구 설정`**: **보류 유지**(행 노출 + comingSoon toast). 후속 논의(2026-07-20)에서 디자인이 확정됨 —
  소유자가 친구에게 **"나에게만 표시되는" 이름**을 붙이는 화면([Figma 2970-13653](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2970-13653&m=dev) /
  [2970-12918](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2970-12918&m=dev), 방 정보 초대받은자 화면과 동일 레이아웃).
  **블로커**: per-viewer 별칭을 담을 백엔드 필드가 없다 — `JoinModel.nick`은 그 멤버의 개인 방 이름(공유 join),
  `profile.set(target)`은 그 멤버의 전역 프로필이라 둘 다 "나에게만"과 어긋난다. 멤버 이름 표시도 `profile.nick`에서
  해석된다([useChannelProfiles](../../apps/web/src/app/features/channels/hooks/useChannelProfiles.ts)). 사용자 결정으로
  **백엔드 per-viewer 별칭 저장(또는 기기 로컬 저장) 준비 후 별도 작업**으로 미룬다.

### 5. `프로필 설정` → 기존 `PlaceProfileEditDialog` 재사용

내 프로필 뷰의 `프로필 설정` 클릭 시 **ADR-0020의 `PlaceProfileEditDialog`를 그대로 연다**(per-place 프로필 닉+사진, `setMyProfile`). 채널 전용 편집기를 새로 만들지 않는다.

### 범위 (포함/제외)

- **포함**: 위 1~5, Figma 전용 아이콘 kit 반입, 누락 프리미티브 kit 정의, `updateJoin`을 감싸는 앱 훅 신규(`useChannelMutations` 확장 또는 `useJoinMutations` 신설), 관련 i18n 키·테스트 정리.
- **제외**:
    - 채널 알림(notify) 토글 실제 배선 — `join.update.notify`로 가능하나 **별건**(현행 UI-only 유지, ADR-0015/0019 계승).
    - `신고` 백엔드, `친구 설정` 실제 동작.
    - 데이터 흐름·멤버 소스·kick/leave/delete·sync 등록 모델 변경.

## 대안 (Alternatives)

- **초대받은자를 계속 전부 읽기전용 유지** — 변경 최소. 그러나 Figma가 초대받은자 이름 입력을 명시하고 `join.update.nick`이 존재하므로 기각.
- **`친구 설정`을 개인 별칭으로 즉시 구현** — 방 이름 "나에게만 표시" 패턴과 대칭적이나, 소유자 전용 배치와 모순되고 "누구에게 보이는가" 의미가 미정. 사용자 확정으로 보류.
- **`친구 설정` 행 자체를 숨김** — 디자인 반영 취지에서 행은 노출하는 편이 Figma에 충실. 사용자 확정으로 "보류(노출+no-op)" 채택.
- **채널 전용 프로필 편집기 신설** — ADR-0020 편집기와 쌍둥이 중복. 재사용으로 기각.
- **join.nick 표시를 후속으로 분리(저장만 구현)** — nick을 저장해도 어디에도 안 보이면 기능이 무의미. 표시 배선까지 포함으로 확정.

## 결과 (Consequences)

- **ADR-0014의 "멤버 닉네임 편집 out-of-scope" 입장이 일부 전환된다.** 초대받은자가 `join.update.nick`으로 자기 개인 방 이름을 갖게 되며, `MemberProfileDialog`의 관련 주석/전제도 갱신 대상이다(멤버 프로필 이름 자체는 여전히 읽기전용, 방 이름만 개인화).
- **`join.nick` 병합은 표시 전역에 영향.** 방 이름을 노출하는 모든 소비처가 일관되게 개인 이름을 보여줘야 하므로 병합은 파생 계층에 두고, 채널명 노출 지점을 점검해야 한다.
- **신규 앱 훅 필요.** `updateJoin`을 감싸는 훅이 없으므로 추가한다. optimistic write는 `JoinRepositoryV2`가 이미 처리한다.
- **`친구 설정`·`신고`는 시각만 반영.** 두 항목은 노출되지만 동작하지 않는다 — QA/사용자에게 "미구현 노출"임을 명확히 해 오해를 막는다.
- **notify 토글은 그대로 UI-only.** `join.update.notify`로 배선 가능해졌지만 이번 범위 밖이며, 후속 작업 후보로 남는다.
- **kit 우선.** 방 정보/멤버 프로필의 아바타·입력·리스트·상단바를 kit 프리미티브(`ProfileAvatar/TextField/ModalTopBar/ListRow` 등)로 정리하고, 누락 시 kit에 정의해 hex/아이콘 직접 인라인을 제거한다.

## 다음 단계

이 ADR을 입력으로 [[dev-2_implement]]의 스펙 작성(Phase A)으로 넘어간다. 전 항목 착수 가능(미해결 없음).
