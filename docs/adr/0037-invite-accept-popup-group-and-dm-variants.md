# ADR-0037: 초대 수락 팝업의 그룹 / 1:1 변형과 신규 디자인 반영

> 상태: Accepted · 결정일: 2026-07-30

## 맥락 (Context)

초대 수락 화면은 이미 구현돼 있다 — [`InviteAcceptScreen`](../../apps/web/src/app/features/home/components/invite/InviteAcceptScreen.tsx)
과 하위 카드 3종(`InvitePlaceCard` / `InviteTargetCard` / `InviteExpiryCard`), 유리
표면 셸 `InviteCard`. 오케스트레이터는 둘이고 방 종류를 **데이터가 아니라 플로우로**
정한다: `RelayInviteDialog` → `targetKind="oneToOne"` 하드코딩,
`CloudInviteDialog` → prop 생략(기본 `'group'`). ADR-0016·ADR-0033의 결과물이다.

이번에 디자인이 갱신되며 두 노드로 분리됐다:

- `3072-10943` — 초대받은자\_초대 수락 화면 **#1:1 대화**
- `3076-11341` — 초대받은자\_초대 수락 화면 **#그룹 대화**

구현이 참조하던 노드는 후자(`3076-11341`)라 전체 골격은 살아 있다. 실제 어긋난
지점만 추리면 이렇다.

| 항목                | 현재                                                 | 신규 디자인                                |
| ------------------- | ---------------------------------------------------- | ------------------------------------------ |
| 유효시간            | 절대 만료시각 + `n분 남음` 2줄, 30초 tick            | `HH:mm:ss 남음` **1줄**, 초 단위           |
| 1:1의 플레이스 카드 | 메타가 없어 조건부로 접힘                            | 1:1 노드에도 그려져 있음                   |
| 방 친구 칩          | `Badge tone="muted"` + lucide 외곽선 14px            | 유리 칩(white 20% + shadow) + duotone 18px |
| 보조 텍스트         | `--description` `#84888F`                            | `--label` `#53555B`                        |
| 헤딩                | `--foreground`                                       | `blue_bk` `#102346` = `--brand-ink`        |
| 카드2 아바타        | `DefaultAvatar` 기본 `variant='user'`(lucide 외곽선) | `1명 Profile` 1인 solid 글리프             |
| 시계 아이콘         | lucide `Clock`(선)                                   | Bold Duotone Clock Circle(면)              |

조사 중 드러난 제약 두 가지가 결정을 좌우했다.

1. **`memberCount`는 죽은 코드다.** `InviteInfo`에 선언되고 `InviteTargetCard`가
   읽지만 **두 다이얼로그 어느 쪽도 넘기지 않는다.** 백엔드가 비정규화해주지
   않아서다. 그룹 변형의 핵심 차별 요소인 "방 친구 20" 칩을 채울 데이터가 없다.
2. **방 종류에 데이터 근거가 없다.** 앱의 채널 타입 필드는 `stereo === 'dm'`인데
   (`ChannelRoomPage.tsx:105`) `MyInviteView`·`RelayInviteView` 둘 다 `stereo`를
   실어오지 않는다.

## 결정 (Decision)

### 1. 1:1 초대에서 플레이스 카드를 **제외**한다

`targetKind === 'oneToOne'`이면 `InvitePlaceCard`를 렌더하지 않는다. 지금의
"메타가 있으면 표시" 조건부 렌더를 방 종류 기준으로 바꾼다는 뜻이다 — 나중에
relay 초대가 플레이스 메타를 실어오더라도 1:1에서는 뜨지 않는다. 1:1 대화에
플레이스는 의미가 없고, 그룹/1:1 차이를 가장 크게 벌리는 선택이다.

디자인의 1:1 노드에 플레이스 카드가 그려진 것은 그룹 노드 복제 잔재로 본다.

### 2. 방 종류 판정과 방 친구 칩은 **현행 유지 + 데이터 없으면 숨김**

- `kind`는 플로우별 하드코딩을 유지한다(relay → `oneToOne`, cloud → `group`).
  이번 작업에서 `stereo` 백엔드 요청을 새로 걸지 않는다.
- "방 친구 N" 칩은 UI를 디자인대로 갖춰두되 `memberCount`가 없으므로 **실제로는
  뜨지 않는다.** 현재의 `memberCount != null && > 0` 조건부 렌더가 곧 그 상태다.
  ADR-0033 D1 "인터페이스 선반영" 원칙 그대로 — 값이 오는 날 한 줄도 안 바꾸고
  뜬다. duotone 그룹 아이콘도 같은 이유로 미리 준비한다.

### 3. 유효시간을 한 줄로 바꾼다 — 24시간 미만만 `HH:mm:ss`

- `useInviteCountdown`에 `seconds`를 추가하고 `TICK_MS`를 `30_000` → `1_000`으로.
- `InviteExpiryCard`에서 절대 만료시각 줄(`formatDeadline`)을 **삭제**한다.
- `IMMINENT_MINUTES = 10` 이하 빨강 처리는 유지한다(디자인에 없지만 유용한 정보). 판정은
  `isExpired || isImminent` — `isImminent`는 만료 순간 거짓으로 돌아가므로 그것만 보면 죽은 링크가
  평온한 색으로 `00:00:00 남음`을 보여준다. `InviteWaitingPage`가 이미 쓰는 짝짓기를 따른다.

**표기는 하이브리드다.** 디자인은 `HH:mm:ss`만 그렸지만 초대 링크는 **백엔드에서 3일**이라
(ADR-0033 D8) 24시간 미만을 전제한 그 표기로는 갓 받은 링크를 표현할 수 없다. 그래서:

- `days >= 1` → `2일 5시간 남음`
- `< 24h` → `HH:mm:ss 남음` (매초)

둘 다 기존 `inviteAccept.expiry.remaining`(`{{time}} 남음`) 한 키를 통과하므로 신규 i18n 키가
없다. 24시간 이상 구간의 문구는 **우리가 정한 것이므로 디자이너 확인이 필요하다** — ADR-0033 D8의
"유효시간 카피 수정 요청"이 아직 열려 있다.

`InviteExpiryCard`의 기존 주석 "Invite links live at most ~30min"은 **사실이 아니다**(실제 3일).
이 틀린 주석이 처음에 `HH:mm:ss` 단독 표기를 타당해 보이게 만들었다 — 함께 고친다.

### 4. web-ui-kit에 추가하는 것은 **아이콘 3종만**

Figma에서 SVG를 추출해 `resources/icons`에 기존 커스텀 글리프 규약
(`IconGroup`·`IconUserSolid`·`IconPin`·`IconChatAdd`)대로 정의한다.

| 이름(안)         | Figma                                                         | 대체 대상          |
| ---------------- | ------------------------------------------------------------- | ------------------ |
| `IconClockSolid` | Bold Duotone / Time / Clock Circle (`3073:10991`)             | lucide `IconClock` |
| `IconUsersGroup` | Bold Duotone / Users / Users Group Two Rounded (`3158:26141`) | lucide `IconUsers` |
| `IconImageSolid` | 플레이스 사진 placeholder 40px (`3073:10971`)                 | lucide `IconImage` |

**추출 검증(2026-07-30)** — Figma 에셋 서버에서 세 글리프를 실제로 받아 kit 자산과 대조했다:

- `IconImageSolid`의 도형은 kit의 `resources/assets/default-place-avatar.svg`(86px)와 **동일하다**
  (좌표가 정확히 0.4651배). 그런데 그것은 `#102346`이 박힌 URL 임포트 에셋이라 `currentColor`도
  다크 모드도 안 되고 소비처가 `CreatePlaceDialog`의 업로드 기본 이미지 하나뿐이다. 그래서 에셋은
  그대로 두고 **컴포넌트를 새로 만든다** — 이 항목이 필요한 이유는 "kit에 글리프가 없어서"가
  아니라 "테마 대응 가능한 형태가 없어서"다.
- 카드2의 `1명 Profile` 글리프는 kit의 `IconUserSolid`와 **동일하다**(0.952배). 결정 5대로
  `DefaultAvatar variant='self'`로 충족되며 **신규 에셋이 필요 없다.**

`GlassCard` 승격, `Badge`의 `glass` tone 추가, `InviteAcceptScreen` 자체의 kit
composite 승격은 **하지 않는다.** 유리 표면과 칩 색·패딩은 앱 로컬(`InviteCard`,
`Badge` + `className`)에 남긴다 — 재사용처가 이 화면 하나뿐이라 kit으로 올릴
근거가 약하다.

### 5. 카드2 아바타는 두 변형 모두 1인 solid

`DefaultAvatar variant='self'`(= `IconUserSolid`, Figma `1명 Profile`)를 쓴다.
kit에 이미 있는 3인 글리프(`variant='group'`)를 그룹에 쓰지 않는다 — 디자인 파일을
진상으로 삼는다. 그룹 노드의 아바타가 1:1과 에셋 해시까지 동일한 것은 짚어뒀고,
디자인이 수정되면 prop 한 줄 변경이다.

### 6. 배경은 현행 CSS 그라디언트 유지

디자인의 384×733 SVG 도형 에셋을 추출하지 않는다. `backdrop-blur-75`가 걸리는
도형은 원본과 CSS 근사가 사실상 구분되지 않고, CSS 쪽이 화면 폭 대응과 다크 모드에
유리하며 바이트가 0이다.

### 7. 색·사이징 보정은 전부 반영

보조 텍스트 `--description` → `--label`, 헤딩 → `--brand-ink`(+ 다크 모드 대응),
유효시간 카드 `gap` 12 → 8px, 칩 패딩 `px-3.5 py-2` + 유리 색, 플레이스 fallback
아이콘을 duotone 사진 글리프로 교체.

푸터는 **현행 frosted(`white/55` + `blur-16`) 유지**. Figma의 `#dbdbda`는 blur
렌더를 flatten한 결과값으로 본다.

### 범위 밖

- 백엔드 요청 신규 제기(`stereo`·`memberCount`·채널 이미지 비정규화)
- 만료/이미참여/취소 등 상태 다이얼로그(ADR-0033 Track C 2번) — 변경 없음
- 수락 파이프라인·채널 해소(ADR-0035) — 변경 없음
- 거절 버튼: `RELAY_INVITE_DECLINE_ENABLED = true`로 이미 디자인과 일치

## 대안 (Alternatives)

**1:1도 플레이스 카드를 항상 렌더** — 디자인 노드에 충실하지만 relay 초대에 place
메타를 실어달라는 백엔드 요청이 새로 필요하고, 1:1 대화에서 플레이스를 보여주는
의미가 불분명하다. 버렸다.

**수락 전 채널을 조회해 `stereo`·멤버수 획득** — 수락 전에는 채널 접근 권한이 없을
가능성이 높아 실패 경로만 늘린다. 버렸다.

**`InviteAcceptScreen`을 kit composite로 승격** — 지시사항의 "누락 컴포넌트는
라이브러리에 정의" 취지에는 맞지만 재사용처가 앱 한 곳이고, 화면이 `useTranslation`과
앱 i18n 키에 묶여 있어 kit의 표현-전용 계약을 깬다. 아이콘만 올린다.

**배경 SVG 에셋 추출** — 픽셀 일치는 얻지만 고정 뷰박스라 화면 폭 대응과 다크 모드
처리를 따로 짜야 하고 에셋이 무겁다. 버렸다.

## 결과 (Consequences)

**얻는 것**

- 그룹/1:1 차이가 캡션 한 줄이 아니라 **카드 구성 자체**로 벌어진다(플레이스 카드
  유무 + 방 친구 칩).
- 유효시간이 마지막 하루에 초 단위로 살아 움직인다. 그 구간이 사용자가 실제로 서두르는
  구간이다.
- 아이콘이 lucide 근사에서 Figma 원본 글리프로 바뀌어 시각 정합이 올라간다.
- kit 표면을 아이콘 3종만 넓혀 파급이 작다.

**감수하는 트레이드오프**

- **방 친구 칩은 여전히 화면에 뜨지 않는다.** 디자인의 그룹 변형 대표 요소가
  백엔드 부재로 비어 있다. Storybook에서만 확인 가능하며, 데이터가 언제 올지는
  이 ADR이 답하지 않는다.
- **방 종류가 여전히 플로우 하드코딩이다.** relay로 그룹방을 초대하는 경로가
  생기면 즉시 깨진다 — `stereo`를 실어오게 만들 때까지의 부채로 남긴다.
- `TICK_MS` 1초는 `useInviteCountdown`을 공유하는
  [`InviteWaitingPage`](../../apps/web/src/app/features/invite/pages/InviteWaitingPage.tsx)에도
  적용된다. 렌더 빈도가 30배로 늘지만 카운트다운 칩 하나라 실질 비용은 작다.
- 절대 만료시각 표기를 잃는다. "언제까지"를 정확히 알고 싶은 사용자는 남은 시간에서
  역산해야 한다.
- 그룹 아바타가 1인 글리프인 채로 남는다 — 디자인 확인 대기 항목.
- **라이트/다크가 다른 색을 쓰는 지점이 둘 생겼다.** `--brand-ink`는 두 테마에서 같은
  값이라, 다크 표면 위에서는 헤딩이 대비를 잃고(그래서 `dark:text-foreground`) 사진
  placeholder 글리프는 1.2:1까지 떨어진다(그래서 `dark:text-white/80`). 후자는 모티프가
  **컷아웃**이어서 글리프 색이 배경을 그대로 드러내기 때문이며, 종전 구현이 원판+흰
  글리프였던 덕에 가려져 있던 문제다. 디자인은 라이트만 그렸으므로 다크 값은 우리 판단이다.

## 참고

- ADR-0016 초대 수락 팝업 web-ui-kit 이관
- ADR-0033 relay DM 초대 · 인증 병렬 트랙 (D1 인터페이스 선반영, Track C 수신자 흐름)
- ADR-0035 relay 초대 수락 후 채널 해소
- Figma `3072-10943`(1:1) · `3076-11341`(그룹)
