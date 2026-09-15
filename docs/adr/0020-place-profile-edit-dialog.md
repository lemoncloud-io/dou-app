# 0020. 플레이스 프로필 "수정" 화면을 Dialog로 전환하고 ui-kit 기반으로 개선

> 상태: Accepted · 결정일: 2026-07-20

## 한 줄 요약

플레이스에서 쓰는 내 프로필(이름·사진)을 고치는 화면을, 이미 새 디자인으로 만들어진 [생성 화면(0012)](0012-place-profile-creation.md)과 동일한 **Dialog 오버레이 + ui-kit** 형태로 통일한다. 기존 라우팅 Page `SiteProfileEditPage`를 `PlaceProfileEditDialog`로 전환하고, 생성/수정 공통 몸통을 추출한다.

---

## 맥락 (Context)

대상 Figma: [DoU / "내 프로필 수정" (node 3186-24908)](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3186-24908&m=dev). 화면 구성은 중앙 정렬 타이틀/서브타이틀(`<플레이스>에 / 적용 중인 프로필 입니다.`) + 아바타(+Plus 배지) + 이름 필드(라벨\*/카운터/설명) + 완료 CTA로, 생성 화면과 동일한 레이아웃이다.

세 화면을 구분해야 한다 (0012의 용어 구분을 이어받음):

| 대상                       | 무엇을 하는가                                | 담당 (기존)                                  |
| -------------------------- | -------------------------------------------- | -------------------------------------------- |
| 플레이스 프로필 — 생성     | 그 플레이스에서 쓸 내 프로필을 **처음 만듦** | `PlaceProfileCreateDialog` (신 디자인 완료)  |
| 플레이스 프로필 — **수정** | 이미 있는 내 프로필을 **고침**               | `SiteProfileEditPage` (구식) ← **이번 대상** |
| 플레이스(엔티티) 정보      | 공간 자체의 이름/생성일                      | `PlaceInfoPage` (이번 범위 밖)               |

현재 코드 상태:

- **수정** `SiteProfileEditPage` ([apps/web/src/app/features/mypage/pages/SiteProfileEditPage.tsx](../../apps/web/src/app/features/mypage/pages/SiteProfileEditPage.tsx))
    - 라우팅 Page(`/mypage/site-profile`), 홈 헤더 드롭다운에서 `navigate` 진입 ([HomePage.tsx:186](../../apps/web/src/app/features/home/pages/HomePage.tsx#L186)).
    - 구식 raw-HTML: `<input>/<button>/<label>` 직접, `lucide-react`(`Camera/User`) 직접 import(아이콘 배럴 컨벤션 위반), 하드코딩 `bg-[#B0EA10]`.
- **생성** `PlaceProfileCreateDialog` ([apps/web/src/app/features/home/components/PlaceProfileCreateDialog.tsx](../../apps/web/src/app/features/home/components/PlaceProfileCreateDialog.tsx))
    - 이번 Figma 디자인으로 마이그레이션 완료된 Dialog 오버레이. `ProfileAvatar / TextField / Text / FloatingButton / ModalTopBar / Toast / AlertDialog`(`@chatic/web-ui-kit`) 사용.

두 화면은 저장 경로(`profileRepository.setMyProfile({ nick, thumbnail })`)가 동일하고 제목·초기값·저장 문구만 다른 **사실상 쌍둥이**다.

제약:

- 컴포넌트는 `@libs/web-ui-kit` 기반. 누락 시 라이브러리에 신규 정의 후 사용.
- Figma에 특정 아이콘이 있으면 리소스를 따온다.

## 결정 (Decision)

1. **대상 = 프로필 수정 화면.** `PlaceInfoPage`(플레이스 엔티티 수정)는 이번 Figma와 대응하지 않으므로 범위 제외.

2. **`SiteProfileEditPage` → `PlaceProfileEditDialog` 리네임.** "Site" 네이밍을 "Place"로 통일하고 생성 짝꿍과 접미사(Dialog)를 맞춘다.

3. **라우팅 Page → Dialog 오버레이 전환.**
    - `PlaceProfileCreateDialog`처럼 HomePage에 `open/onClose`로 마운트.
    - `mypage` 라우트의 `site-profile` Route와 `ROUTES.mypage.account.siteProfile` 상수 제거.
    - 홈 헤더 드롭다운 프로필 항목을 `navigate(siteProfile)` → 다이얼로그 `open` 토글로 변경. **클라우드 종류와 무관하게 항상** 이 다이얼로그를 연다(default cloud도 relay가 `selectedSiteId`를 주므로 포함, 기존 `account.edit` 분기 제거). 활성 플레이스(`selectedSiteId`)가 없으면 메뉴 항목 비활성.

4. **생성/수정 공통 컴포넌트 추출.** 아바타 + 이름 필드 + 설명 + CTA + 미저장 이탈 가드(AlertDialog)를 담은 공통 몸통을 만들고, 생성/수정을 얇은 래퍼로 둔다. 차이는 제목/서브타이틀, 초기값(수정은 `useMyProfile` 프리필), CTA 문구, 성공 처리뿐.

5. **ui-kit 신규 정의는 원칙적으로 없음.** 디자인 요소(`ProfileAvatar` 86px+Plus, `TextField` 라벨\*/카운터/설명, `ModalTopBar` X, `FloatingButton` 완료)와 아이콘(`IconPlus/IconUser/IconClose`)이 모두 존재. 구현 중 실제 누락 확인 시 그때 web-ui-kit에 정의.

범위(포함/제외):

- 포함: 위 1~5, 관련 i18n 키 정리, 기존 `SiteProfileEditPage`/route/테스트 정리.
- 제외: `PlaceInfoPage` 개선, `CloudProfileEditPage`/`ProfileEditPage` 자체 변경(다만 홈 드롭다운은 더 이상 `account.edit`로 가지 않음, 라우트/페이지는 존치).

## 대안 (Alternatives)

- **Page 유지, 리스타일만** — 라우팅 구조 유지, ui-kit 디자인만 입힘. 변경 범위는 작지만 생성(Dialog)과 진입 형태가 어긋나고 "Dialog" 네이밍과 불일치. → 기각.
- **수정 다이얼로그 독립 구현** — 생성 디자인 복제. 결합도는 낮지만 쌍둥이 코드가 두 벌 남아 유지보수 부담. → 기각(공통 추출 채택).
- **`PlaceInfoPage`를 대상으로** — 사용자 최초 표현("플레이스 프로필 설정화면")과 매칭될 뻔했으나, Figma 노드가 프로필(닉/사진) 화면이라 불일치. → 제외.

## 결과 (Consequences)

- 얻는 것: 생성/수정 UX·코드 일관성, ui-kit 컨벤션 준수(아이콘 배럴·토큰), 쌍둥이 중복 제거, "Site→Place" 네이밍 정리.
- 트레이드오프:
    - 진입이 라우트→오버레이로 바뀌어 딥링크(`/mypage/site-profile`)가 사라진다. 직접 진입처가 없는지 확인 필요(현재 참조는 HomePage 드롭다운 1곳).
    - 공통 컴포넌트 추출로 생성 다이얼로그도 함께 리팩터되므로 `PlaceProfileCreateDialog.test.tsx` 회귀 확인 필요.
- 별건(범위 외): `PlaceInfoPage`의 owner 가드가 주석("owner가 아니면 뒤로")과 반대로 `if (place.isOwner) navigate(-1)`로 구현돼 로직 반전 의심. 별도 작업으로 처리.

## 다음 단계

이 ADR을 입력으로 dev-2_implement의 스펙 작성(Phase A)으로 넘어간다.
