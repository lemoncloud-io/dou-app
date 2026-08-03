# ADR-0034: 중계 홈 단순화 · 클라우드 전환 시트 섹션화 · 클라우드 안내화면 신설

> 상태: Accepted · 결정일: 2026-08-03

## 맥락 (Context)

Figma에서 중계(DoU Home) 홈, 클라우드 전환 시트, 그리고 신규 "내 클라우드 안내" 화면의 디자인이 개정되었다.

| 화면                               | Figma 노드                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| 중계 홈 (개정)                     | [3486-26403](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-26403) |
| 클라우드 홈 (대조 기준, 변경 없음) | [2931-8181](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=2931-8181)   |
| 전환 시트 — 내 클라우드 0개        | [3477-23611](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3477-23611) |
| 전환 시트 — 목록 있음              | [3486-25407](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-25407) |
| 전환 시트 — 전 섹션 접힘           | [3486-25889](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3486-25889) |
| 내 클라우드 안내 (신규)            | [3519-29515](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3519-29515) |

기존 구현 상태:

- 중계·클라우드 홈은 [HomePage.tsx](../../apps/web/src/app/features/home/pages/HomePage.tsx) 하나가 `isDefaultCloud` 분기로 렌더하며, 중계에서도 `PlaceList`로 기본 플레이스 1개를 노출한다 (ADR-0014 항목 4, `apps/web/docs/feature/home/README.md`).
- 전환 시트 [CloudSessionSheet.tsx](../../apps/web/src/app/features/home/components/CloudSessionSheet.tsx)는 `TabBar`로 `내 클라우드` / `초대된 클라우드` 2탭을 전환하고, `＋ 클라우드 추가`는 소유 클라우드가 0개일 때만 시트 고정 footer에 노출한다.
- 클라우드 구독을 안내하는 화면은 없다. 구독 유도는 토스트/인라인 문구뿐이다.
- 행의 2줄 표기(소유 = `cloud.email`, 초대 = `{owner}님의 클라우드`), 상태 배지, 프로비저닝 30초 폴링은 이미 구현되어 있다.

제약:

- 컴포넌트는 `@chatic/web-ui-kit` 기반으로 구현하고, 누락된 컴포넌트는 해당 라이브러리에 새로 정의한 뒤 사용한다.
- 결제는 IAP를 경유하므로 기존 `SubscriptionSelectDialog → EmailVerifyDialog → IAP` 경로는 건드리지 않는다.
- i18n은 `ko` / `en` 두 로케일 모두 채운다.

## 결정 (Decision)

### 1. 중계 홈에서 Place 섹션 제거 (중계 모드 한정)

- `isDefaultCloud === true`일 때 `PlaceList`를 렌더하지 않는다. 헤더 → 프로모션 배너 → `Chat` 섹션 순으로만 구성한다.
- 클라우드 모드(`isDefaultCloud === false`)의 Place 섹션은 `플레이스 추가` 포함 그대로 유지한다 (Figma 2931-8181).
- 중계 플레이스는 **항상 정확히 1개이며 자동 연결**된다. `useHomePlaces` + `useSwitchPlace`의 "활성 플레이스가 없으면 첫 플레이스 자동 선택" 동작은 그대로 유지하고, 세션 연결은 유지한 채 UI 노출만 제거한다.
- `/place/:id` 라우트와 헤더 프로필 드롭다운의 플레이스 설정 경로는 존치한다. 홈 리스트를 통한 진입점만 사라진다.

### 2. 프로모션 배너 신설 (홈 · 시트 공용)

- `@chatic/web-ui-kit`에 `PromoBanner`를 추가한다: 리딩 아이콘 슬롯 + 2줄 본문 + 옵셔널 액션 링크 + 옵셔널 닫기 버튼.
    - 중계 홈: 링크(`클라우드 추가 >`) + 닫기 모두 사용.
    - 전환 시트: 닫기만 사용(링크 없음. `＋ 클라우드 추가` 버튼이 별도로 존재).
- **노출 조건**: 소유 클라우드가 0개일 때만. 1개 이상이면 두 위치 모두 미노출.
- **닫기 지속성**: 홈과 시트가 **단일 dismiss 키를 공유**한다. `usePreferenceStore`에 dismiss 시각을 저장하고 **24시간 TTL**을 적용해 하루 뒤 재노출한다. 시트에서 닫으면 `내 클라우드` 섹션은 `＋ 클라우드 추가` 버튼만 남는다.
- 배너의 `클라우드 추가 >` 링크는 **기존 플로우를 유지**한다 (`SubscriptionSelectDialog → EmailVerifyDialog → IAP`). 안내화면을 경유하지 않는다.

### 3. 클라우드 전환 시트를 탭 → 접기 섹션 3개로 재편

- `TabBar`를 폐지하고 `CollapsibleSection` 3개로 구성한다: `Home` / `내 클라우드 N` / `초대된 클라우드 N`. 초대 개수 배지는 섹션 카운트로 흡수한다.
- `CollapsibleSection`을 확장한다 — 두 슬롯 모두 **접힌 상태에서도 보여야 한다** (Figma 3486-25889 근거):
    - `description`: 헤더 아래 서브캡션 (`나만의 공간에서 그룹 대화 시작`).
    - `footer`: 접기 대상 body 바깥의 고정 영역 (`＋ 클라우드 추가`).
- `＋ 클라우드 추가`는 시트 고정 footer에서 **`내 클라우드` 섹션 footer로 이동**하고, 소유 클라우드 개수와 무관하게 **항상 노출**한다. 기존 "0개일 때만" 규칙은 폐지한다.
- `내 클라우드` 섹션: 0개면 `PromoBanner`, 1개 이상이면 `description`을 표시한다.
- 유지: 행 2줄 표기, 상태 배지(reserved/suspended/expired/error), 프로비저닝 스피너와 30초 폴링, `내 클라우드 준비 완료` 토스트, 선택 항목 상단 고정(`sortCloudsForSwitcher`), 시트 90vh 고정 높이(전 섹션 접힘 상태 포함).
- **이름 편집 연필을 시트에서 제거**한다. `CloudNameEditDialog`는 사용처가 없어지므로 삭제하고, 클라우드 이름 변경은 `/mypage/cloud-profile` 단일 경로로 통합한다.
- `Home` 행의 선택 표시는 라임 원형 체크로 통일한다.

### 4. 클라우드 안내화면 신설 — `/subscription/guide`

- 라우트 `ROUTES.subscription.guide = '/subscription/guide'`를 추가하고, **마이페이지 "구독" MenuCard의 ListRow를 유일한 진입점**으로 둔다. 홈 배너와 시트 버튼은 이 화면을 경유하지 않는다.
- 구성: `ModalTopBar`(back) → 히어로(3줄 타이틀 + 102px 클라우드 일러스트) → `DoU Home` 카드(FREE 배지 + 제한 3항목) → 3점 장식 → `내 클라우드` 카드(PRO 배지 + 혜택 3항목 + 앱 스크린샷) → 하단 고정 CTA.
- 3점 장식은 캐러셀 인디케이터가 아니라 크기가 커지는 **정적 데코**다. 화면 전체는 단일 세로 스크롤이다.
- 하단 CTA `7일 무료 시작하기`는 `/subscription/plans`로 navigate한다. **"7일"은 `product.trialDays`로 동적 렌더링**하고, 값이 없으면 트라이얼 언급 없는 문구로 폴백한다.

### 5. web-ui-kit 신규/확장 및 에셋

| 항목                 | 조치                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `PromoBanner`        | 신규 (composites/feedback)                                                                            |
| 플랜 비교 카드       | 신규 (composites/subscription) — 배지 + 제목 + 항목 리스트 + 옵셔널 미디어. 기존 `BenefitItem` 재사용 |
| `CollapsibleSection` | `description` · `footer` prop 추가                                                                    |
| 라임 원형 체크       | 아이콘 리소스로 추출 (현재 `lucide-react` 직접 사용)                                                  |
| 클라우드 일러스트    | 신규 asset — 102px(안내화면) / 소형(배너)                                                             |
| 안내화면 앱 스크린샷 | 신규 이미지 asset (196×229)                                                                           |

### 범위 제외

- `apps/desktop-web`의 `CloudRail` / `useCloudSwitchFlow`는 이번 범위에서 제외한다.
- 결제·IAP 로직, `SubscriptionSelectDialog`, `EmailVerifyDialog` 내부 변경 없음.
- 세션 전환 파이프라인(`switchCloudSession`, `logoutCloudSession`) 변경 없음.

## 대안 (Alternatives)

- **중계 홈 Place 섹션 유지, 배너만 추가** — Figma와 불일치하고, 중계에서 플레이스가 항상 1개·자동 연결이라 리스트가 정보를 더하지 않는다. 기각.
- **플레이스 내용물 유무에 따른 조건부 숨김** — 중계 플레이스가 1개로 고정이므로 분기할 이유가 없다. 상태에 따라 레이아웃이 흔들리는 비용만 남는다. 기각.
- **시트 탭 구조 유지** — 세 그룹(중계 / 소유 / 초대)을 한 화면에서 동시에 스캔할 수 없고, 초대 개수를 배지로 따로 표현해야 한다. 기각.
- **안내화면을 클라우드 추가 플로우 앞단에 삽입** — 검증된 IAP 구매 전환 경로에 스텝을 추가하는 리스크가 크다. 별도 진입만 채택. 기각.
- **안내화면으로 기존 `/subscription` 개편** — 그 화면은 구독 상태 관리 역할이라 신규 사용자용 안내와 목적이 다르다. 기각.
- **배너 dismiss 영구 저장 / 세션 한정** — 영구는 재유입 기회를 잃고, 세션 한정은 너무 자주 뜬다. 24시간 TTL 채택. 기각.
- **시트 이름 편집 연필 유지** — Figma 3개 시안 모두에 없고, 마이페이지에 이미 이름 변경 경로가 있다. 기각.
- **"7일" 문구 하드코딩** — 상품 설정과 어긋나면 허위 고지가 된다. `trialDays` 연동 채택. 기각.
- **desktop-web 동시 반영** — 좌측 레일 구조라 섹션화 디자인을 그대로 옮길 수 없고 별도 설계가 필요하다. 다음 트랙으로 분리. 기각.

## 결과 (Consequences)

얻는 것:

- 중계 홈이 `Chat` 한 섹션으로 단순해지고, 남은 여백을 구독 유도 배너가 사용한다.
- 전환 시트에서 중계·소유·초대 클라우드를 한 화면에서 동시에 확인할 수 있고, `＋ 클라우드 추가`가 항상 보이므로 클라우드를 이미 보유한 사용자의 추가 구독 경로가 열린다.
- 신규 사용자가 클라우드 가치를 이해할 수 있는 안내 화면이 생긴다.
- `PromoBanner`, 플랜 비교 카드, `CollapsibleSection` 확장이 web-ui-kit 공용 자산으로 남는다.

감수하는 트레이드오프:

- **문서 갱신 필요**: ADR-0014 항목 4의 중계 표기와 `apps/web/docs/feature/home/README.md` 중계 사양(기본 플레이스 노출)이 이 ADR로 대체된다.
- **중계에서 `/place/:id` 홈 진입점 소멸** — 헤더 프로필 드롭다운과 딥링크만 남는다. 중계 플레이스 설정에 접근하려면 드롭다운을 알아야 한다.
- **시트 내 이름 변경 회귀** — `CloudNameEditDialog` 삭제로, 이름을 바꾸려면 마이페이지까지 이동해야 한다.
- **웹/데스크톱 전환 UI 언어 불일치** — desktop-web이 따라오기 전까지 두 플랫폼의 클라우드 전환 UX가 다르다.
- **"7일" 카피가 IAP 상품 설정에 종속** — `trialDays` 변경 시 문구가 함께 바뀌고, 값이 비면 폴백 문구가 노출된다.
- **배너 24시간 TTL은 기기 로컬 시계 기준** — 시계 조작으로 우회 가능하나, 프로모션 배너라 허용한다.
- **번들 크기 증가** — 안내화면 앱 스크린샷 이미지 에셋이 추가된다.
