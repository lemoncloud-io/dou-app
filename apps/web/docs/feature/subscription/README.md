# subscription

> 대상: `apps/web/src/app/features/subscription`

## 책임

구독(멤버십) 현황 표시와 플랜 선택·구매를 담당한다. 인앱결제(IAP)는 네이티브 브릿지를 통해 수행한다.

## 화면

| 페이지                  | 경로(`ROUTES.subscription.*`) | 설명                               |
| ----------------------- | ----------------------------- | ---------------------------------- |
| `SubscriptionPage`      | `/subscription`               | 구독 현황(현재 멤버십, 복원, 약관) |
| `SubscriptionPlansPage` | `/subscription/plans`         | 플랜 선택 → 구매 흐름              |

## 구조

```
features/subscription/
  pages/
    SubscriptionPage.tsx
    SubscriptionPlansPage.tsx
  hooks/
    useSubscriptionIap.ts   # IAP: 구매·검증·복원 (appBridge 경유)
  types/
    index.ts                # PurchaseProduct · NativePurchase · PurchaseError · PageState
  consts/
    index.ts                # IS_DEV · APP_ID · POLICY_BASE_URL · ALLOWED_PRODUCT_ID_*
  routes/
  index.ts                  # SubscriptionRoutes
```

- **타입은 `types/`로 통합**: `NativePurchase`는 `WebMessageResponse<'FetchCurrentPurchases'>`에서 파생해 브릿지 계약과 동기화된다.
- **상수는 `consts/`로 통합**: 환경 분기 상수(`IS_DEV`/`APP_ID`/`POLICY_BASE_URL`/`ALLOWED_PRODUCT_ID_*`). 약관 URL도 `POLICY_BASE_URL` 재사용.

## IAP 흐름

`useSubscriptionIap`이 구매·검증·복원을 담당한다. 모든 결제 통신은 `app/bridge` 경유다([architecture/bridge.md](../../architecture/bridge.md)).

- 구매 요청: `appBridge.purchase(...)` (void) — `Purchase`는 결과가 push로 오는 예외 케이스다.
- 결과 수신: `useOnPurchaseSuccess` / `useOnPurchaseError` push 훅. resolver ref 패턴으로 Promise화한다.
- feature에서 `webClient`를 직접 호출하지 않는다.

> 검증 흐름은 web-core 훅(`useValidateApple`/`useValidateGoogle` 등)이 남아 있으나, 일반 IAP 경로는 `useSubscriptionIap` 하나로 충분하다(개발용 API Tester 패널은 제거됨).
