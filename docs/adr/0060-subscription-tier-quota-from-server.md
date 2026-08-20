# ADR-0060: 구독 tier와 클라우드 한도의 출처를 서버 상품 목록으로 옮기고, 등급 변경을 앱 안에서 인접 1칸으로 연다

> 상태: Accepted · 결정일: 2026-08-13
> 관련: [ADR-0042](./0042-account-linking-unified-path-migration.md) (소셜 연동 자격) ·
> [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (피처 소유권·배럴 위생) ·
> [ADR-0034](./0034-relay-home-cloud-sheet-and-cloud-guide-redesign.md) (클라우드 시트·안내 화면)
>
> 기획 정본: `plan/features/subscription/` (README·product-pricing·purchase-flow·subscription-lifecycle) ·
> `plan/features/cloud.md` · 백엔드 정본: `chatic-backend-api/docs/spec/subscription/`

## 맥락 (Context)

기획은 구독 상품을 **DoU Pro 하나, tier 1~5 = 동시 보유 클라우드 수 1~5개**로 확정했다. 그런데
앱은 tier1 하나만 팔 수 있는 상태로 굳어 있다. 코드와 서버를 대조해 보니 병목이 앱 한쪽에 있었다.

### 1. 서버는 이미 tier 1~5을 준비해 뒀다

`chatic-backend-api`의 `data/product-config.json`에 apple·google × dev·prod × tier1~5 = **20개
상품이 전부 등록**돼 있다. `maxClouds` 1~5, `sort` 1~5, `trialDays`는 tier1만 7일이고 상위 tier는 0이다.

`GET /products/plans?platform=` 은 `platform`과 `stage`(`application`의 `.dev` 접미사)를 **양쪽 다
필터한다**(`proxy.ts` `listPlans`). 즉 tier2~5 판매에 필요한 서버 작업은 없다.

### 2. 앱이 그 목록을 쓰지 않고 상수 하나로 좁힌다

- `ALLOWED_PRODUCT_ID_IOS/ANDROID` 가 `features/subscription/consts/index.ts` 와
  `features/home/components/subscription-select/helpers.ts` **양쪽에 복사**돼 있다.
- 한도가 `MAX_CLOUDS = 1`(`features/home/hooks/useAddCloudFlow.tsx`)과
  `clouds.length >= 1`(`SubscriptionPlansPage.tsx`) 두 군데에 박혀 있다.
- 이 좁히기의 근거로 달린 주석 —
  `useAllowedProduct.ts`의 "`GET /products/plans` does not filter by platform" — 은 **사실과
  다르다**. 서버는 필터한다. 잘못된 전제 하나가 tier 확장을 막고 있었다.

### 3. 등급 변경 경로가 web에만 없다

네이티브 `SubscriptionIapService`는 `getReplacementMode()`로 업/다운그레이드를 이미 판별하고,
브리지 계약(`PurchasePayload`)도 `oldPlanId`/`newPlanId`를 받도록 정의돼 있다. 그런데
`useSubscriptionIap.purchaseAndValidate`가 `oldPlanId`를 넘기지 않는다. Android에서 이 값이 없으면
등급 교체가 아니라 신규 구매로 간다.

### 4. 인접 1칸 제약을 강제하는 주체가 없다

`calcNeededClouds`는 `maxClouds - cloudNo`만 계산하고 tier 점프를 검사하지 않는다. 양 스토어도
서열 점프를 허용한다. 즉 **인접 제약은 순수하게 앱 정책**이고, 그 실질적 근거는 클라우드마다
이메일 인증이 하나씩 붙는다는 것이다 — tier1→tier3 점프는 인증을 연달아 두 번 시킨다.

### 5. 이메일 재사용은 "미결"이 아니라 코드에 반쯤 막혀 있다

백엔드 `verifyEmail`의 `confirm` 단계는 email 계정 레코드에 `verify$.cloudId`를 **한 개만** 기록하고,
`release`가 그 포인터로 cascade를 정리한다(`proxy.ts:190`, `:356`). 같은 이메일로 두 번째 클라우드를
인증하면 예외는 없지만 첫 클라우드의 포인터가 덮이고 해지 cascade가 어긋난다. 허용도 차단도 아닌
상태다. 기획이 "tier 2 이상 판매의 선결 조건"이라 적은 항목이 코드에도 그대로 미완으로 남아 있다.

### 6. 초과 클라우드를 정리하는 것이 아무도 없다

앱에는 release 호출(`useDeleteCloud`)만 있고 다운그레이드 후 선택·유예 흐름이 없다. 서버에도 자동
정리가 없다. 다운그레이드가 확정되면 한도만 줄고 초과 클라우드는 `active`로 남는다.

### 제약

- **화면은 이번 범위가 아니다.** API 연동과 판정 로직이 먼저이고, 화면은 후속 트랙에서 이 훅·함수를
  소비한다.
- `libs/subscriptions` 는 web-core를 재수출하는 빈 배럴이지만
  `apps/desktop-web/.../useRemoveCloud.ts` 가 소비한다. desktop-web은 참조 전용이라 배럴을 지울 수 없다.
- 프로덕션 상품 설정에 **오타**가 있다: `pro-tier-04`의 `planId`가 `prdou_pro_subscription`
  (나머지는 전부 `dou_pro_subscription`). tier4 Android 프로덕션 결제가 깨진다. 앱에서 우회할 수 없다.
- 기획과 백엔드 문서가 다운그레이드 폭에서 모순한다: `product-pricing.md`는 "여러 단계 한 번에",
  `scenario.md` §3은 "바로 아래 단계로만".

## 결정 (Decision)

### 1. tier 목록·한도·서열의 출처를 서버 상품 목록 하나로 만든다

`ALLOWED_PRODUCT_ID_*` 상수(중복 2쌍 전부)와 `MAX_CLOUDS = 1`, `clouds.length >= 1`을 폐기한다.

| 값                    | 새 출처                                                      |
| --------------------- | ------------------------------------------------------------ |
| 판매 가능한 tier 목록 | `GET /products/plans?platform=apple\|google` 전체            |
| 클라우드 보유 한도    | `membership.product$.maxClouds`                              |
| tier 서열             | `product.sort`                                               |
| 무료체험 일수         | `product.trialDays` (0이면 일수를 언급하지 않는 문구로 폴백) |

한도 판정은 **훅 하나**로 모으고 모든 "＋ 클라우드 추가" 진입점이 그것만 쓴다. 기획의 방침대로
버튼을 숨기지 않고 상한 도달 시 이유를 알린다.

이 결정은 기획 결정대기의 "상품 목록의 관리 주체"를 **서버로** 자연 해소한다 — tier 구성·가격·체험
문구 변경에 앱 배포가 필요 없어진다.

### 2. 등급 변경을 앱 안 등급 선택 화면에서 양방향으로 연다

업그레이드·다운그레이드 모두 앱에서 진입한다. 스토어 구독 관리로 넘기지 않는다.

- **이번 트랙은 업·다운 모두 인접 1칸만 허용한다** (`sort` 차이가 1인 상품만 선택 가능).
- Android 등급 교체 시 `purchase`에 **`oldPlanId`를 반드시 실어** 보낸다. 없으면 신규 구매로 처리된다.
- **등급 변경에는 항상 `androidOfferToken.base`를 쓴다.** 현재의 `freeTrial ?? base`는 신규 구독
  전제이며, 체험은 tier1 최초 구독 1회뿐이다.
- 청구 방식이 플랫폼마다 다르므로(iOS는 비례 환불 후 전액 즉시 청구 + 갱신일 리셋, Android는 차액
  즉시 청구 + 청구주기 유지) 안내 문구를 플랫폼별로 분기한다.

다운그레이드를 인접 1칸으로 잠그는 것은 **기획 정책(여러 단계 허용)에서 이번 트랙에 한해 좁힌
것**이다. 해지 실행 UI가 없는 동안 초과 클라우드를 최대 1개로 제한하기 위한 안전장치이고, 해지 UI가
나오면 잠금을 푼다.

### 3. 클라우드 이메일은 클라우드마다 새 이메일을 요구한다

백엔드의 account↔cloud 1:1 포인터 구조를 그대로 전제한다. 앱은 보유 클라우드의 `email` 목록과
대조해 **입력 시점에 재사용을 거부**하고 이유를 안내한다 — 409를 기다려 인증 코드 발송 뒤에
실패시키지 않는다.

백엔드가 account↔cloud를 1:N으로 고치면 이 결정을 뒤집는다.

### 4. 초과 클라우드는 감지·노출까지만 한다

`보유 수 > maxClouds` 판정과 초과 대상 식별을 순수 함수로 두고 훅으로 노출한다. **release 실행은
기존 `useDeleteCloud` 경로를 그대로 쓰고**, 초과 정리 전용 선택 화면은 후속 화면 트랙에서 붙인다.

되돌릴 수 없는 삭제를 앱 로직이 밀어붙이지 않는다는 것이 이 선택의 이유다. 다만 서버 자동 정리가
없는 동안 초과 상태가 눈에 보이지 않으면 아무도 모르는 수익 누수가 되므로, **감지 결과의 노출은
빼지 않는다.**

### 5. 구독 상태 판정을 4종 순수 함수로 고정한다

기획의 4상태(미구독 / 이용 중 / 해지 예약 / 만료)를 `MembershipView`에서 계산하는 함수 하나로 만든다.

- **결제 실패 유예 구간은 별도 상태가 아니라 '이용 중'** 이다 — 유효기간이 아직 지나지 않았기 때문.
  과거의 "결제 실패 후 N일" 같은 앱 자체 컷은 두지 않는다.
- 체험 중이면 종료까지 남은 일수를, 해지 예약이면 종료일을, 등급 변경 예약(`pendingProductId`)이
  있으면 "다음 갱신 시 변경"을 함께 계산해 내보낸다.

현재 `SubscriptionPage`는 `isActive || isExpired`로 분기해 해지 예약만 있는 경우가 빈 상태로 빠진다.
판정을 함수로 분리해 화면이 이 분기를 다시 쓰지 않게 한다.

### 6. 도메인 순수 로직은 `apps/web/features/subscription` 에만 둔다

tier 서열·인접 판정·초과 판정·상태 4종 판정·체험 표기 폴백은 모두 이 피처 안에 산다. API·훅은
`libs/web-core`에 있는 것을 그대로 쓴다. `libs/subscriptions` 배럴은 desktop-web 소비자가 있으므로
**손대지 않는다**.

이에 따라 `features/home`의 `SubscriptionSelectDialog`와 `subscription-select/helpers.ts`를
`features/subscription`으로 이관한다. ADR-0046은 그 다이얼로그를 "home 전용"이라 남겨뒀지만 근거는
외부 참조가 없다는 것이었고, 이제 tier 도메인 의존이 생겼으므로 같은 ADR의 소유권 기준(도메인
의존이 있는 것은 그 도메인 피처로)을 적용한 결과다. 이 이관이 상수 중복도 함께 없앤다.

### 7. 검증 경로와 DEV dryRun은 현행을 유지한다

`POST /validate/{platform}` → `POST /memberships/0` 이중 호출을 그대로 둔다. DEV의
`dryRun: 1`도 그대로 둔다.

### 범위에서 빠지는 것

- 초과 클라우드 정리 실행 UI, 유예 길이, 자동 정리 기준 — 서버 소관 + 후속 화면 트랙
- 서버 기점 정기 재조회(CRON) — 백엔드 소관. `GET /memberships/0/mine`이 `detail=1` 기본이라
  **앱 기점 재조회는 이미 성립**하며 앱이 할 일이 없다
- 환불 실시간 회수, 관리자 강제 취소의 우선순위 — 백엔드 미결
- 모든 화면 작업 (구독 카드·등급 비교·구독 관리 화면 리디자인)

## 대안 (Alternatives)

**`POST /memberships/0` 단일 경로로 통합** — 버렸다. 백엔드 `doPost`가 내부에서 iap-api validate를
동기 호출하고 `auto=1` 기본으로 클라우드 make까지 enqueue하므로 앱의 iap 직접 호출은 중복이고, iap
엔드포인트를 앱 표면에서 뗄 수 있었다. 그러나 통합하면 스토어 검증 실패의 원인을 앱이 세분해
안내하기 어려워진다. 결제 직후는 사용자가 가장 예민한 구간이므로 호출 한 번을 아끼기보다 실패
구분을 남기기로 했다. 감수하는 것: 호출 2회와 서버의 중복 검증.

**`libs/subscriptions`를 실체화하거나 `libs/web-core`에 합치기** — 버렸다. 어느 쪽이든 desktop-web과
공유하는 표면을 넓힌다. desktop-web은 참조 전용이고 선재 타입 부채가 있어, 이번 트랙의 변경이 그쪽
빌드를 흔들 위험을 만들지 않는다.

**기획대로 여러 칸 다운그레이드 허용** — 버렸다. tier5→tier1이 초과 클라우드 4개를 한꺼번에 만드는데,
해지 실행 UI가 없는 동안 사용자가 그것을 직접 정리할 수단이 없다. 되돌릴 수 없는 삭제를 여러 건
동시에 요구하는 화면은 그 화면이 준비된 뒤에 연다.

**앱이 서버 정기 재조회를 대신 폴링** — 버렸다. 앱을 열지 않는 유저가 문제인데 앱 폴링으로는 그
유저에게 도달할 수 없다. 구조적으로 서버 몫이다.

**`ANDROID_PLAN_LIST` env 순서 의존을 서버 `sort`로 대체** — 이번 범위 밖. 네이티브
`getReplacementMode`가 env 목록 순서로 rank를 계산하므로 그 순서가 tier 순서와 어긋나면 업/다운이
뒤집힌다. 고치려면 브리지 계약에 replacementMode를 직접 싣는 변경이 필요하다. 지금은 `oldPlanId`를
정확히 넘겨 판정이 성립하게만 하고, 부채로 기록한다.

## 결과 (Consequences)

**얻는 것**

- tier1 하드코딩과 상수 중복이 사라지고, tier2~5 판매가 서버 작업 없이 열린다.
- 상품 구성·가격·체험 문구 변경에 앱 배포가 필요 없어진다.
- 한도 판정과 상태 판정이 각각 한 곳에만 있어, 진입점이 늘어도 규칙이 갈라지지 않는다.
- 등급 변경이 앱 안에 들어와 다운그레이드 사전 공지와 초과 예정 안내를 붙일 자리가 생긴다.

**감수하는 트레이드오프**

- **다운그레이드 인접 1칸은 기획 정책과 다르다.** 임시 잠금임을 기획 문서에 예외로 명시해야 하고,
  백엔드 `scenario.md` §3의 "바로 아래 단계로만" 서술과 기획의 "여러 단계" 중 어느 쪽이 정본인지는
  여전히 합의가 남는다.
- **tier5까지 가려면 이메일이 5개 필요하다.** 등급 상향의 마찰이 크고 전환율을 깎는다. 백엔드
  account↔cloud 1:N 수정이 나오기 전까지 이 마찰이 tier2+ 판매의 실질적 상한이다.
- **초과 클라우드는 감지만 되고 방치된다.** 서버 자동 정리 도입 전까지 "돈은 tier1인데 클라우드를
  더 쓰는" 창이 남는다. 감지 결과를 노출해 눈에 보이게 하는 것이 이번의 완화 전부다.
- **DEV dryRun 유지로 tier2~5 클라우드 생성 경로가 dev에서 검증되지 않는다.** 프로덕션 첫 결제가
  사실상 첫 검증이 된다. 프로덕션 릴리스 전에 별도 확인 구간을 잡아야 한다.
- `ANDROID_PLAN_LIST` env 순서 의존이 남는다.
- 이중 검증이 남아 스토어 검증이 두 번 일어난다.

**다른 팀에 넘겨야 하는 것**

- 백엔드: 프로덕션 `pro-tier-04`의 `planId` 오타(`prdou_pro_subscription`) 수정 — **tier4 Android
  프로덕션 결제가 깨진 상태**이며 앱에서 우회할 수 없다.
- 백엔드: `scenario.md` §3의 다운그레이드 폭 서술을 기획과 맞추기.
- 백엔드: account↔cloud 1:N(이메일 재사용) 지원 여부 — tier2+ 전환율의 상한을 정하는 값.
- 백엔드: 정기 재조회 CRON과 만료 시 클라우드 자동 정리.

## 구현 중 확인된 정정 (2026-08-13)

구현 트랙에서 이 ADR의 전제 셋이 코드와 어긋나는 것이 확인됐다. 결정 자체는 유지되고 수단만 바뀐다.
상세는 [tier-and-quota.md](../../apps/web/docs/feature/subscription/tier-and-quota.md)가 정본이다.

1. **한도 출처.** 결정 1의 표는 클라우드 한도를 `membership.product$.maxClouds`로 적었으나, 백엔드는
   상품을 head로만 붙인다(`proxy.ts:1060` `asHead`). `ProductHead`에는 `maxClouds`가 없고,
   `MembershipView.product$`가 더 넓은 `ProductView`로 선언돼 있어 **타입은 통과하고 런타임에 조용히
   `undefined`** 가 된다. 실제 출처는 `membership.productId`를 `GET /products/plans` 결과와 조인한
   값이다.
2. **해지 예약의 자격.** 백엔드 `isValid`는 `canceledAt > 0`이면 false다(`proxy.ts:717`). 해지 예약
   구간의 자격 판정에 이 값을 쓰면 아직 결제된 기간인데 한도가 0이 되어 보유 클라우드가 초과로 잡힌다.
   자격은 유효기간 잔존으로 판단하고, **새 클라우드 생성만** 서버 `guardQuota`와 같은 기준(`isValid`)
   으로 막는다.
3. **구매 한 번 = 클라우드 하나.** `POST /memberships/0`은 `needed > 0`일 때 `clouds/{userId}/make`를
   한 번만, body의 이메일 하나로 enqueue한다. tier2~5를 팔아도 두 번째 이후 클라우드를 만들 경로가
   앱에 없었으므로, `POST /clouds/0/make`(`makeCloud`/`useMakeCloud`)를 `libs/web-core`에 추가했다.
   결정 1의 "tier2~5 판매가 열린다"가 성립하기 위한 전제다.

## 결정 번복: 멤버십 검증의 DEV dryRun 제거 (2026-08-19)

결정 7("DEV `dryRun: 1`도 그대로 둔다")을 되돌린다. `POST /memberships/0`의 `dryRun`은 서버가 멤버십을
실제로 부여하지 않게 만들었고, 그 결과 **dev 빌드에서는 iOS 샌드박스 결제가 성공해도 구독이 앱에
반영되지 않았다.** 구매복원도 같은 경로를 타므로 함께 무력화됐다. 리스크 항목에 적어둔
"프로덕션 첫 결제가 사실상 첫 검증"이 실제 비용으로 돌아온 셈이다.

`apps/web/.../hooks/useSubscriptionIap.ts`의 `validateMembership` 호출에서 `dryRun`을 뺀다. dev에서도
구독이 실제로 부여되고, 그에 딸린 첫 클라우드 make도 실제로 enqueue된다.

`useAddCloud`의 `dryRun`은 **유지한다.** 이쪽은 tier2+ 에서 클라우드를 추가로 만드는 경로라, 결정 7의
"dev가 실제 인프라를 프로비저닝하지 않는다"는 원래 의도가 그대로 유효하다. 결과적으로 dev는 구독
자체와 첫 클라우드까지는 실검증하고, 두 번째 이후 클라우드 생성은 여전히 미검증으로 남는다.

## 다음 단계

구현은 완료됐다([tier-and-quota.md](../../apps/web/docs/feature/subscription/tier-and-quota.md)).
화면 작업은 별도 트랙이며, 이 트랙이 내보내는 훅·순수 함수를 소비하는 형태가 된다.
