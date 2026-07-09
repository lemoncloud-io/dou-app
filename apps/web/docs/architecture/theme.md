# 테마

> 대상: `apps/web/src/app/hooks/useTheme.ts` · `runtime/ThemeApplier.tsx` · `stores/usePreferenceStore.ts`

web의 테마는 `usePreferenceStore`가 소유하는 preference 키다. 공용 `@chatic/theme`(ThemeProvider)는 더 이상 web에서 쓰지 않는다 — admin/desktop-web/landing 전용으로 남아 있다.

## 값 모델

```ts
type Theme = 'dark' | 'light' | 'system';
```

- 기본값은 **`'system'`** — 저장된 값이 없으면 OS 컬러 스킴을 따른다.
    - **웹**: 브라우저 `matchMedia('(prefers-color-scheme: dark)')`.
    - **모바일 WebView**: 같은 media query가 모바일 OS 스킴을 반영한다. 모바일 RN 쪽 기본값도 `'system'`(`apps/mobile` `themeStore`)이라 양쪽 기본 동작이 일치한다.
- `'system'`일 때 OS 설정 변경은 matchMedia `change` 리스너로 **실시간 반영**된다.

## 구성 요소

| 역할        | 위치                        | 책임                                                                       |
| ----------- | --------------------------- | -------------------------------------------------------------------------- |
| 상태·영속화 | `stores/usePreferenceStore` | `theme` 상태, `setTheme` 액션, localStorage + native bridge write-through  |
| 소비 API    | `hooks/useTheme`            | `{ theme, setTheme, isDarkTheme }` — `@chatic/theme`의 useTheme과 동일 API |
| DOM 적용    | `runtime/ThemeApplier`      | 해석된 테마를 `<html>`의 `light`/`dark` 클래스로 반영. 렌더 없음           |

`ThemeApplier`는 `app.tsx`에서 AppRuntime **바깥**에 마운트한다 — 세션 준비 전(로그인 화면 등)에도 테마가 맞아야 하기 때문. zustand 스토어가 전역이라 Context는 필요 없다.

## 저장 흐름

`preferenceKeys.ts`의 `theme` 항목: `strategy: 'native+local'`, `localKey: 'vite-ui-theme'`, `nativeKey: 'theme'`.

- **쓰기**: `setTheme` → 스토어 갱신 → localStorage 캐시 → (native면) `SavePreference`로 bridge 동기화. 모바일은 이 값을 자기 `themeStore`에 반영해 네이티브 UI(상태바 등)도 함께 바뀐다.
- **읽기**: 초기값은 localStorage에서 동기로. native에서 캐시가 비어 있으면(`PreferenceLoader`) `FetchPreference`로 bridge에서 복원한다 — WebView 캐시 초기화 후에도 테마가 유지되는 경로.

### bridge 값 파싱 주의

모바일은 테마를 zustand persist로 저장하므로, bridge에서 읽은 값이 평문(`'dark'`)이 아니라 **JSON 봉투**(`{"state":{"theme":"dark"},"version":0}`)일 수 있다. `parseTheme`(usePreferenceStore)가 두 형태를 모두 정규화하고, 해석 불가 값은 무시하고 `'system'` 기본을 유지한다. 캐시에는 항상 정규화된 평문만 저장한다.

## 마이그레이션 메모

- `localKey`를 기존 ThemeProvider의 `'vite-ui-theme'` 그대로 유지 — 명시적으로 테마를 고른 기존 사용자는 그대로 보존된다.
- 테마를 한 번도 바꾸지 않은 사용자만 기본값 변경(light → system)의 영향을 받는다. 의도된 동작.
