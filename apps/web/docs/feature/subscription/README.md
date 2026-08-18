# subscription

> 대상: `apps/web/src/app/features/subscription`

## 책임

구독(멤버십) 현황 표시와 플랜 선택·구매·등급 변경, 그리고 클라우드 보유 한도 판정을 담당한다.
인앱결제(IAP)는 네이티브 브릿지를 통해 수행한다.

> tier 목록·한도·서열·구독 상태 4종·초과 클라우드 판정은 [tier-and-quota.md](./tier-and-quota.md)에
> 정리돼 있다 — 이 피처의 도메인 로직 정본이다.

## 화면

| 페이지                  | 경로(`ROUTES.subscription.*`) | 설명                                                                  |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `SubscriptionPage`      | `/subscription`               | 구독 현황(상태 4종, 초과 배너, 복원, 약관)                            |
| `SubscriptionPlansPage` | `/subscription/plans`         | tier 1~5 선택 → 구매 / 등급 변경                                      |
| `CloudGuidePage`        | `/subscription/guide`         | 클라우드 안내(구독 전 가치 설명) — [cloud-guide.md](./cloud-guide.md) |

## 구조

```
features/subscription/
  pages/
    SubscriptionPage.tsx
    SubscriptionPlansPage.tsx
    CloudGuidePage.tsx        # 클라우드 안내 (읽기 전용, CTA만 plans로 navigate)
    cloud-guide/              #   PlanCompareCard · GuideBulletList (이 화면 전용 조각)
  lib/                        # 순수 판정 (React·네트워크 무지) — tier-and-quota.md
    plans.ts · quota.ts · membershipStatus.ts · nativeProducts.ts · cloudEmails.ts
  hooks/
    useSubscriptionIap.ts   # IAP: 구매·검증·복원 (appBridge 경유)
    usePlanCatalog.ts       # 상품 목록 + 현재 상품 + 상태 요약 (단일 진입점)
    usePlanOptions.ts       # tier별 선택 가능 여부·사유
    useCloudQuota.ts        # 클라우드 한도 판정 (모든 "＋ 추가"가 쓰는 하나)
    useExcessClouds.ts · useTierPurchase.ts · useAddCloud.ts
    useCloudEmailGuard.ts · useVerifyEmailCode.ts
  components/
    AddCloudFlowHost.tsx      # 클라우드 추가 요청 수신 (PrivateShell이 마운트)
    EmailVerifyDialog.tsx     # 이메일 인증 (ui/에서 이관 · web-ui-kit 조립)
    SubscriptionDebugScreen.tsx  # 디버그 오버레이가 lazy로 합성
    SubscriptionSelectDialog.tsx · TierChangeNotice.tsx · ExcessCloudBanner.tsx
    subscription-select/      #   PlanCard · PolicyFooter
  types/
    index.ts                # PurchaseProduct · NativePurchase · PurchaseError · PageState
  consts/
    index.ts                # IS_DEV · APP_ID · POLICY_BASE_URL
  routes/
  index.ts                  # SubscriptionRoutes · AddCloudFlowHost
```

- **타입은 `types/`로 통합**: `NativePurchase`는 `WebMessageResponse<'FetchCurrentPurchases'>`에서 파생해 브릿지 계약과 동기화된다.
- **상수는 `consts/`로 통합**: 환경 분기 상수(`IS_DEV`/`APP_ID`/`POLICY_BASE_URL`). 약관 URL도 `POLICY_BASE_URL` 재사용. 판매 가능한 상품 목록은 **상수가 아니라 서버**에서 온다(ADR-0060).
- **판정은 `lib/`, 데이터 결합은 `hooks/`**: `lib/`의 함수는 입력만 받는 순수 함수라 테스트가 값 비교로 끝난다.

## IAP 흐름

`useSubscriptionIap`이 구매·검증·복원을 담당한다. 모든 결제 통신은 `app/bridge` 경유다([architecture/bridge.md](../../architecture/bridge.md)).

- 구매 요청: `appBridge.purchase(...)` (void) — `Purchase`는 결과가 push로 오는 예외 케이스다.
- 결과 수신: `useOnPurchaseSuccess` / `useOnPurchaseError` push 훅. resolver ref 패턴으로 Promise화한다.
- feature에서 `webClient`를 직접 호출하지 않는다.

> 검증 흐름은 web-core 훅(`useValidateApple`/`useValidateGoogle` 등)이 남아 있으나, 일반 IAP 경로는 `useSubscriptionIap` 하나로 충분하다(개발용 API Tester 패널은 제거됨).
