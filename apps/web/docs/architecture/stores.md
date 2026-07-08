# 전역 스토어 (preference)

> 대상: `apps/web/src/app/stores`

영구 앱 상태는 `usePreferenceStore` 하나로 통합한다. 세션/토큰은 web-core가 관리하므로 이 스토어 범위 밖이다.

## 상태

```ts
interface PreferenceState {
    blurLastMessage: boolean;
    isFirstRun: boolean; // true = 온보딩 미완료
    theme: 'dark' | 'light' | 'system';
}
```

- `blurLastMessage` — 목록에서 마지막 메시지 미리보기 블러 여부.
- `isFirstRun` — 온보딩 미완료 여부([onboarding](../feature/onboarding/README.md) 게이트가 관측).
- `theme` — 테마 설정. 해석·적용은 [theme](./theme.md) 참고.

## 저장 모델 (L1 캐시 + bridge)

localStorage/sessionStorage는 동기 L1 캐시, native bridge는 WebView 캐시 초기화에도 살아남는 영구 저장소다. 둘은 양자택일이 아니라 **write-through**로 함께 쓴다.

```
Write:  스토어 갱신 -> 로컬 캐시 기록 -> (native+local && native) bridge SavePreference
Read:   로컬 캐시 -> (캐시 미스 && native) bridge FetchPreference -> defaultValue
```

- **Web**: localStorage만 관여. 초기값을 동기로 읽어 플래시가 없다.
- **Native**: 같은 write-through에 bridge 동기화가 더해지고, 시작 시 캐시 미스 키만 bridge에서 복원한다.

## 키 관리 — `preferenceKeys.ts`

앱 수준 설정 키는 전부 `PREFERENCES` 레지스트리 한 곳에 산다. `strategy`가 읽기/쓰기 경로를 결정한다.

```ts
type PreferenceEntry =
    | { strategy: 'native+local'; nativeKey: PreferenceKey; localKey: string; defaultValue: string }
    | { strategy: 'local'; localKey: string; defaultValue: string }
    | { strategy: 'session'; sessionKey: string; defaultValue: string };

export const PREFERENCES = {
    blurLastMessage: {
        strategy: 'native+local',
        nativeKey: 'blurLastMessage',
        localKey: 'chatic-blur-last-message',
        defaultValue: 'false',
    },
    isFirstRun: {
        strategy: 'native+local',
        nativeKey: 'isFirstRun',
        localKey: 'chatic-onboarding-completed',
        defaultValue: 'false',
    },
    theme: { strategy: 'native+local', nativeKey: 'theme', localKey: 'vite-ui-theme', defaultValue: 'system' },
    language: { strategy: 'native+local', nativeKey: 'language', localKey: 'chatic-language', defaultValue: 'ko' }, // i18next 소유, 참조용
    debugSettings: { strategy: 'session', sessionKey: 'chatic_debug_mode', defaultValue: 'false' },
} as const;
```

> **`isFirstRun` 의미 주의**: localStorage 키 `chatic-onboarding-completed`에 `'true'`가 저장되면 "완료됨"이고, `isFirstRun` 상태는 그 역(`!== 'true'`)이다. 구 명칭을 유지해 기존 사용자와 호환한다.

> **`theme` 키 주의**: `localKey: 'vite-ui-theme'`는 구 ThemeProvider 시절 키를 그대로 유지한 것(기존 사용자 선택 보존). bridge에서 읽은 값은 모바일의 zustand persist JSON 봉투일 수 있어 `parseTheme`으로 정규화한다.

## Native hydration — `PreferenceLoader`

```tsx
const MANAGED_KEYS = ['blurLastMessage', 'isFirstRun', 'theme'] as const;

export const PreferenceLoader = (): null => {
    const hydrate = usePreferenceStore(state => state.hydrate);
    useEffect(() => {
        if (!isNative()) return;
        MANAGED_KEYS.forEach(name => {
            if (hasLocalPreference(name)) return; // 로컬 캐시가 있으면 bridge를 읽지 않는다
            appBridge.fetchPreference({ key: PREFERENCES[name].nativeKey }).then(preference => {
                if (preference.data.value != null) hydrate(preference.data.key, preference.data.value);
            });
        });
    }, []);
    return null;
};
```

`runtime`에 마운트한다. native에서 **로컬 캐시가 비어 있는 관리 키만** bridge에서 fetch해 store를 hydrate하고, 캐시도 함께 seeding한다. bridge에도 값이 없으면 동기 기본값이 유지된다.

## 범위 밖 (의도)

- `debugSettings` → sessionStorage 유지(session-scoped 의도).
- `language` → i18next가 관리(native fetch 연동은 후속).
- 세션/토큰 → web-core.
