# Store 개선: 통합 Preference Store + Native Bridge 연동

> 작성일: 2026-06-25 · 상태: 완료

---

## 1. 목표와 배경

앱 상태 관리가 여러 곳에 산재되어 있었다.

- `useAppPreferenceStore` / `useOnboardingStore` → localStorage만, native bridge 없음
- 스토리지 키 상수가 각 파일에 흩어져 있음
- `appBridge`: `savePreference(write)`만 있고 `fetchPreference(read)` 미구현

**목표:**

- 영구 앱 상태를 `app/stores/usePreferenceStore` 하나로 통합
- 스토리지 키 → `preferenceKeys.ts` 한 파일에서 관리
- 환경 분기 로직(native/web) → store 내부로 캡슐화
- Native 환경: `savePreference` write-through + 앱 시작 시 `fetchPreference` hydrate
- Web 환경: localStorage 유지

---

## 2. 범위

**포함:**

- `blurLastMessage` → preference store + native bridge 경로 추가
- `isFirstRun` (onboarding 완료 여부) → preference store + native bridge
- `preferenceKeys.ts` 상수 파일 (store가 소유하는 키만 관리)
- `appBridge.fetchPreference()` + `useOnFetchPreference` 훅 구현
- `libs/app-messages`: `PreferenceKey`에 `'blurLastMessage'` 추가
- `PreferenceLoader` 컴포넌트 (AppRuntime에 마운트, native hydration 담당)
- 기존 `useAppPreferenceStore` / `useOnboardingStore` 소비자 마이그레이션

**제외:**

- `debugSettings` → sessionStorage 그대로 유지 (session-scoped 의도 보존)
- `language` → i18next + useBackHandler write-sync 유지, native fetch 연동은 후속 작업
- `theme` 상태 자체 → `@chatic/theme` ThemeProvider가 관리 (변경 없음)
- 세션/토큰 관련 키 → web-core에서 관리, 이 스토어 범위 외
- Status/system bar 동기화 → theme 레이어에서 이미 관리됨

---

## 3. 설계 방향

### 3-1. 상수 파일 — `preferenceKeys.ts`

`usePreferenceStore`가 소유하는 키만 정의한다. 세션·토큰은 web-core, theme은 `@chatic/theme`에서 각자 관리하므로 여기서 재선언하지 않는다.

```ts
// store가 실제로 읽고 쓰는 localStorage 키
export const LOCAL_STORAGE_KEYS = {
    blurLastMessage: 'chatic-blur-last-message',
    onboarding: 'chatic-onboarding-completed',
} as const;

// native bridge로 읽고 쓸 때 사용하는 PreferenceKey 매핑
export const NATIVE_PREFERENCE_KEYS = {
    blurLastMessage: 'blurLastMessage',
    isFirstRun: 'isFirstRun',
    theme: 'theme',
    language: 'language',
    debugSettings: 'debugSettings',
} as const satisfies Record<string, PreferenceKey>;
```

### 3-2. PreferenceKey 확장 — `libs/app-messages`

```ts
export type PreferenceKey = 'isFirstRun' | 'theme' | 'language' | 'debugSettings' | 'blurLastMessage'; // ← 추가
```

### 3-3. Bridge 확장 — `appBridge` + `useHandleAppMessage`

```ts
// appBridge.ts
fetchPreference: (data: Payload<'FetchPreference'>): void => {
    webClient.post({ type: 'FetchPreference', data });
},
```

```ts
// useHandleAppMessage.ts
export const useOnFetchPreference = (handler: (message: AppMessageData<'OnFetchPreference'>) => void) =>
    useHandleAppMessage('OnFetchPreference', handler);
```

### 3-4. 통합 usePreferenceStore

**상태 구조:**

```ts
interface PreferenceState {
    blurLastMessage: boolean;
    isFirstRun: boolean; // true = 온보딩 미완료
}
```

**write path 캡슐화:**

```ts
// 환경 분기를 store 내부에 격리
const persistPreference = (nativeKey, localKey, value) => {
    if (isNative()) {
        appBridge.savePreference({ key: nativeKey, value });
    } else {
        localStorage.setItem(localKey, value);
    }
};
```

> native에서는 localStorage를 쓰지 않는다. native storage가 source of truth.

**초기값 전략:**

- localStorage에서 즉시 동기 초기화 (flash 없음)
- Native: `PreferenceLoader`가 비동기 fetch → 응답 시 `hydrate()` override

**`isFirstRun` 의미 주의:**

- 구 API `isCompleted = true` → 완료
- 신 API `isFirstRun = true` → 미완료 (의미 반전)

### 3-5. PreferenceLoader 컴포넌트

```tsx
const MANAGED_KEYS: PreferenceKey[] = ['blurLastMessage', 'isFirstRun'];

export const PreferenceLoader = (): null => {
    const hydrate = usePreferenceStore(state => state.hydrate);
    useOnFetchPreference(message => {
        hydrate(message.data.key, message.data.value);
    });
    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(key => appBridge.fetchPreference({ key }));
    }, []);
    return null;
};
```

`AppRuntime.tsx`에 `<NativeHandshake />` 옆에 마운트.

---

## 4. 변경 파일 목록

| 파일                                                        | 변경 내용                                  |
| ----------------------------------------------------------- | ------------------------------------------ |
| `libs/app-messages/src/types/model/preference.ts`           | `PreferenceKey`에 `'blurLastMessage'` 추가 |
| `apps/web/src/app/bridge/appBridge.ts`                      | `fetchPreference` 추가                     |
| `apps/web/src/app/bridge/useHandleAppMessage.ts`            | `useOnFetchPreference` 추가                |
| `apps/web/src/app/stores/preferenceKeys.ts`                 | 신규 — store 소유 키 상수                  |
| `apps/web/src/app/stores/usePreferenceStore.ts`             | 신규 — 통합 store                          |
| `apps/web/src/app/stores/usePreferenceStore.test.ts`        | 신규 — 유닛 테스트 (15개)                  |
| `apps/web/src/app/runtime/PreferenceLoader.tsx`             | 신규 — native hydration 컴포넌트           |
| `apps/web/src/app/runtime/AppRuntime.tsx`                   | `PreferenceLoader` 마운트                  |
| `apps/web/src/app/features/home/components/ChannelList.tsx` | `usePreferenceStore`로 마이그레이션        |
| `apps/web/src/app/features/home/pages/HomePage.tsx`         | `usePreferenceStore`로 마이그레이션        |
| `apps/web/src/app/features/mypage/pages/MyPage.tsx`         | `usePreferenceStore`로 마이그레이션        |
| `apps/web/src/app/shared/components/SettingsDialog.tsx`     | `usePreferenceStore`로 마이그레이션        |
| `apps/web/src/app/stores/useAppPreferenceStore.ts`          | 삭제                                       |
| `apps/web/src/app/stores/useOnboardingStore.ts`             | 삭제                                       |
| `apps/web/src/app/stores/appStores.test.ts`                 | 삭제                                       |
