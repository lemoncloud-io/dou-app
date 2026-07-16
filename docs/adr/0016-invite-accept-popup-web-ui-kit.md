# 초대 수락 팝업: web-ui-kit 리디자인 — 풀스크린 수락 화면 + AlertDialog 에러 4종

## Status

accepted

결정일: 2026-07-16

관련: [0012](./0012-place-profile-creation.md), [0013](./0013-home-screen-web-ui-kit-migration.md)

## Context

초대 딥링크로 진입했을 때 뜨는 `InviteDialog`
(`apps/web/src/app/features/home/components/InviteDialog.tsx`)는 홈 오버레이 중 **유일하게
`web-ui-kit`를 안 쓰는 하드코딩 잔재**다. `fixed inset-0 ... bg-[rgba(41,41,58,0.23)]` 오버레이 +
`bg-white/80 backdrop-blur` 작은 중앙 카드를 직접 그리고, 색상은 전부 하드코딩 hex(`#b0ea10`,
`#222325`, `#84888f`)이며, Radix 기반 접근성(포커스 트랩·ESC·오버레이 클릭)과 애니메이션이 없다.
형제 오버레이(`OnboardingModal`, `PlaceProfileCreateDialog`, `CloudSessionSheet`)는 이미 kit으로
마이그레이션됐다.

리디자인이 Figma에 반영됐다 (파일 `ViwLfjc5Eoq7BpEXFfFj3W`):

- `3075-11215` / `3072-10943` — 수락 화면: 초대자 아바타 + "OO님이 DoU에 당신을 초대했어요" +
  플레이스 카드 + `You / 1:1 대화` 카드 + (`3072`) 초대 링크 유효기간 카드 + 하단 `거절`/`수락`
- `3077-11587` — 수락 화면(그룹): You 카드에 `방 친구 20` 배지, 유효기간 임박 시 **빨강**
- `3077-11719` — AlertDialog **초대 링크 만료**
- `3078-12015` — AlertDialog **이미 참여한 초대**
- `3079-12154` — AlertDialog **채팅방 삭제됨**
- `3079-12304` — AlertDialog **초대 취소됨**

현재 코드 대비 두 가지 갭이 확인됐다:

1. **데이터 갭.** `useInviteInfo`가 주는 `MyInviteView`의 `inviter$`/`site$`/`user$`는 전부
   `id`+`name`만 담는 `Head` 타입이다. Figma가 요구하는 **플레이스 소개문구·썸네일, 채널
   멤버수(방 친구 N), 초대자 아바타 이미지**가 없다. 미가입 상태라 프론트가 site/channel 상세를
   따로 조회할 권한도 없다. `expiredAt`(최대 30분)은 존재해 유효기간 카운트다운은 가능하다.
2. **에러 구분 갭.** `resolveInviteErrorKey`는 `만료(expired)`만 확실히 구분하고 이미참여/삭제/취소는
   `enterFailed`/`failed`로 뭉뚱그린다. 또 에러가 **수락 시도 이후**에만 잡히는데, Figma의
   삭제/취소/이미참여는 로드 시점 판정이 자연스럽다.

또한 `InviteDialog`는 URL 구동으로 홈에 **무조건 mount**되어 온보딩·프로필생성 오버레이(모두
`z-50`)와 겹칠 수 있고, 우선순위 로직 밖에 있다.

## Decision

**범위: 초대 수락 팝업을 `web-ui-kit`로 리디자인하고, 정말 없는 프리미티브만 라이브러리에
추가한다. 데이터 흐름·수락 파이프라인(`useInviteAccept`)은 보존한다 — 리라이트가 아니라
프레젠테이션 마이그레이션 + 오버레이 편입이다.**

### 수락 화면 — 풀스크린 슬라이드업

- 작은 중앙 카드 → **풀스크린 슬라이드업 다이얼로그**. `PlaceProfileCreateDialog` 패턴 재사용:
  `Dialog`(`@chatic/ui-kit`, slide-up) + `ModalTopBar`(좌 DoU 로고 / 우 X) + 스크롤 본문 +
  **하단 고정 2버튼 footer(`거절`/`수락`)**.
- 본문: 초대자 아바타(이미지 없으면 이니셜 폴백) + heading, **플레이스 카드**(썸네일/명/소개),
  **`You / 1:1 대화` vs 그룹 카드**(`stereo`/`channelId`로 판정, 그룹이면 `방 친구 N` 배지),
  **초대 링크 유효기간 카드**(`expiredAt` 카운트다운, 임박 시 빨강).
- `수락` → 기존 `accept()`. `거절` → 기존 dismiss(query 제거 후 홈). 로직 그대로.

### 에러 — web-ui-kit `AlertDialog` 4종

- 만료/이미참여/삭제/취소 4개 메시지를 **`AlertDialog`(중앙 확인형, `확인` 단일 버튼)로 전부
  구현**한다.
- 배선은 **구분 가능한 것만**: 만료는 확실히 매핑, 나머지는 백엔드 에러코드로 구분 가능한
  범위에서 배선하고 미구분분은 generic 폴백. 배선 완성은 후속 추적.
- `missingDelegator`(로그아웃 유도) 상태는 Figma에 없지만 유지 — 동일하게 `AlertDialog`로 통일.

### 오버레이 우선순위 — 온보딩 > 초대 > 프로필생성

- 초대 팝업을 HomePage 우선순위 로직에 **편입**한다: `isFirstRun`(온보딩)이면 초대 팝업을
  억제하고, 온보딩 완료 후 URL에 초대 query가 남아 있으면 그때 표시.
- place-profile는 이미 온보딩에 양보하며, 초대 **수락 후** 플레이스 입장 시점에 자연 후행하므로
  초대와 시간차로 분리된다.

### 데이터 계약 — 백엔드 확장 선언 + 프론트 graceful degrade

- 백엔드가 invite-info 응답(`MyInviteView` 또는 `site$`/`inviter$`)에 추가해야 할 필드를 **계약으로
  명시**: 플레이스 소개문구, 플레이스 썸네일, 채널 멤버수, 초대자 아바타 이미지. (백엔드 작업은
  이 프론트 리포 밖 — 선행 의존.)
- 프론트는 그 계약대로 소비하되 **필드 도착 전 graceful degrade**(소개/썸네일/멤버수 없으면 숨김,
  아바타는 이니셜·기본 폴백)로 **단독 배포 가능**.

### web-ui-kit 신규 — 정말 없는 것만

- `AlertDialog`·`Button`·`Avatar`·(`ui-kit`)`Dialog`/`ModalTopBar`는 재사용. Figma의 정보
  카드(플레이스/You/유효기간)와 2버튼 footer는 기존 `list`/`layout` 조합으로 먼저 시도하고,
  재사용 가치가 확실한 형태만 kit에 승격.

## Considered Options

- **그레이스풀만, 백엔드 안 건드림** — 기각. 소개문구·썸네일·멤버수가 없으면 Figma 수락 화면이
  반쪽이 된다. 백엔드 확장을 정식 의존으로 선언하되 프론트는 degrade로 선행.
- **프론트가 site/channel 상세를 pre-accept 조회** — 기각. 수락 전엔 미가입이라 권한이 없다.
  백엔드가 invite 응답에 denormalize 하는 게 유일한 경로.
- **초대 최우선(딥링크=즉각 의도)** — 기각. 온보딩 최우선 채택(신규 유저 앱 소개 우선). 딥링크는
  query로 남아 온보딩 후 뜬다.
- **시각만 리스킨(중첩 안 건드림)** — 기각. URL 무조건 mount가 온보딩/프로필생성과 겹치는 실제
  결함을 이번에 정리.

## Consequences

- 초대 팝업이 디자인 시스템에서 렌더되고, 하드코딩 hex·수제 오버레이·a11y 부재가 제거된다.
- **백엔드 의존이 생긴다.** 필드가 오기 전엔 플레이스 소개/썸네일/멤버수가 비어(degrade) 보인다
  — 의도된 중간 상태이며 후속 추적.
- 에러 4종 중 만료 외 일부는 백엔드 에러코드 확인 후 배선 완성(후속). UI는 4종 다 준비된다.
- 초대 팝업이 온보딩 중엔 안 뜬다. 온보딩이 길어져 그 사이 `expiredAt`(≤30분)이 지나면 온보딩 후
  만료 다이얼로그가 뜬다 — 허용.
- 유효기간은 최대 30분이라 Figma의 `n일 n시간` 템플릿은 실제로 분 단위로만 표시된다.
