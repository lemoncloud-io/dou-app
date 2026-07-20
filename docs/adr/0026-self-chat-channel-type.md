# ADR-0026: 나와의 채팅(self) 채널 유형 web 반영

> 상태: Accepted · 결정일: 2026-07-20

## 맥락 (Context)

`apps/web`의 채널 피처는 `stereo === 'self'`로 "나와의 채팅"을 이미 부분적으로 처리하고 있으나, 최근 Figma 리디자인(채널 룸 개선, ADR-0021 후속)에 맞춰 self 유형을 정리해야 한다. 조사에서 드러난 현황과 요구사항은 다음과 같다.

**이미 있는 것**

- self 판별: `useChannel.ts:13` — `isSelfChat = stereo === 'self'`
- 룸 읽음표시 숨김: `ChannelRoomPage.tsx:85` — `showReadReceipt = !isSelfChat && activeCount >= 2`
- 룸 헤더 `kind='direct'`, self 빈 상태(펜 아이콘 + 안내문), 초대 다이얼로그 미노출
- join.nick 저장 하위 파이프라인 완비 — 게이트웨이 `join.update`(body `{ id, nick?, notify?, role? }`), `JoinRepositoryV2.updateJoin`(`repositories-v2/JoinRepositoryV2.ts:125`, nick 처리 + channelId/userId로 composite id resolve), `useRuntimeRepositories().join`으로 노출

**어긋난 것 / 없는 것**

1. self 판별 기준 불일치 — 홈 목록은 `ChannelList.tsx:44`에서 `memberNo === 1`로 판별(channels 피처는 `stereo === 'self'`).
2. 룸 헤더가 self일 때 `channel.name`을 무시하고 고정 라벨 `channelList.selfChannel`을 표시(`ChannelRoomPage.tsx:349`) → 이름을 바꿔도 헤더에 안 보임.
3. self 채널 이름 수정이 설정에서 막혀 있음(`ChannelSettingsPage.tsx:145-146` — 이름 행 클릭 비활성).
4. web `useChannelMutations`는 `join` repository를 꺼내지 않음 → join.nick을 쓰는 앱-레벨 뮤테이션이 없음(desktop-web은 `setChannelNotify`가 `joinRepository.updateJoin` 사용).
5. `$join.nick`을 읽거나 쓰는 코드가 전무.

**Figma 참조 (DoU / node)**

- 룸 빈 상태 `3185-13109`, 룸 메시지 `3186-13530`, 방 정보(설정) `3185-13278`, 이름 수정 인풋 케이스 `3165-26764`, 홈 목록 아이템 `3209-14565`

## 결정 (Decision)

### 포함 (In scope)

1. **self 판별을 `stereo === 'self'`로 통일.** 홈 `ChannelList`의 `memberNo === 1` 판별을 제거하고 `stereo === 'self'`로 교체한다. (self 표시/배지/멤버수 pill 로직도 이 기준을 따른다.)

2. **self 채널 이름은 `$join.nick`으로 저장/표시** (채널의 `name`이 아님).
    - 저장: `join.update`(`JoinUpdateRequestBody.nick`) 경로 사용. web는 ADR-0025에서 도입된 `useJoinMutations().updateJoin({ channelId, userId, nick })`를 그대로 재사용한다(알림 토글과 동일 훅). `userId`는 `channel.$join?.userId`(없으면 세션 uid)에서 취득.
    - 표시(룸 헤더 · 홈 목록 · 설정 이름 행): **`$join.nick || site 프로필 nick`**. 커스텀 nick이 있으면 그것을, 없으면 **활성 site 프로필의 이름**(`useMyProfile().profile?.nick`)을 fallback으로 쓴다. 계정(user 레코드) name은 raw id/UUID일 수 있어 쓰지 않는다. 그래도 없으면 `channelList.selfChannel` 라벨. 홈 목록은 self일 때 `MY` 배지 + 이 제목으로 노출한다(`3209-14565`).

3. **self 이름 수정 진입점 = 설정 상단 이름 행.** `ChannelSettingsPage`에서 self여도 이름 행을 클릭 가능하게 열고, 이름 수정 UI를 띄운다. 입력 스펙(`3165-26764`): 이름 전용, 최대 20자, 글자 카운터(예 `8/20`), placeholder `Self Chat`, 헬퍼 "20글자 이내로 입력해 주세요". self는 썸네일 편집을 노출하지 않는다(그룹의 `UpdateChannelDialog`와 달리 name-only). 저장은 2번의 join.nick 경로로 연결한다.

4. **읽음 숫자 미노출 유지.** self 룸에서는 메시지별 안 읽은 사람 수(ReadReceipt)를 표시하지 않는다(이미 구현됨, `ChannelRoomPage.tsx:85`). 시간 옆 카운트/`all_done` 등 읽음 관련 요소 모두 숨김(Figma에서 hidden).

5. **Figma UI 반영.** 룸(빈 상태/메시지) · 방 정보(설정) · 이름 수정 · 홈 아이템 4(+1) 화면을 `@libs/web-ui-kit` 컴포넌트로 맞춘다. 설정 화면(`3185-13278`)은 self일 때 "방 친구"(소유자 1명)만 노출하고 알림/멤버 추가/나가기 섹션은 숨긴다. 룸 ⋯ 메뉴는 "방 정보"(설정) 단일 항목.

6. **컴포넌트는 `@libs/web-ui-kit` 기반.** 누락 시 해당 라이브러리에 정의 후 사용. 아이콘은 `resources/icons`의 시맨틱 별칭을 사용하고, 커스텀 글리프가 필요하면 그쪽에 추가한다.

### 제외 (Out of scope)

- **self 채널 생성 경로.** web에는 현재 self 채널을 만드는 UI/로직이 없다(생성 시 `stereo: 'private'`만). self 채널은 서버 측에서 이미 존재한다고 가정하고, 이번엔 읽기/이름수정/사용만 다룬다.
- desktop-web 반영(이번 작업은 `apps/web`에 한정).
- 홈 안읽음 배지 로직 변경 — self는 자연히 unread가 쌓이지 않으므로 별도 처리하지 않는다.

## 대안 (Alternatives)

- **이름을 `channel.name`에 저장** (그룹과 동일 경로): 기각. 사용자 지정에 따라 self 이름은 join별 nick(`join.update`)으로 관리하며, 하위 파이프라인도 이미 nick 기준으로 완비돼 있다.
- **판별을 `memberNo === 1`로 유지/통일**: 기각. member 수는 상태에 따라 흔들릴 수 있고 요구사항이 "stereo의 self"로 명시. `stereo === 'self'`가 안정적 단일 기준.
- **이름 수정 진입을 룸 ⋯ 메뉴에 별도 항목으로 추가**: 기각. 그룹 설정과 일관되게 설정 상단 이름 행을 진입점으로 통일(Figma 설정 화면에 이름 행이 없더라도 진입점 일관성을 우선).
- **그룹 `UpdateChannelDialog`를 그대로 재사용**: 부분 기각. 저장 경로(join.nick)와 레이아웃(name-only + 카운터, 썸네일 없음)이 달라, self용 분기/전용 편집 UI가 필요하다(구체 구조는 스펙 단계에서 확정).

## 결과 (Consequences)

- **얻는 것**: self 판별이 단일 기준(`stereo === 'self'`)으로 정리되어 홈/룸/설정 간 표시 불일치가 사라진다. 이름 수정이 join.nick 경로로 동작해 헤더·목록·설정에 일관 반영되고, Figma 리디자인이 web-ui-kit 컴포넌트로 반영된다.
- **트레이드오프 / 후속**:
    - join.nick 쓰기는 기존 `useJoinMutations`(ADR-0025)를 재사용한다 — 별도 뮤테이션을 새로 만들지 않는다.
    - self 이름 편집 경로가 그룹(채널명)과 달라(부분) 편집 UI가 분기된다 — 유지보수 시 두 경로를 인지해야 한다.
    - fallback은 **site 프로필 nick**(`useMyProfile`)으로 확정했다 — 계정 user name(raw id/UUID 가능)은 쓰지 않는다.
    - web-ui-kit `TextField`에 글자 카운터/헬퍼 어포던스가 없으면 라이브러리에 보강이 필요할 수 있다.
- 다음 단계: 이 ADR을 입력으로 dev-2_implement의 스펙 작성(Phase A)으로 넘어간다.
