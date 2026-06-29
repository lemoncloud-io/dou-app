# 전역 스토어 (preference)

> 대상: `apps/web/src/app/stores`

영구 앱 상태는 `usePreferenceStore` 하나로 통합한다. 세션/토큰은 web-core, theme은 `@chatic/theme`가 각자 관리하므로 이 스토어 범위 밖이다.

## 상태

```ts
interface PreferenceState {
    blurLastMessage: boolean;
    isFirstRun: boolean; // true = 온보딩 미완료
}
```

- `blurLastMessage` — 목록에서 마지막 메시지 미리보기 블러 여부.
- `isFirstRun` — 온보딩 미완료 여부([onboarding](../feature/onboarding/README.md) 게이트가 관측).

## 환경 분기 (native / web)

write/read 경로의 환경 분기는 store 내부에 캡슐화한다.

```ts
const persistPreference = (nativeKey, localKey, value) => {
    if (isNative()) {
        appBridge.savePreference({ key: nativeKey, value }); // native storage가 source of truth
    } else {
        localStorage.setItem(localKey, value); // web은 localStorage
    }
};
```

- **Web**: localStorage 유지. 즉시 동기 초기화(플래시 없음).
- **Native**: `savePreference` write-through + 앱 시작 시 `fetchPreference`로 hydrate. native에서는 localStorage를 쓰지 않는다.

## 키 관리 — `preferenceKeys.ts`

store가 소유하는 키만 한 파일에서 관리한다.

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

> **`isFirstRun` 의미 주의**: localStorage 키 `chatic-onboarding-completed`에 `'true'`가 저장되면 "완료됨"이고, `isFirstRun` 상태는 그 역(`!== 'true'`)이다. 구 명칭을 유지해 기존 사용자와 호환한다.

## Native hydration — `PreferenceLoader`

```tsx
const MANAGED_KEYS: PreferenceKey[] = ['blurLastMessage', 'isFirstRun'];

export const PreferenceLoader = (): null => {
    const hydrate = usePreferenceStore(s => s.hydrate);
    useOnFetchPreference(message => hydrate(message.data.key, message.data.value));
    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(key => appBridge.fetchPreference({ key }));
    }, []);
    return null;
};
```

`runtime/AppRuntime.tsx`에 마운트한다. native 환경에서 시작 시 관리 키를 fetch하고, 응답(`OnFetchPreference`)이 오면 store를 hydrate한다.

## 범위 밖 (의도)

- `debugSettings` → sessionStorage 유지(session-scoped 의도).
- `language` → i18next가 관리(native fetch 연동은 후속).
- `theme` → `@chatic/theme` ThemeProvider 관리.
- 세션/토큰 → web-core.
