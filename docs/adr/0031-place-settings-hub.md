# ADR-0031: 플레이스 설정 허브 (라우트 기반) 도입

> 상태: Accepted · 결정일: 2026-07-27

## 맥락 (Context)

`apps/web/src/app/features` 에 플레이스 설정 관련 기능을 추가한다. 요구사항:

- 컴포넌트는 `@chatic/web-ui-kit` 기반으로 구현하고, 누락된 컴포넌트는 해당 라이브러리에 신규 정의 후 사용한다. 아이콘도 있으면 리소스로 따와 `web-ui-kit` 아이콘 관례(`resources/icons`)에 추가한다.
- 개선된 UI를 반영한다. (단, 이 세션에서는 Figma MCP 미인증으로 시각 디테일 직접 확인 불가 — 픽셀 구현은 Figma 인증 후 진행 필요.)
- 진입점: 홈 프로필 아바타 클릭 시 뜨는 드롭다운.
- 플레이스 이름·플레이스 프로필(이미지) 편집은 **오너만 가능**, 오너가 아니면 **disabled**.
- 이번 범위: **플레이스 설정 / 플레이스 프로필 설정 / 플레이스 유저 프로필 설정 / 채팅방 정렬**.

조사 결과, 상당 부분이 이미 존재한다:

- **플레이스 엔티티(이름/썸네일) 편집 로직·API**: `useUpdatePlace({sid,name,thumbnail})` → `PlaceRepositoryV2.updatePlace`(옵티미스틱+롤백). 화면 `PlaceInfoPage`가 있으나 어디서도 진입하지 않는 고아 페이지이며, 오너 가드가 반대로 뒤집힌 버그(`if (place.isOwner) navigate(-1)`)가 있다. 오너 판별은 서버 제공 `place.isOwner`.
- **플레이스 유저 프로필(닉네임/사진, `${sid}@${uid}` 스코프)**: `PlaceProfileEditDialog` + 공용 폼 `PlaceProfileFormDialog` + `setMyProfile({nick,thumbnail})` 로 이미 완성. 홈 드롭다운의 "프로필"에서 열림.
- **진입 드롭다운**: `HomePage.tsx` `profileMenu`(프로필/알림/설정), Radix `DropdownMenu`(`@chatic/ui-kit`) 기반. `isCloudOwner`, `selectedSiteId` 이미 이 위치에서 접근 가능.
- **정렬 UI 재료**: `BottomSheet` + `SheetOption`(라디오 행), 클라이언트 선호 저장소 `preferenceKeys.ts` + `usePreferenceStore`(localStorage `chatic-*`) 완비. 현재 채팅방 정렬은 "최근 활동순" 고정.

## 결정 (Decision)

### 진입 및 화면 구조 — 라우트 기반 설정 허브

- 홈 프로필 드롭다운(`profileMenu`)에 **"플레이스 설정"** 항목을 추가하고, 클릭 시 **설정 허브 라우트 페이지**로 이동한다. (다이얼로그가 아닌 라우트 페이지.)
- 설정 허브는 **단일 페이지**로, `MenuCard` + `ListRow` 목록에서 각 세부 페이지로 이동하는 계층형(iOS 설정 앱 형태) 구조다:
    - 플레이스 설정(이름/프로필 이미지) — 세부 페이지
    - 플레이스 유저 프로필 설정 — 세부 페이지
    - 채팅방 정렬 — 세부 페이지(정렬 기준 선택)
    - 플레이스 알림 — 이번 범위 밖(미구현). placeholder/disabled 행으로 노출 가능.

### 플레이스 설정(이름/이미지) — 오너 전용

- 기존 `PlaceInfoPage` 로직(`useUpdatePlace`, 썸네일 `resizeImageToBase64(150)`, 이름 1–20자)을 **재사용**하되, 허브 하위 라우트로 연결하고 **뒤집힌 오너 가드 버그를 수정**한다.
- 오너 판별은 서버 제공 **`place.isOwner`** 사용. 오너가 아니면 허브의 해당 행과 편집 컨트롤을 **disabled** 처리(숨김 아님).

### 플레이스 유저 프로필 — 페이지 + 팝업 병행

- **드롭다운 "프로필"** 클릭 → 기존 **풀팝업 다이얼로그**(`PlaceProfileEditDialog`) 유지.
- **설정 허브 안**의 "플레이스 유저 프로필" → **라우트 페이지**로 노출.
- 두 진입점은 공용 폼 본문(`PlaceProfileFormDialog`)과 `setMyProfile` 저장 로직을 **공유**한다. (컨테이너만 다이얼로그/페이지로 분기.)

### 채팅방 정렬 — 기준 선택 + 클라이언트 저장

- 설정 페이지 안에서 **정렬 기준을 선택**한다(수동 드래그 순서 아님). 제공 기준:
    - **최근 활동순** (기본값, 현재 동작과 동일)
    - **안읽은 메시지 우선** (unread 있는 방을 상위로)
- 선택 UI는 `SheetOption`/라디오 방식.
- 정렬 상태는 **클라이언트 localStorage에 플레이스별로 저장**한다. `preferenceKeys.ts` 레지스트리에 placeId 스코프 키를 추가하고 `usePreferenceStore`로 읽고 쓴다. 서버 동기화 없음(기기별).
- 채팅방 목록(`ChannelList`)의 정렬 `useMemo`가 이 선호값을 읽어 반영한다.

### 컴포넌트/아이콘

- 모든 화면은 `@chatic/web-ui-kit` 조합으로 구성한다: 허브/행은 `MenuCard`·`ListRow`·`SectionHeader`·`GroupLabel`, 폼은 `TextField`·`ProfileAvatar`, 정렬은 `BottomSheet`·`SheetOption`, 상단은 `ModalTopBar`, 하단 CTA는 `FloatingButton`.
- 드롭다운은 kit에 없어 `@chatic/ui-kit`의 Radix `DropdownMenu`를 직접 사용(기존 관례).
- kit에 없는 컴포넌트가 필요하면 **`web-ui-kit`에 신규 정의 후 사용**한다.
- 신규 아이콘은 `resources/icons/index.ts`에 lucide 재export 한 줄로 추가하거나, Figma 커스텀 글리프면 `IconGroup.tsx` 패턴의 SVG 컴포넌트로 추가한다.

### 범위 제외 (이번 작업 아님)

- **플레이스 채팅방 관리** — 후속 작업.
- **플레이스 알림** — 미구현.
- 정렬 서버 동기화, 수동 드래그 재배치(@dnd-kit).

## 대안 (Alternatives)

- **기존 다이얼로그 패턴 재사용(라우트 대신)**: 변경 최소·기존 패턴 일치. 그러나 사용자가 라우트 기반 설정 페이지를 명시적으로 택함(딥링크/뒤로가기/계층 탐색 이점). → 기각.
- **드롭다운에서 각 항목을 개별 라우트로 직행(허브 없음)**: 화면 수는 같지만 설정 항목이 늘 때 드롭다운이 비대해짐. 계층형 허브가 확장에 유리. → 기각.
- **유저 프로필을 라우트 페이지로 완전 이관(다이얼로그 제거)**: 일관성은 높으나 홈에서의 빠른 프로필 편집 진입(풀팝업)을 잃음. 폼 본문 공유로 중복 없이 둘 다 유지 가능하므로 병행 채택.
- **정렬을 수동 드래그 순서로**: `@dnd-kit` 신규 도입 + 순서 배열 저장 필요. 요구는 "정렬 방식 저장"이므로 기준 선택이 최소. → 기각(후속 여지).
- **정렬을 서버 저장(place.order/join order)**: 기기 간 동기화 이점이나 백엔드 필드/작업 필요. 클라이언트 localStorage가 최소 경로. → 기각.
- **정렬 진입을 채팅방 목록 헤더 BottomSheet로**: 리스트 근처 진입이 자연스러우나, 설정을 한곳에 모으는 허브 방침과 사용자 선택에 따라 설정 페이지 내부로. → 기각.

## 결과 (Consequences)

**얻는 것**

- 대부분 기존 자산(`useUpdatePlace`, `setMyProfile`, `PlaceProfileFormDialog`, `PlaceInfoPage` 로직, 선호 저장소, kit 컴포넌트) 재사용 → 신규 표면 최소.
- 고아 `PlaceInfoPage`에 진입점이 생기고, 뒤집힌 오너 가드 버그가 정리된다.
- 설정이 계층형 허브로 모여 이후 항목(알림, 채팅방 관리) 추가가 쉬움.
- 정렬 선호가 플레이스별로 유지된다.

**감수하는 트레이드오프**

- 유저 프로필 진입이 다이얼로그/페이지 두 컨테이너로 이원화 → 폼 본문 공유로 관리하되 컨테이너 분기 코드가 생김.
- 정렬은 기기별(localStorage)이라 기기 간 동기화 안 됨.
- 라우트 신설로 라우팅/네비게이션 배선 작업이 추가됨(다이얼로그 대비).
- Figma 미확인으로 시각 디테일(간격·색·신규 컴포넌트 형태)은 구현 단계에서 Figma 인증 후 재확인 필요 — ADR은 구조/데이터 결정만 확정.

## 다음 단계

이 ADR을 입력으로 `dev-2_implement`의 스펙 작성(Phase A)으로 넘어간다.
