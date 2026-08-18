# 테마

> 대상: `apps/web/src/app/hooks/useTheme.ts` · `runtime/ThemeApplier.tsx` · `stores/usePreferenceStore.ts`
> 계약 소유: 값 모델·기본값·저장 포맷·웹↔네이티브 동기화는 [apps/mobile/docs/theme.md](../../../mobile/docs/theme.md)가 소유한다. 이 문서는 웹 내부 상세만 다룬다.

web의 테마는 `usePreferenceStore`가 소유하는 preference 키다. 공용 `@chatic/theme`(ThemeProvider)는 더 이상 web에서 쓰지 않는다 — admin/desktop-web/landing 전용으로 남아 있다.

## 값 모델

```ts
type Theme = 'dark' | 'light' | 'system';
```

- 기본값은 **`'light'`** — 저장된 값이 없으면 OS 컬러 스킴을 보지 않는다. `'system'`을 기본으로 두면 웹(`matchMedia`)과 네이티브 셸(RN `useColorScheme`)이 각각 해석하므로, 한쪽만 해석을 끝낸 프레임에서 화면이 갈린다.
- `'system'`은 값으로는 계속 지원하고, 고른 경우 OS 설정 변경이 matchMedia `change` 리스너로 **실시간 반영**된다. 다만 **현재 UI에 `'system'` 선택 수단이 없다** — 세 토글([`SettingsControl`](../../src/app/ui/components/SettingsControl.tsx) · [`Sidebar`](../../src/app/ui/components/Sidebar.tsx) · [`MyPage`](../../src/app/features/mypage/pages/MyPage.tsx))이 모두 light↔dark 이진이다.

## 구성 요소

| 역할        | 위치                        | 책임                                                                       |
| ----------- | --------------------------- | -------------------------------------------------------------------------- |
| 상태·영속화 | `stores/usePreferenceStore` | `theme` 상태, `setTheme` 액션, localStorage + native bridge write-through  |
| 소비 API    | `hooks/useTheme`            | `{ theme, setTheme, isDarkTheme }` — `@chatic/theme`의 useTheme과 동일 API |
| DOM 적용    | `runtime/ThemeApplier`      | `<html>`의 `light`/`dark` 클래스 + `meta[theme-color]`. 렌더 없음          |

`ThemeApplier`는 `app.tsx`에서 AppRuntime **바깥**에 마운트한다 — 세션 준비 전(로그인 화면 등)에도 테마가 맞아야 하기 때문. zustand 스토어가 전역이라 Context는 필요 없다.

`meta[theme-color]`를 `ThemeApplier`에서도 갱신하는 이유: `index.html`의 프리페인트 스크립트는 부팅 시 한 번만 돌기 때문에, 인앱 테마 변경 후 리로드 전까지 모바일 상단 시스템 UI 색이 stale하게 남는다. meta는 `id`가 아니라 `meta[name="theme-color"]`로 찾는다 — `id`에 결합하면 그 속성을 지웠을 때 동기화가 조용히 죽는다.

**`--splash-bg`는 `ThemeApplier`가 건드리지 않는다.** 유일한 소비자가 `index.html`의 `#root` 안에 있는 `#splash` 자리표시자이고, React가 첫 커밋에서 그것을 교체한 뒤에야 이 컴포넌트가 처음 실행되므로 쓰기가 무의미하다. 프리페인트 스크립트가 세팅하는 것만 효과가 있다.

색상 쌍(`#121212`/`#ffffff`)은 import가 불가능한 곳에 여러 번 손으로 유지된다 — `index.html`의 프리페인트 스크립트와 anti-flash `<style>` 블록, `apps/desktop-web/index.html`, `apps/mobile`의 `getThemeBackgroundColor`. 팔레트를 바꾸려면 전부 함께 고쳐야 한다.

## 저장 흐름

`preferenceKeys.ts`의 `theme` 항목: `strategy: 'native+local'`, `localKey: 'vite-ui-theme'`, `nativeKey: 'theme'`, `defaultValue: 'light'`.

- **쓰기**: `setTheme` → 스토어 갱신 → localStorage 캐시 → (native면) `savePreferenceConfirmed`로 bridge 동기화. 모바일은 이 값을 자기 `themeStore`에 반영해 네이티브 UI(상태바 등)도 함께 바뀐다.

    테마만 범용 `persistPreference`를 쓰지 않고 **확인 응답을 받고 1회 재시도**한다. 유실이 자기 치유되지 않는 유일한 키이기 때문이다 — 네이티브가 상태바·루트 배경을 소유하는데 쓰기가 유실되면, 웹은 자기 캐시를 남겼으므로 `readInitialTheme`이 주입값을 다시 보지 않아 두 계층이 영구히 어긋난다. UI 반영은 낙관적이고 확인은 백그라운드라 토글이 막히지 않는다.

- **읽기**: `readInitialTheme()`이 **로컬 캐시 → 네이티브 주입 전역(`window.CHATIC_APP_THEME`) → `'light'`** 순으로 동기 결정한다. 주입값을 쓴 경우 즉시 로컬 캐시에 기록한다.

### 네이티브 주입이 브릿지 읽기보다 앞선다

WebView 캐시가 비워진 뒤에도 첫 페인트가 맞아야 한다. 네이티브 셸이 `injectedJavaScriptBeforeContentLoaded`로 `window.CHATIC_APP_THEME`을 주입하므로, `index.html`의 프리페인트 스크립트와 `readInitialTheme()`이 그 값을 첫 페인트에 쓸 수 있다. 브릿지 메시지(`FetchPreference`)는 첫 페인트 이후에 도착하므로 이 역할을 할 수 없다.

[`PreferenceLoader`](../../src/app/runtime/PreferenceLoader.tsx)의 브릿지 읽기는 주입이 없는 구버전 셸(Capability Skew)을 위한 **보조 경로**로 남는다. 주입값이 로컬 캐시에 기록되면 `hasLocalPreference('theme')`가 참이 되어 브릿지 읽기를 건너뛴다 — 늦게 도착한 `hydrate`가 첫 페인트 뒤 화면을 뒤집는 경로도 함께 사라진다.

### bridge 값 파싱 주의

모바일은 과거 테마를 zustand persist로 저장했으므로, bridge/주입으로 읽은 값이 평문(`'dark'`)이 아니라 **JSON 봉투**(`{"state":{"theme":"dark"},"version":0}`)일 수 있다. `parseTheme`(usePreferenceStore)가 두 형태를 모두 정규화하고, 해석 불가 값은 무시해 기본값을 유지한다. 캐시에는 항상 정규화된 평문만 저장한다. 모바일도 이제 평문으로 통일해 쓰지만, 아직 새 버전 쓰기를 거치지 않은 기기가 있어 호환 읽기는 유지한다.

## 마이그레이션 메모

- `localKey`를 기존 ThemeProvider의 `'vite-ui-theme'` 그대로 유지 — 명시적으로 테마를 고른 기존 사용자는 그대로 보존된다.
- 기본값이 `'system'` → `'light'`로 바뀌었다. 저장값이 없던 사용자만 영향을 받는다(의도된 동작).
- 네이티브에 남아 있던 **레거시 봉투 포맷의** `'system'`은 모바일 셸이 초기화 시점에 `'light'`로 접고 평문으로 되쓴다. 평문으로 저장된 `'system'`은 명시적 선택으로 존중되므로, 웹이 저장된 `'system'`을 존중하는 것과 어긋나지 않는다.
