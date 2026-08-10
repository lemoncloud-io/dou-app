# ADR-0047: 플레이스 정보(읽기 전용) 화면을 신설하고, 기존 편집 화면을 `edit`으로 개명한다

> 상태: Accepted · 결정일: 2026-08-07
> 관련: [ADR-0045](./0045-relay-default-place-scoping-profile-step-and-avatar-unification.md) (기본플레이스 relay 스코핑·아바타 통합) · [ADR-0031](./0031-place-settings-hub.md) (플레이스 설정 허브·`isOwner` 권위) · [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit 우선)

## 맥락 (Context)

Figma에 "플레이스 정보" 화면 4개 변형이 정의됐다 — 플레이스 아바타, 플레이스 이름, 만든 날짜,
소유자 정보(아바타 + 방장 뱃지 + 이름)를 보여주는 **읽기 전용** 화면이다.

| Figma 노드                                                                               | 조건           | 이름 라벨            | 하단 액션        |
| ---------------------------------------------------------------------------------------- | -------------- | -------------------- | ---------------- |
| [3769-34116](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34116) | relay + 비오너 | 초대된 플레이스 이름 | 없음             |
| [3769-34207](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34207) | relay + 오너   | 플레이스 이름        | 신고 관리        |
| [3692-10303](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3692-10303) | cloud + 비오너 | 초대된 플레이스 이름 | 플레이스 나가기  |
| [3700-11813](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3700-11813) | cloud + 오너   | 플레이스 이름        | 신고 관리 + 삭제 |

관찰된 제약과 사실:

1. **이름이 이미 점유돼 있다.** 현재 `PlaceInfoPage`는 이름·사진을 **편집**하는 화면이고
   ([PlaceInfoPage.tsx](../../apps/web/src/app/features/place/pages/PlaceInfoPage.tsx))
   `/place/:placeId/settings/info` 라우트까지 차지하고 있다. 설정 허브에서는 "플레이스 프로필"로
   불린다. Figma가 말하는 "플레이스 정보"와 코드의 `Info`가 서로 다른 것을 가리킨다.

2. **relay/cloud 분기 레버는 이미 있다.** `HOME_PLACE_ID = '0000'` / `isDefaultCloud`
   ([resolvePlaceDisplayName.ts](../../apps/web/src/app/utils/resolvePlaceDisplayName.ts))가
   기본플레이스(DoU홈) 식별과 표시 이름 브랜딩을 이미 담당한다(ADR-0045 계열).

3. **필요한 UI 부품은 대부분 있다.** `ProfileAvatar glyph="place"`(기본 아바타 =
   Figma 3408-27536 = `defaultPlaceAvatar` 애셋), `StatusBadge variant="owner"`(방장 뱃지),
   `MenuCard`/`ListRow`, `PageHeader`. 새로 필요한 리소스는 **DoU홈 고스트 아바타
   ([3769-34384](https://www.figma.com/design/ViwLfjc5Eoq7BpEXFfFj3W/DoU?node-id=3769-34384)) 하나**다.

4. **데이터 존재 여부가 미검증이다.** 타입상 `createdAt`·`ownerId`·`owner$`는 `MySiteView`에
   있으나, `user.mysite` 응답이 실제로 이 필드를 실어 오는지 확인되지 않았다. 소유자 표시 이름은
   DoU 의미론상 계정 프로필이 아니라 **플레이스 프로필**(플레이스별 닉/사진)이다.

5. **`ROUTES.place.detail`은 프로덕션 호출자가 없다.** `paths.test.ts`만 참조하고, 대응 라우트
   `/place/:placeId`는 지금 편집 화면을 렌더한다.

## 결정 (Decision)

### 1) 개명: 편집은 `edit`, 신규 읽기 화면은 `detail`

- 기존 `PlaceInfoPage` → **`PlaceEditPage`**, 라우트 `settingsInfo` → **`settingsEdit`**
  (`/place/:placeId/settings/edit`). 설정 허브의 "플레이스 프로필" 행이 여기로 간다(현행 동작 유지,
  오너 전용 게이트도 그대로).
- 신규 읽기 전용 화면 = **`PlaceDetailPage`**, 라우트 **`settingsDetail`**
  (`/place/:placeId/settings/detail`).
- 유휴 라우트 `/place/:placeId`(= `ROUTES.place.detail`)는 `PlaceDetailPage`를 렌더한다. 이름과
  실체가 처음으로 일치하고, 프로덕션 호출자가 없어 깨질 것이 없다.

### 2) 분기: 라벨은 `isOwner`, 기본 아바타는 relay/cloud

Figma 4장은 두 축의 곱이고, 각 축이 서로 다른 것을 결정한다.

- **`isOwner` 축** → 이름 라벨. 비오너는 "초대된 플레이스 이름", 오너는 "플레이스 이름". 서버
  `isOwner`가 권위다(ADR-0031).
- **relay/cloud 축** → 썸네일 부재 시의 기본 아바타. DoU홈(`HOME_PLACE_ID` / `isDefaultCloud`)은
  고스트 일러스트, 일반 플레이스는 기존 `defaultPlaceAvatar`. 표시 이름은 기존
  `resolvePlaceDisplayName`을 그대로 재사용한다("두유 홈" 브랜딩).
- **~~relay 화면의 소유자 정보 표시~~ → 기획 결정(2026-08-07):** relay는 기본플레이스 하나뿐이라
  "초대돼 들어온 곳"이 성립하지 않는다. relay 화면은 오너 변형(Figma 3769-34207)으로 고정하고,
  그 변형에서 **만든 날짜·소유자 정보 행을 아예 제거**한다. 이름 라벨은 `isOwner` 부재에도
  "플레이스 이름"을 쓴다(필드 부재의 결과가 아니라 명시적 예외). 날짜는 실측상 relay에도 오지만
  기획상 이 화면엔 안 보인다 — 데이터 유무와 무관한 결정이다.

### 3) 소유자 정보는 `ownerId` + 플레이스 프로필 조회

`place.ownerId`로 `profile.observeItem('${placeId}@${ownerId}')` 관찰 + `refreshItem`으로 보강한다.
플레이스별 닉/사진이 이 화면에서 옳은 표시값이고, 채널 멤버 목록이 이미 같은 데이터를 쓴다.
`owner$`(계정 프로필)는 쓰지 않는다.

### 4) 진입점

설정 허브([PlaceSettingsHubPage](../../apps/web/src/app/features/place/pages/PlaceSettingsHubPage.tsx))
첫 카드에 "플레이스 정보" 행을 **세 번째**로 추가한다(Figma 3408-26299 순서: 내 프로필 → 플레이스
프로필 → 플레이스 정보). 읽기 전용이므로 **오너 게이트 없이 전원에게 노출**한다. 카드 제목은
Figma를 따라 "프로필" → "설정"으로 바꾼다.

### 5) 범위

**포함**: 위 1~4, 신규 고스트 아바타 애셋(`libs/web-ui-kit/src/resources/assets`), 필요 시
web-ui-kit에 정보 행(라벨 + 값) 컴포넌트 신설, ko/en 번역 키.

**제외**: 플레이스 나가기 · 플레이스 삭제 · 신고 관리(사용자 지시로 보류). 하단 액션 영역과
구분선은 이번에 렌더하지 않는다 — 자리만 비우지 않고 아예 두지 않는다. 소개 문구(`desc`)는
Figma에 없어 넣지 않는다.

**~~미결(구현 착수 시 실측 후 확정)~~ → 해소(2026-08-07).** 실측 결과: `createdAt`은 relay·cloud
양쪽에 온다. `ownerId`·`owner$`·`isOwner`는 **cloud에만** 있고 relay 기본플레이스에는 전부 없다
(`stereo: 'domain'` 시스템 사이트). `owner$.name`은 사람 이름이 아닌 내부 식별자(`"LMN:…"`)여서
결정 3이 실측으로 정당화됐다. 결측 정책은 **행 숨김**으로 확정하고, 그 결과 relay에서는 소유자
정보 섹션을 렌더하지 않는다. Figma relay 화면(소유자 정보 섹션을 그리는 3769-34116/34207)과의
이 차이는 위 결정 2의 기획 확인으로 해소됐다 — 데이터가 없어서 감춘 것이 아니라 감추기로
결정한 것이다. 필드 표와 상세는
[place-settings.md](../../apps/web/docs/feature/place/place-settings.md) §실측.

## 대안 (Alternatives)

- **기존 `PlaceInfoPage`를 그대로 두고 신규만 다른 이름으로 추가** — 변경 파일이 가장 적지만
  `Info`가 편집을 뜻하는 어긋남이 영구화된다. 개명 비용(라우트·허브·테스트 몇 곳)이 작아 기각.
- **`place.owner$`를 그대로 표시** — 조회 1회를 아끼지만, 서버가 안 실어 주면 빈 화면이 되고
  계정 프로필이라 플레이스 닉과 다를 수 있다. 기각.
- **라벨 분기를 없애고 항상 "플레이스 이름"** — 더 단순하지만 Figma 비오너 화면과 어긋난다.
  `isOwner`는 이미 로딩되는 값이라 분기 비용이 0에 가까워 기각.
- **하단 액션(나가기/삭제/신고관리)을 비활성 상태로 미리 렌더** — 동작하지 않는 UI를 노출해
  사용자를 오해시킨다. 기각.

## 결과 (Consequences)

- **얻는 것**: 코드 용어가 Figma·기획 용어와 일치한다(`edit` = 편집, `detail` = 정보). relay/cloud
  분기가 기존 `HOME_PLACE_ID` 레버 하나에 모여 새 분기 개념이 늘지 않는다. 신규 코드 대부분이
  기존 web-ui-kit 부품 조합이라 애셋 1개 + 화면 1개가 실질 추가분이다.
- **감수하는 것**:
    - 개명이 라우트 상수·설정 허브·`paths.test.ts`·기존 페이지 테스트를 함께 건드린다(기계적이지만
      한 커밋에 묶여야 한다).
    - 소유자 표시에 프로필 조회 1회가 붙어, 캐시 미스 시 소유자 행이 이름보다 늦게 채워진다.
    - 하단 액션 3종이 빠진 화면은 Figma 대비 미완성으로 보인다. 후속 트랙에서 채운다.
    - `createdAt`/`ownerId` 결측 정책이 열려 있어, 실측 결과에 따라 이 ADR에 추가 결정이 붙을 수 있다.
