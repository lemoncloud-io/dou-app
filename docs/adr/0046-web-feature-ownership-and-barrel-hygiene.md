# ADR-0046: apps/web의 컴포넌트 소유권을 도메인 피처로 정리하고, 배럴이 무거운 모듈을 재수출하지 않게 한다

> 상태: Accepted · 결정일: 2026-08-06
> 관련: [ADR-0013](./0013-home-screen-web-ui-kit-migration.md) (web-ui-kit 우선) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md) (데이터 표면 통합)

## 맥락 (Context)

`apps/web`의 다이얼로그·공통 컴포넌트 위치와 import 경로를 점검한 결과, 세 가지가 확인됐다.

### 1. `features/home`이 다른 피처의 부품 창고가 됐다

home은 다이얼로그 9개로 최다 보유이고, 그중 일부를 다른 피처가 가져다 쓴다. `place`·`auth`·
`subscription` 피처가 이미 존재하는데도 그 도메인의 컴포넌트가 home에 산다.

| home에 있는 것                          | home 밖 실사용                              |
| --------------------------------------- | ------------------------------------------- |
| `PlaceProfileCreateDialog`              | channels/pages, invite/accept, invite/pages |
| `PlaceProfileEditDialog`                | channels/pages                              |
| `PlaceProfileForm` (+ `FormDialog`)     | place/pages                                 |
| `EmailVerifyDialog` (+ `email-verify/`) | subscription/pages                          |
| `home/hooks` 7개                        | place, search, **ui/layouts**               |
| `home/lib` 3개                          | place, search, **app/hooks**                |

반면 `CreatePlaceDialog`·`CreateChannelDialog`·`CloudSessionSheet`·`SubscriptionRequiredDialog`·
`SubscriptionSelectDialog`·`ChannelList`·`PlaceList`는 **home 전용**이다(외부 참조로 보였던 4건은
전부 주석 언급이었다). 즉 문제는 "home이 크다"가 아니라 **소유권 기준이 없어 처음 필요했던 자리에
그대로 남은 것**이다.

### 2. 공용 레이어가 피처를 역참조한다

`ui`/`app/hooks`/`app/utils`는 피처보다 하위 레이어인데 features를 참조하는 지점이 5곳이다.

- [ui/layouts/UnifiedLayout.tsx:7](../../apps/web/src/app/ui/layouts/UnifiedLayout.tsx) →
  `features/home/hooks` — 하단 네비 배지의 안읽음 총계를 얻으려 3개 훅을 쓴다. 홈 전용 로직이
  아니라 앱 전역 집계다.
- [app/hooks/useActivePlaceName.ts:7](../../apps/web/src/app/hooks/useActivePlaceName.ts) →
  `features/home/lib`
- [app/utils/webVitals.ts:6](../../apps/web/src/app/utils/webVitals.ts) → `features/debug`
- `runtime/AppRuntime.tsx` → `features/home`, `features/issue-report`
- `runtime/InvitedCloudColdSyncRunner.tsx` → `features/notifications`

다만 마지막 둘은 성격이 다르다 — 런타임 호스트가 피처의 Runner를 **마운트하는 조립(composition
root)** 이므로 피처를 아는 것이 정상이다. 위반은 앞의 셋이다.

### 3. 배럴 우회가 10곳 넘게 반복되지만, 원인은 소스가 아니라 테스트 설정이다

"배럴 대신 직접 경로"라는 주석이 같은 이유로 10곳 이상 반복된다(`ui/layouts`·`ui`·`hooks`·
`bridge`·`channels/components` 배럴). 개별 판단이 아니라 증상이며, 뿌리는 두 개의 설정 결함이다.

- **`@chatic/assets` 매핑 오류.** `jest.config.js`의 greedy mapper
  `'^@chatic/(.*)$' → '<rootDir>/../../libs/$1/src/index.ts'`가 `@chatic/assets`를
  `libs/assets/src/index.ts`로 보낸다. 그러나 `tsconfig.base.json`은 이 별칭을 **리포 루트의
  `assets/src/index.ts`** 로 정의하고 `libs/assets`는 존재하지 않는다. `@chatic/ui-kit/*`는 예외를
  뒀는데 `assets`가 빠진 것이다. → `ui/layouts` 배럴이 `PrivateLayout → @chatic/assets`를 끌고
  오는 순간 테스트가 깨진다.
- **`import.meta`가 CJS로 컴파일된다.** `tsconfig.spec.json`이 `"module": "commonjs"`라
  `libs/web-core`의 `webTransport.ts`(`import.meta.env`)를 ts-jest가 파싱하지 못한다. → `hooks`·
  `ui` 배럴이 web-core를 끌고 오는 순간 테스트가 깨진다.

즉 **테스트 환경의 결함이 소스 구조를 왜곡해 왔다.** 프로덕션 빌드(vite)는 두 경우 모두 정상
동작한다.

### 제약

- `apps/web` 한정이다. `libs/web-core`는 desktop-web과 공유하므로 이번에 건드리지 않는다.
- PR [#414](https://github.com/lemoncloud-io/dou-app/pull/414)가 열려 있다. 이 리팩터링은 파일
  이동 + import 갱신으로 광범위한 diff를 만들므로 그 PR 이후에 착수한다.

## 결정 (Decision)

### 1. 공유 컴포넌트는 presentational과 도메인으로 분해해 각자의 자리로 보낸다

[directory-structure.md](../../apps/web/docs/architecture/directory-structure.md)가 이미 **feature
간 직접 import를 금지**하고 `ui/`를 presentational로 한정하며 `shared/`도 금지한다. 그래서 "도메인
로직을 가진 공유 컴포넌트"에게 허용된 자리가 없었고, 그것이 home 창고화의 원인이다. 규칙을 뒤집는
대신 **컴포넌트를 쪼개** 각 조각이 기존 규칙을 만족하게 한다.

코드를 열어보니 분해선은 이미 그어져 있었다 — 잘못된 곳에 있었을 뿐이다.

| 조각                                      | 도메인 의존                                    | 목적지                                                          |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `PlaceProfileForm`                        | **0건** (카피 14개를 props로, `onSubmit` 주입) | `ui/components`                                                 |
| `PlaceProfileFormDialog`                  | **0건** (한 줄 래퍼)                           | `ui/components`                                                 |
| `PlaceProfileCreateDialog` / `EditDialog` | `useRuntimeRepositories` → `setMyProfile`      | 저장을 `app/hooks`의 훅으로 추출, 카피 프리셋은 `ui/components` |
| `EmailVerifyDialog`                       | `useVerifyEmail` (web-core)                    | 동일하게 분해                                                   |

home 전용 컴포넌트는 **옮기지 않는다**(위 표의 후자 목록).

### 1-1. `ui/`의 경계를 "presentational만"에서 "도메인 엔티티를 모른다"로 정밀화한다

기존 규칙은 현실보다 엄격해 아무도 지키지 못했다 — `ui/components`의 `ReportIssueDialog`(
`reportIssue`), `ServiceUnavailableOverlay`(`useServiceUnavailable`), `Sidebar`(`useSessionLogout`)가
이미 web-core/app-runtime에 의존하고, i18n은 10개 파일이 쓴다. 지킬 수 없는 규칙은 두 가지 회피를
낳았다: 도메인 컴포넌트를 home에 방치하는 것과, `ui/`에 조용히 의존을 추가하는 것.

새 기준: **`ui/`는 앱 수준 관심사(세션, 서비스 상태, 환경설정, i18n)를 알아도 되지만 특정 도메인
엔티티(place·channel·chat·profile) 지식은 갖지 않는다.** 이 기준으로 위 세 개는 위반이 아니고,
`setMyProfile`을 호출하는 래퍼는 여전히 배제된다.

### 2. 두 영역 이상이 쓰는 훅·유틸은 `app/hooks` · `app/utils`로 승격한다

- `useActiveCloudChannels` · `useChannelUnreads` · `useMyJoins` (ui/layouts + place + home)
- `useHomeChannels` · `useLastChat` (place)
- `useCachedCloudNames` · `useInvitedClouds` (search)
- `countUnread` · `readCursorOf` · `sortChannels` · `resolvePlaceDisplayName` → `app/utils`

`app/hooks`는 이미 `useMyProfile`·`useActivePlaceName`·`useRelayInvites` 같은 도메인 훅을 담고
있어 새 레이어가 아니다. 이 승격으로 `ui/layouts → app/hooks` 방향이 되어 맥락 2의 위반 셋이
사라진다.

### 3. 레이어 방향 규칙을 명시한다

- `ui` · `app/hooks` · `app/utils` · `stores`는 **`features/`를 import하지 않는다.**
- 예외는 **composition root** 뿐이다: `app.tsx`, `runtime/*`는 피처의 Runner·라우트를 조립하므로
  피처를 알아도 된다.
- **feature 간 직접 import 금지는 유지한다** — 결정 1의 분해가 그 금지를 지킬 수 있게 만드는
  수단이다.

### 4. 배럴은 무거운 모듈을 재수출하지 않는다 (+ 설정 결함 하나는 설정으로 고친다)

- `jest.config.js`에 `'^@chatic/assets$'` 매핑을 greedy 패턴보다 앞에 추가한다. 이것만으로
  `ui/layouts`·`ui` 배럴 우회의 근거가 사라진다.
- `import.meta`를 끌고 오는 배럴(`hooks`, `bridge`, 그 외 web-core에 닿는 것)은 **배럴에서 그
  모듈을 분리**한다. `libs/web-core`를 고치거나 jest를 ESM으로 전환하는 쪽은 desktop-web까지
  파급되므로 이번 범위에서 제외한다.
- 정리 후 남는 직접 경로에는 **이유 주석을 달지 않는다** — 이유가 사라졌으면 배럴을 쓴다. 주석이
  필요하다는 것은 아직 원인이 남아 있다는 신호로 읽는다.

### 범위에서 제외

- 내부 path alias(`@/features/...`) 도입. `../../../`가 200건이지만 tsconfig·vite·jest 세 곳을
  맞춰야 하고 diff가 이동 diff와 섞여 리뷰가 불가능해진다. 별도 트랙으로 미룬다.
- `libs/web-core`의 `import.meta` 사용 방식 변경.
- `features/shared` 같은 새 공용 피처 레이어 신설.

## 대안 (Alternatives)

- **컴포넌트를 통째로 도메인 소유 피처로 이동**(`PlaceProfile*` → `features/place`) 후 다른 피처가
  그것을 import — 이동량이 가장 적지만 `directory-structure.md` §2의 "feature 간 직접 import 금지"를
  뒤집어야 한다. 인터뷰 초반에 이 안을 추천했으나, 기존 문서를 확인한 뒤 기각했다: 그 금지는
  junk-drawer 방지와 함께 이 문서의 근간이고, 한 번 열면 "의미가 통하는 방향"이라는 주관적 기준만
  남는다.
- **컴포넌트를 통째로 `ui/components`로 승격** — 피처 간 import는 사라지나 `ui`가 도메인
  (`setMyProfile`)을 알게 된다. 분해하면 같은 이득을 얻으면서 경계를 지킬 수 있어 기각.
- **`features/shared` 신설** — 경계는 명확해지지만 "어디에 둘지 모호한 것"의 새 집합소가 되어
  home 창고화를 이름만 바꿔 반복할 위험이 크다. 기각.
- **훅·유틸을 `features/channels`로** — 대부분 채널 관련이라는 점은 맞지만, `ui/layouts →
features/channels`가 되어 방향 위반이 이름만 바뀐다. 기각.
- **`UnifiedLayout`이 안읽음 총계를 props로 받기** — 셸이 데이터를 모르게 하는 가장 이상적인 안
  이지만, 모든 라우트 호스트가 주입해야 해 수정 범위가 오히려 넓어진다. 기각.
- **설정만 고쳐 배럴을 전부 살리기** — 가장 근본적이나 `libs/web-core`의 `import.meta`를 손대야
  하고 그건 desktop-web 공유 라이브러리다. 이번 트랙 밖으로 미룸.
- **파일 이동만 하고 배럴은 그대로** — 변경이 짧지만 우회 10곳이 남아 같은 불일치(같은 컴포넌트를
  배럴/직접 경로 두 방식으로 import)가 재발한다. 기각.

## 결과 (Consequences)

- `features/home`이 홈 화면의 것만 갖게 되고, 다른 피처는 도메인 소유자를 참조한다. 소유권 기준이
  글로 남아 다음에 컴포넌트를 놓을 자리를 판단할 수 있다.
- 공용 레이어 → 피처 역참조 셋이 사라지고, 남는 둘(composition root)은 규칙상 허용으로 명시된다.
- 배럴 우회 주석이 대부분 사라지고, 같은 대상을 두 경로로 import하는 불일치가 정리된다. 남은
  직접 경로는 "이유가 아직 있는 곳"이라는 신호가 된다.
- **트레이드오프**
    - 파일 이동 + import 갱신으로 diff가 넓다(테스트 파일 포함 20개 이상). 기능 변경이 없으므로
      리뷰는 "이동과 경로만인지" 확인이 핵심이고, 그래서 alias 도입을 같은 PR에 섞지 않는다.
    - `app/hooks`가 커진다(현재 13 → 20개 내외). 도메인별 하위 폴더 분리는 필요해지면 그때 한다.
    - `import.meta` 뿌리는 남는다. `hooks`·`bridge` 배럴을 슬림하게 유지해야 하는 제약이 계속
      존재하며, 새 배럴을 만들 때도 같은 주의가 필요하다.
    - 이동 대상 파일에 열린 작업이 있으면 충돌한다 — PR #414 머지 이후 착수를 전제로 한다.
