# onboarding

> 대상: `apps/web/src/app/features/onboarding`

## 책임

최초 실행 시 앱의 핵심 가치를 소개하는 **첫 실행 게이트**다. 4단계 슬라이드 투어를 모달로 띄우고, 사용자가 마지막 단계를 완료하거나 SKIP하면 완료 상태를 저장해 다시 표시하지 않는다.

## 게이트 동작

`HomePage` 위에 **오버레이 모달**로 마운트된다(라우팅 차단 아님).

```tsx
// HomePage.tsx
<OnboardingModal open={isFirstRun} onComplete={completeOnboarding} />
```

- `isFirstRun` / `completeOnboarding`은 `usePreferenceStore`에서 온다([stores](../../architecture/stores.md)).
- `isFirstRun === true`(미완료)면 모달이 열린다. 완료 시 `completeOnboarding()` → `isFirstRun = false` + 영속 저장.
- 라우트를 막지 않으므로, 온보딩 진행 중에도 백그라운드의 홈 콘텐츠는 이미 로드된다.

## 상태 저장

[stores](../../architecture/stores.md)의 preference 경로를 따른다(이중 계층).

- **Web**: localStorage `chatic-onboarding-completed`(동기 L1, 시작 시 즉시 읽음).
- **Native**: bridge `isFirstRun` 키 — WebView 캐시 초기화 후에도 지속. `PreferenceLoader`가 시작 시 fetch.
- **의미 반전 주의**: 저장값 `'true'` = "완료됨", `isFirstRun` 상태는 그 역. 구 키명을 유지해 기존 사용자와 호환한다.

## 구조

```
features/onboarding/
  components/
    OnboardingModal.tsx     # 컨테이너 — 스와이프 제스처(50px 임계), 슬라이드 애니메이션
    OnboardingHeader.tsx    # 스텝 인디케이터 + SKIP
    OnboardingContent.tsx   # 단계별 제목·설명·이미지
    OnboardingFooter.tsx    # PREV / NEXT·DONE
    StepIndicator.tsx       # 4개 닷 인디케이터
  hooks/
    useOnboardingSteps.ts       # i18n 기반 4단계 OnboardingStep[] 생성
    useOnboardingNavigation.ts  # currentStep + handleNext/handlePrev, isFirst/isLast
  types/steps.ts            # OnboardingStep, ONBOARDING_STEPS
  index.tsx                 # OnboardingModal만 공개
```

## 주요 결정/특이점

- **공개 표면 최소화**: barrel은 `OnboardingModal`만 노출한다(HomePage가 유일 소비자).
- **콘텐츠는 i18n 동적 생성**: 단계 텍스트는 `useOnboardingSteps()`가 언어별로 만든다. `types/steps.ts` 상수는 참고용 기본값.
- 라이프사이클: `PreferenceLoader`(native에서 `isFirstRun` hydrate) → HomePage 렌더 → `usePreferenceStore`로 모달 조건부 표시.
