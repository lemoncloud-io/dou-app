# Subscription feature 구조 정리

> 대상: `apps/web/src/app/features/subscription` · 기준 문서: [directory-structure.md](../directory-structure.md)

`directory-structure.md` §3 표준(`hooks/` · `types/` · `consts/`)에 맞춰 subscription feature를 정리한 기록.

## 최종 구조

```
features/subscription/
  pages/
    SubscriptionPage.tsx        # 구독 현황 (현재 멤버십, 복원, 약관)
    SubscriptionPlansPage.tsx   # 플랜 선택 → 구매 흐름
  hooks/
    useSubscriptionIap.ts       # IAP: 구매·검증·복원 (appBridge 경유)
  types/
    index.ts                    # PurchaseProduct · NativePurchase · PurchaseError · PageState
  consts/
    index.ts                    # IS_DEV · APP_ID · POLICY_BASE_URL · ALLOWED_PRODUCT_ID_*
  routes/
  index.ts
```

## 적용한 규칙

- **타입은 `types/`로 전부 모은다.** 훅·페이지에 인라인으로 흩어져 있던 도메인 타입(`PurchaseProduct`, `NativePurchase`, `PurchaseError`)과 UI 상태 enum(`PageState`)을 `types/index.ts`로 이동. `NativePurchase`는 `WebMessageResponse<'FetchCurrentPurchases'>`에서 파생해 브릿지 계약과 동기 유지.
- **상수는 `consts/`로 모은다.** 세 파일에 중복돼 있던 환경 분기 상수(`IS_DEV`/`APP_ID`/`POLICY_BASE_URL`/`ALLOWED_PRODUCT_ID_*`)를 `consts/index.ts`로 통합. `SubscriptionPage`의 약관 URL도 `POLICY_BASE_URL` 재사용으로 중복 제거.
- **브릿지 통신은 `app/bridge` 경유.** IAP 구매/검증/복원은 `appBridge.*` 와 `useOnPurchaseSuccess/Error` push 훅만 사용 — feature에서 `webClient` 직접 호출 없음(`directory-structure.md` §1 bridge 규칙, `Purchase` 예외의 resolver-ref 패턴 그대로).

## 함께 제거한 것

- **`reportError`** — `SubscriptionPage`의 `reportError(toError(e))` 호출·import 제거(일단 제거). 실패 로깅은 `logger.error`로 유지. 미사용된 `toError` import도 제거.
- **DEV API Tester 패널** — `SubscriptionPlansPage`의 개발용 테스트 패널과 그것만 쓰던 훅(`useValidateApple/Google`, `useFetchActiveSubscriptions`, `useFetchReceiptDetail`)·상태·`runDev` 제거. 해당 훅은 `@chatic/web-core`에 그대로 남아 IAP 검증 흐름엔 영향 없음.

## 부수 변경 (feature 밖)

- `home/components/SubscriptionSelectDialog.tsx` 가 `PurchaseProduct`를 hook 경로에서 직접 import하던 것을 `../../subscription/types`로 갱신. 타입 이동에 따른 불가피한 import 경로 변경(런타임 영향 없음).

## 검증

- `tsc -p apps/web/tsconfig.app.json`: 변경 파일에서 신규 타입 오류 0건. (`SubscriptionPage.tsx`의 `status$` 4건은 이 작업 이전부터 작업트리에 있던 별개 오류 — `MembershipView`에 `status$` 미정의.)
- 순수 구조 이동·삭제라 신규 유닛 테스트는 작성하지 않음.
