# ADR-0040: 나와의 채팅(self) 표시 이름 확정과 프로필 미설정 유도

> 상태: Accepted · 결정일: 2026-08-03
>
> ⚠️ **병렬 세션 있음.** 같은 날 [ADR-0041](0041-place-profile-as-invite-precondition.md)이 초대 경로의
> 프로필 생성을 결정했고, 본 ADR의 결정 6(`PlaceProfileCreateDialog`)·결정 7(`resolvePlaceDisplayName`)을
> **소비한다.** 반대로 본 ADR의 결정 4·5가 쓰는 `PlaceProfileForm`은 ADR-0041이 수정한다.
> 시그니처·파일 소유권·착수 순서는
> [docs/plans/place-profile-create-shared-contract.md](../plans/place-profile-create-shared-contract.md)가
> 정본이다. **구현 착수 전에 읽는다.**

## 맥락 (Context)

요청은 "HomePage·ChannelRoomPage의 나와의 채팅 개선"이었고 대상을 `stereo == 'dm'`으로
적었다. 조사 결과 **대상은 `stereo === 'self'`다.**

`ChannelStereo`는 `'' | 'public' | 'private' | 'dm' | 'self'`이고
(`@lemoncloud/chatic-socials-api`), 이 앱에서 두 값은 다른 것이다.

|           | `'self'`                                                                                                                                    | `'dm'`                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 뜻        | 나와의 채팅 (멤버 = 나 혼자)                                                                                                                | 1:1 (상대가 있음)                                                                                                                                  |
| 제목 체인 | join.nick → **내** profile.nick → `나와의 채팅` ([selfChatTitle.ts:16](../../apps/web/src/app/features/channels/utils/selfChatTitle.ts:16)) | join.nick → **상대** profile.nick → channel.name → `대화 상대` ([dmTitle.ts](../../apps/web/src/app/features/channels/utils/dmTitle.ts), ADR-0039) |

`self`로 읽은 근거는 둘이다. (1) 첨부된 Figma 4장이 모두 self 화면이다 — 제목이
`Self Chat`, 방 친구가 `MY` 한 줄, 알림·나가기 섹션이 없다. 이는 정확히 현재
[`ChannelSettingsPage`의 `isSelfChat` 분기](../../apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:253)가
내는 화면이다. (2) 요청이 적은 체인(`join.nick → profile.nick → 라벨`)이 self의 체인
그대로이고, dm의 체인이 아니다.

### 요청의 절반은 이미 구현돼 있다

- **표시 이름 체인** — `resolveChannelTitle`이 HomePage(`ChannelList`)·`ChannelRoomPage`·방
  설정·채팅방 관리 **네 화면 공용**이고, self 분기가 요청한 체인 그대로다 (ADR-0039 결정 1).
- **별명(join.nick) 설정** — `JoinNickDialog variant='self'`. Figma `3451-21323`의 "이름
  placeholder = 소유자 이름"까지
  [`fallbackName ?? profile?.nick`](../../apps/web/src/app/features/channels/components/JoinNickDialog.tsx:63)으로
  들어가 있다.
- **프로필 설정 완료 후 프로필 노출** (Figma `3451-21413`) — profile.nick이 있으면 현재
  코드가 그 화면을 그대로 낸다.

### 실제로 비어 있는 것 셋

1. **방 설정 방 친구의 내 행이 사람 이름이 아닌 값을 노출한다.**
   [`memberName = memberProfile?.nick || member.name || memberId`](../../apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:210)이라
   profile.nick이 없으면 `member.name`(전화번호 유저는 `***<뒷4자리>`, ADR-0033 D10) 또는
   raw UUID가 뜬다. **ADR-0039가 "`\***1234`는 읽히지 않는다"며 표시 이름 체인에서 배제한
   값이 이 경로로 새고 있다.\*\*
2. **홈 플레이스의 이름이 원문으로 박힌다.** `useActivePlaceName()`이 `place.name`을
   무가공으로 돌려주므로, Figma `3026-11374`의 `<플레이스>에 사용할 내 프로필을...` 자리에
   백엔드 값 `default`/`#default`가 그대로 들어간다.
3. **en 라벨이 어긋난다.** `channelList.selfChannel`이 ko `나와의 채팅` / en **`My Chat`**인데
   Figma와 요청은 `Self Chat`이다.

### 재료가 이미 보존돼 있다

ADR-0039는 프로필 강제를 앱 전체에서 0으로 만들면서 `RelayInviteProfileDialog`를 삭제했고,
그 카피 `placeProfileCreate.*`(16키)를 **"범위 밖으로 미룬 재권유 UX가 쓸 가능성이 있어
지우지 않고 남겼다"**고 기록했다. `PlaceProfileForm`의 `subtitle` prop도
`"Omitted in the edit flow"`라는 주석과 함께 소비처 없이 남아 있다. 이번 화면이 그 재권유
UX이며, 두 재료가 그대로 들어맞는다.

### 홈 플레이스 판정 신호가 갈려 있다

- 현재 코드: `selectedCloudId === 'default'` (클라우드 문맥). `HomePage`·`PlaceList`·
  `useHomePlaces`·`useHomeChannels`·`useActiveCloudChannels` 등이 이 신호를 쓴다.
  [PlaceItem.tsx:19-21](../../apps/web/src/app/features/home/components/PlaceItem.tsx:19) 주석이
  "레거시 `place.id === 'default'`는 실제 relay place에 절대 매치되지 않으므로 클라우드
  문맥이 신뢰 가능한 신호"라고 명시한다.
- 요청: `placeId === '0000'`. 이 값이 실제 sid인 증거는 있다
  ([place-settings.md](../../apps/web/docs/feature/place/place-settings.md) 의
  `localStorage['chatic-channel-sort'] === {"0000":"unread"}`).
- 라벨도 갈렸다: `placeList.defaultPlace` = ko/en 모두 `DoU Home`,
  `cloudSessionSheet.douHome` = ko `두유 홈` / en `DoU Home`.

## 결정 (Decision)

### 1. 대상은 `stereo === 'self'`. dm/group의 표시 규칙은 손대지 않는다

ADR-0039가 dm 체인을 확정한 지 사흘이다. 다시 열지 않는다.

### 2. 표시 이름 체인은 신규 로직 없이 확정하고, 회귀만 막는다

체인은 **join.nick(raw-id 거부) → 내 profile.nick → `나와의 채팅`/`Self Chat`**이며
네 화면이 `resolveChannelTitle` 하나를 공유하는 현 구조를 유지한다. 새로 쓰는 것은
HomePage·ChannelRoomPage의 회귀 테스트다.

**단, 레거시 중복 리졸버는 제거한다.**
[`utils/channel.ts`의 `resolveChannelName`](../../apps/web/src/app/utils/channel.ts)은
`$join.nick → channel.name`뿐이어서 **raw-UUID 가드도 stereo 분기도 없고**,
[`useChannel`이 이것을 `ClientChannelView.displayName`으로 노출한다](../../apps/web/src/app/features/channels/hooks/useChannel.ts:17).
같은 채널이 `roomTitle`은 옳고 `displayName`은 UUID인 상태가 남아 있으면 체인 통일이
언제든 되살아나 깨진다. 소비처를 확인해 `resolveChannelTitle`로 옮기고 둘 다 지운다.

### 3. en 라벨을 `Self Chat`으로 바꾼다

`channelList.selfChannel`: ko `나와의 채팅` 유지, en `My Chat` → `Self Chat`.

### 4. 방 친구의 **내 행**: profile.nick이 없으면 `프로필 설정 필요`

- 밑줄 표기, `MY` 뱃지 뒤 (Figma `3185-13278`).
- **내 행에서 `member.name`·`memberId` 폴백을 제거한다.** profile.nick이 없으면 사람 이름은
  없는 것이고, `***1234`/UUID를 대신 보여주는 것은 ADR-0039가 이미 기각한 선택이다.
- **`stereo`로 게이팅하지 않는다** — 멤버 리스트는 self/dm/group 공용 매핑이고, 새는 값도
  세 곳에서 같이 샌다. 조건을 끼워 self만 고치면 공용 코드에 분기가 늘면서 알려진 노출을
  dm/group에 남기게 된다. Figma가 self 화면만 보여준 것은 dm/group을 금지한 것이 아니다.
- **남의 행은 불변** — 남의 프로필 미설정은 내가 해결할 수 없으므로 유도 문구를 붙일 수 없다.

### 5. 내 행 클릭은 조건 분기

- profile.nick **없음** → 프로필 생성 다이얼로그로 **직행** (탭 한 번).
- profile.nick **있음** → 기존 `MemberProfileDialog`(프로필 → `프로필 설정`) 유지.

Figma도 이에 맞는다 — `3185-13278`의 내 행에는 chevron이 있고 `3451-21413`에는 없다.

### 6. `PlaceProfileCreateDialog` 신설 — `placeProfileCreate.*` 소비 부활

`PlaceProfileFormDialog`를 감싸는 순수 래퍼다. `PlaceProfileForm`·`PlaceProfileFormDialog`는
건드리지 않는다(`subtitle`이 이미 있다). 카피 2건만 고친다.

- `placeProfileCreate.title` — Figma가 `<플레이스>에 사용할 **내** 프로필을 만들어 주세요`로
  "내"를 넣었다. 반영한다.
- `placeProfileCreate.exitDescription` — 현재 `"이름을 설정해야 DoU를 시작할 수 있어요!"`.
  **ADR-0039로 프로필 강제가 0이 된 뒤 이 문장은 거짓이다.** 중단해도 앱은 쓸 수 있으므로
  `placeProfileEdit`의 중단 문구와 같은 성격으로 다시 쓴다.

### 7. 홈 플레이스 표시 이름: 공용 헬퍼 + ko `두유 홈`

- `resolvePlaceDisplayName`(순수 함수)을 신설하고 `PlaceItem`·`DouHomeItem`·
  `useActivePlaceName`이 공유한다. 이 이름이 프로필 다이얼로그 제목으로 들어가므로
  `default` 원문 노출이 사라진다.
- 판정은 **기존 `isDefaultCloud`(`selectedCloudId === 'default'`)를 1차 신호**로 쓰고,
  `sid === '0000'`을 **보조로 함께 인정**한다(OR). 이미 다섯 곳이 클라우드 신호를 쓰고 있어
  그것이 정본이고, 요청의 `'0000'`도 실제 sid라는 증거가 있으므로 버리지 않는다.
- 라벨은 **ko `두유 홈` / en `DoU Home`**으로 통일한다. `placeList.defaultPlace`의 ko를
  `DoU Home` → `두유 홈`으로 바꿔 `cloudSessionSheet.douHome`과 일치시킨다.

### 범위 밖 (Out of scope)

- dm/group의 **표시 이름** 규칙 (결정 4의 멤버 행 수정은 전 stereo 적용, 제목 체인은 self만)
- 홈 목록 채널 행에서의 프로필 유도 — Figma가 없어 카피·모양을 새로 정해야 한다
- `desktop-web`의 `ChannelSettingsPanel`(stereo 분기 자체가 없는 다른 화면)
- 백엔드 신규 요청, 알림·정렬 설정
- 사용되지 않는 `profile.nickname*` 레거시 i18n 블록 정리

## 대안 (Alternatives)

**`sid === '0000'` 리터럴 단독 판정** — 요청 문자 그대로이고 헬퍼 내부가 한 줄로 줄어든다.
버린 이유는 이미 다섯 개 훅이 클라우드 신호를 정본으로 쓰고 있어 판정이 두 갈래로 남는
것이고, relay 이외 클라우드에 `'0000'` sid가 생기면 오탐이 된다. 반대로 클라우드 신호만
쓰는 것도 버렸다 — 요청이 sid를 지목했고 그 값이 실재하므로 헬퍼가 둘 다 받는 편이 안전하다.
단일 신호로 줄이는 것은 relay place의 sid 불변성이 확인된 뒤로 미룬다.

**기존 `PlaceProfileEditDialog` 재사용** — 신규 코드가 0이고 이미 방 설정에 마운트돼 있다.
버린 이유는 제목이 `플레이스 프로필`이고 subtitle이 없어 Figma `3026-11374`와 다르다는 것.
프로필이 **없는** 사람에게 말을 거는 자리이므로 "만들어 주세요" 쪽 카피가 맞고, 그 카피는
이미 `placeProfileCreate.*`에 있다.

**채널명 행에 `프로필 설정 필요` 표기** — 요청 문장("방설정에서 ... 문구가 추가")만 보면
가능한 읽기였다. Figma는 채널명 행에 `Self Chat`을 유지하고 방 친구 행에만 문구를 넣었다.
채널명은 profile.nick이 없어도 유효한 라벨을 갖기 때문에 유도 지점이 아니다.

**모든 멤버 행에 적용** — 남의 프로필 미설정에는 클릭 목적지가 없다. 버렸다.

**항상 생성 다이얼로그 직행** — `MemberProfileDialog`의 `프로필 설정` 경로가 죽고, 프로필이
정상인 상태에서 프로필 조회 대신 편집 화면이 먼저 뜬다.

**`resolveChannelName` 레거시를 그대로 두기** — 이번 스펙과 무관하다는 점에서 미룰 수
있었다. 하지만 그것이 살아 있는 동안은 "체인은 하나"가 사실이 아니고, 결정 2가 확정하려는
것이 바로 그 문장이다.

## 결과 (Consequences)

**얻는 것**

- `***1234`/raw UUID가 사람 이름 자리에 노출되는 마지막 경로가 막힌다 — ADR-0039가 세운
  원칙이 멤버 리스트까지 적용된다. self뿐 아니라 dm·group에서 함께 고쳐진다.
- 프로필 미설정자에게 앱 안의 유도 지점이 처음 생긴다. ADR-0039가 강제를 0으로 만들며
  "범위 밖"으로 미뤄둔 재권유 UX의 첫 구현이다.
- 홈 플레이스 이름의 판정과 라벨이 헬퍼 하나로 수렴하고, 프로필 다이얼로그 제목의
  `default` 원문 노출이 사라진다.
- `placeProfileCreate.*` 16키와 `PlaceProfileForm.subtitle`이 소비처를 얻는다. 신규 폼·kit
  컴포넌트는 0이다.
- 표시 이름 리졸버가 하나만 남는다.

**감수하는 트레이드오프**

- `placeList.defaultPlace`의 ko를 바꾸면서 **홈 플레이스 목록 표기도 `DoU Home` → `두유 홈`으로
  함께 바뀐다.** 이번 스펙 밖 화면이지만, 두 라벨을 갈라둔 채로는 통일한 의미가 없다.
- 내 행에서 이름 폴백을 없앴으므로, 프로필을 만들지 않는 동안 내 이름 자리는 계속 유도
  문구다. 이름을 보고 싶으면 프로필을 만들어야 한다 — 의도된 압력이지만 강제는 아니다.
- 홈 플레이스 판정이 OR로 남아 헬퍼 안에 신호 둘이 공존한다. 완전한 단일화는 후속이다.
- 내 행 클릭이 두 갈래가 되어 방 설정에 조건 분기가 하나 늘고, 테스트가 두 경로를 모두
  덮어야 한다.
- 결정 4를 전 stereo에 적용하므로 **dm·group 방 설정의 내 행 표시도 바뀐다.** Figma 확인이
  없는 화면에 변경이 내려간다 — 다만 바뀌는 방향은 "읽을 수 없는 값 → 행동 가능한 문구"다.
- `resolveChannelName`/`displayName` 제거는 소비처 조사가 선행되어야 하며, 이번 작업 중
  가장 넓게 번질 수 있는 변경이다.

## 참고

- [ADR-0039](0039-dm-display-name-chain-and-invite-profile-release.md) — 표시 이름 체인 통일,
  프로필 강제 해제, `placeProfileCreate.*`를 남긴 결정. 본 ADR이 그 "재권유 UX"를 채운다.
- [ADR-0026](0026-self-chat-channel-type.md) — self 채널 타입과 `join.nick` 쓰기
- [ADR-0031](0031-place-settings-hub.md) · [ADR-0020](0020-place-profile-edit-dialog.md) —
  프로필 설정의 기존 경로
- [ADR-0033](0033-relay-dm-invite-and-auth-parallel-tracks.md) D10 — 전화번호 유저의 `***1234`
  표시명 출처
- Figma: `3185-13278`(프로필 설정 필요) · `3026-11374`(프로필 생성) ·
  `3451-21413`(설정 완료 후) · `3451-21323`(별명 설정)
- 코드 주석의 알려진 오류: `ChannelList.tsx:68`·`resolveChannelTitle.ts:47`이 self 채널을
  "ADR-0022"라고 적었으나 실제는 **ADR-0026**이다(0022는 초대 페이지). 이번에 함께 고친다.
