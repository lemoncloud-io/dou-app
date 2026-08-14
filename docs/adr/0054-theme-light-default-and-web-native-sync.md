# ADR-0054: 테마 — 라이트 기본 고정과 웹↔네이티브 동기화 신뢰성 확보

> 상태: Accepted · 결정일: 2026-07-31

## 맥락 (Context)

모바일 셸(WebView 하이브리드)에서 테마가 간헐적으로 "풀리는" 증상이 보고되었다. 구체적으로:

- **백그라운드 복귀 후 또는 앱 시작 후** 상태바 색상이 현재 테마와 맞지 않는다.
- **라이트 모드 사용자인데도 스플래시 직후 다크 배경이 잠깐 번쩍인다.**

현재 구조를 조사한 결과, 원인이 하나가 아니라 네 개의 독립적인 결함이 겹친 것으로 확인됐다.

### 현재 구조

- **웹이 진실의 원천(SoT)이다.** [`usePreferenceStore`](../../apps/web/src/app/stores/usePreferenceStore.ts)의 `theme` 키가 `native+local` 전략으로, `localStorage['vite-ui-theme']`와 `SavePreference` 브릿지 메시지에 동시에 쓴다.
- **네이티브는 수신 전용이다.** [`usePreferenceCacheHandler.ts:42`](../../apps/mobile/src/app/webview/hooks/usePreferenceCacheHandler.ts)가 `SavePreference('theme')`을 받아 [`themeStore`](../../apps/mobile/src/app/stores/themeStore.ts)에 반영하고, [`SystemBars`](../../apps/mobile/src/app/features/core/components/SystemBars.tsx)가 상태바에 적용한다. `OnThemeChanged` 같은 네이티브→웹 방향 경로는 **존재하지 않는다.**
- **테마 전용 브릿지 메시지가 없다.** 범용 `SavePreference`/`FetchPreference`에 `key: 'theme'`으로 실려 간다.
- 별도 구현인 [`libs/theme`](../../libs/theme)는 `admin`·`desktop-web`·`landing`만 쓰고 `apps/web`은 더 이상 쓰지 않는다.

### 확인된 결함

1. **기본값이 세 곳에서 서로 다르고, 그중 둘이 `'system'`이다.**
    - 웹 스토어 기본값 `'system'` ([`usePreferenceStore.ts:186`](../../apps/web/src/app/stores/usePreferenceStore.ts))
    - 웹 프리페인트 스크립트는 저장값이 없으면 라이트 ([`index.html:20`](../../apps/web/index.html))
    - 모바일 스토어 기본값 `'system'` ([`themeStore.ts:16`](../../apps/mobile/src/app/stores/themeStore.ts))

    `'system'`은 웹(`matchMedia`)과 네이티브(RN `useColorScheme()`)가 **각각 독립적으로 해석**하므로, 값이 같아도 해석 시점이 어긋나면 화면이 갈린다.

2. **네이티브 스토어 복원이 비동기이고 게이팅이 없다 → 스플래시 다크 번쩍의 직접 원인.**
   `themeStore`는 zustand `persist`를 `storageAdapter`(async `preferenceService` → MMKV)로 감싸는데, `skipHydration`/`onFinishHydration` 처리가 없다. 콜드 스타트 초기 프레임의 `theme`은 무조건 `'system'`이고, [`App.tsx:46,51,54`](../../apps/mobile/src/app/App.tsx)가 `useResolvedTheme().backgroundColor`로 루트를 칠하기 때문에, **라이트를 선택한 사용자가 OS 다크 상태이면 `#121212`가 먼저 칠해진다.** 보고된 증상과 정확히 일치한다.

    MMKV 자체는 동기 읽기가 가능하다([`MmkvStorage.ts:26`](../../apps/mobile/src/app/database/mmkv/MmkvStorage.ts) `getString`). 비동기성은 저장소 한계가 아니라 이를 `Promise`로 감싼 층에서 생긴 것이다.

3. **`SystemBars`가 값 변화에만 반응한다 → 백그라운드 복귀 후 안 먹는 원인.**
   [`SystemBars.tsx:11-17`](../../apps/mobile/src/app/features/core/components/SystemBars.tsx)의 `StatusBar.setBarStyle` / `SystemBarsBridge.setAppearance`는 `isDark`가 바뀔 때만 실행된다. 앱 복귀·모달 표시·화면 회전에서 OS가 appearance 플래그를 되돌리면 **값이 그대로이므로 재적용이 일어나지 않고 영구히 틀린 상태로 남는다.**

4. **`SavePreference`가 fire-and-forget이다.**
   [`appBridge.ts:100`](../../apps/web/src/app/bridge/appBridge.ts)이 `request`가 아닌 `post`를 쓰고 호출부도 결과를 확인하지 않는다. 브릿지 준비 전이나 메시지 유실 시 **웹은 다크인데 네이티브만 라이트로 남고**, 다음 변경 전까지 복구되지 않는다. 네이티브→웹 방향이 없으므로 캐시 초기화·재설치 후에도 첫 페인트가 틀린다.

부수적으로 [`ThemeApplier`](../../apps/web/src/app/runtime/ThemeApplier.tsx)는 `<html>` 클래스만 갱신하고 `<meta name="theme-color">`와 `--splash-bg`는 손대지 않는다(부팅 스크립트만 한 번 세팅). 인앱 변경 후 리로드 전까지 stale하다.

## 결정 (Decision)

### 1. 기본 테마를 라이트로 고정한다

저장값이 없을 때의 기본값을 세 지점 전부 `'light'`로 통일한다: 웹 스토어 `defaultValue`, 웹 프리페인트 스크립트, 모바일 `themeStore` 초기값. 이로써 "저장값 없음"일 때 웹·네이티브·프리페인트가 OS 스킴을 보지 않고 같은 결론에 도달한다 — **결함 1이 구조적으로 제거된다.**

`'system'`은 값·스토어·브릿지 계약에서 **계속 지원한다.** 다만 이번 범위에서 UI 진입점은 만들지 않는다(아래 제외 참조). 저장된 `'system'`은 라이트로 1회 마이그레이션한다 — 현재 `setTheme('system')`을 호출하는 UI가 없어 저장된 `'system'`은 사용자의 명시적 선택이 아니라 과거 기본값이 흘러든 결과이므로, 마이그레이션은 의도 손실이 아니다.

### 2. 네이티브 첫 페인트를 동기 읽기로 정확하게 만든다

`themeStore`를 zustand `persist` 미들웨어에서 떼어내고, **모듈 로드 시점에 MMKV에서 `theme`을 동기로 읽어 초기 state로 사용**한다. 저장은 `setTheme`에서 명시적으로 수행한다.

- 복원 대기 창이 사라지므로 첫 프레임부터 올바른 배경·상태바가 적용된다. **부팅 지연은 0이다** (ADR-0027의 조기 마운트 최적화와 충돌하지 않는다).
- 기존 사용자 데이터 호환을 위해 읽기는 두 포맷을 모두 허용한다: 평문(`"dark"`)과 zustand persist 봉투(`{"state":{"theme":"dark"},"version":0}`). **쓰기는 평문으로 통일한다.**
- 웹 측 `parseTheme`([`usePreferenceStore.ts:121-130`](../../apps/web/src/app/stores/usePreferenceStore.ts))은 양방향 호환을 위해 유지한다.

`useResolvedTheme`의 `getThemeBackgroundColor`를 배경색의 단일 출처로 삼고, 첫 페인트 경로에 하드코딩된 `#121212`/`#ffffff` 중복을 이 함수로 수렴시킨다.

### 3. 시스템 바를 멱등하게 재적용한다

`SystemBars`의 적용을 값 변화 의존에서 떼어내고, **OS가 appearance를 되돌릴 수 있는 모든 시점에 현재 테마를 다시 적용**한다: 앱 포그라운드 복귀(`AppState`), 모달 표시·해제, 화면 회전. 재적용은 멱등이어야 하며 값이 안 바뀌어도 실행되어야 한다 — **결함 3의 본질이 "값이 안 바뀌면 아무 일도 안 한다"이기 때문이다.**

### 4. 웹 SoT를 유지하되 네이티브→웹 복구 경로를 추가한다

- **변경 권한은 웹이 계속 가진다.** 네이티브에는 테마 변경 UI를 만들지 않는다.
- **부팅 시 네이티브가 저장된 테마를 웹으로 전달한다.** 웹 캐시가 비었거나 재설치된 뒤에도 첫 페인트가 맞아야 한다. 웹은 이를 받아 자신의 스토어·localStorage에 반영한다.

    > **구현 편차:** 이 전달을 브릿지 메시지(핸드셰이크 push)가 아니라 **`injectedJavaScriptBeforeContentLoaded`로 `window.CHATIC_APP_THEME`을 주입**하는 방식으로 구현했다. 브릿지 메시지는 콘텐츠 로드 **이후**에 도착해 첫 페인트를 고칠 수 없고, 웹 측 수신자(`PreferenceLoader`)가 세션 준비 뒤에야 도는 문제도 있다. 주입은 문서 파싱 전에 실행되므로 프리페인트 스크립트가 그 값을 쓸 수 있다. 결과적으로 `libs/app-messages`·`libs/bridges`에 새 계약을 추가하지 않았다 — 위 "통신" 항목의 계약 확장은 불필요해졌다. 상세: [apps/mobile/docs/theme.md](../../apps/mobile/docs/theme.md)

- **`SavePreference('theme')`을 `request`로 전환하고 실패 시 재시도한다.** 웹 UI는 낙관적으로 즉시 반영하고, 브릿지 확인은 백그라운드에서 처리해 15초 타임아웃이 사용자 조작을 막지 않게 한다.

### 5. 웹의 테마 적용 범위를 완성한다

`ThemeApplier`가 `<html>` 클래스뿐 아니라 `<meta name="theme-color">`와 `--splash-bg`까지 갱신하도록 해, 인앱 변경 후에도 리로드 없이 일관되게 만든다.

**포함:** `apps/web`(스토어 기본값·프리페인트 스크립트·`ThemeApplier`·브릿지 확인/재시도·네이티브 push 수신), `apps/mobile`(`themeStore` 동기 초기화·`SystemBars` 재적용·배경색 단일화·부팅 시 push), `libs/app-messages`·`libs/bridges`(네이티브→웹 테마 전달 계약), `'system'` 저장값 마이그레이션.

**제외(후속 작업):**

- **`'system'` 선택 UI.** 현재 웹 토글 3곳([`SettingsControl.tsx:41`](../../apps/web/src/app/ui/components/SettingsControl.tsx), [`Sidebar.tsx:41`](../../apps/web/src/app/ui/components/Sidebar.tsx), [`MyPage.tsx:91`](../../apps/web/src/app/features/mypage/pages/MyPage.tsx))은 light↔dark 이진 토글이다. 값은 지원하되 진입점은 별도 작업으로 분리한다. **이번 릴리스에서 `'system'`은 사용자가 도달할 수 없는 상태로 남는다.**
- **`libs/theme` 및 그 소비자(`admin`·`desktop-web`·`landing`).** 기본값 통일조차 이번 범위에 넣지 않는다 — 검증 대상이 4개 앱으로 늘어난다. `libs/theme` 폐기와 `apps/web` 패턴으로의 이관은 별도 ADR로 다룬다.
- **스플래시 자산의 다크 변종.** 안드로이드 `values-night/`, iOS colorset의 dark appearance는 만들지 않는다 — 라이트 기본 고정으로 현재의 흰색 하드코딩이 오히려 정합해진다.
- **`SystemBars`의 모달 표시·해제 트리거.** 앱 복귀·회전만 구현했다. 보고된 재현 조건이 앱 복귀·시작이었고, 모달이 실제로 appearance를 되돌리는지는 확인되지 않았다.
- 네이티브 조기 단계(Kotlin/Swift)에서의 테마 적용.

## 대안 (Alternatives)

- **`'system'`을 타입에서 완전히 제거** (`ThemeMode = 'light' | 'dark'`) — 두 런타임이 각각 OS를 해석하는 경로를 통째로 없앨 수 있어 가장 견고했다. 하지만 OS 설정을 따르는 기능 자체를 유지해야 한다는 제품 요구가 있어 기각. 대신 기본값을 라이트로 고정해 **기본 경로에서는** OS 해석이 개입하지 않도록 했다.
- **네이티브를 SoT로 전환** (MMKV를 원본으로, 웹은 반영만) — 콜드 스타트 정합성은 최상이지만, 웹을 브라우저·데스크톱에서 단독 실행하는 경로와 분기가 생겨 저장 계층이 둘로 갈린다. 기각.
- **단방향 유지 + 신뢰성만 보강** (`request` 전환·재시도만 추가) — 최소 변경이지만 캐시 초기화·재설치 후 첫 페인트가 여전히 틀린다. 기각.
- **`skipHydration` + 복원 전 색 칠하기 보류** — 구조 변경은 작지만 다크 사용자에게 하얀 번쩍임이라는 역증상이 생기고, 부팅 경로에 대기가 들어간다. MMKV가 동기 읽기를 지원하므로 굳이 대기할 이유가 없어 기각.
- **네이티브 생성 시점(Kotlin/Swift)에서 MMKV를 읽어 적용** — Activity/ViewController 배경과 스플래시보다 이른 단계라 이론적으로 가장 이상적이다. 그러나 양 플랫폼에 새 네이티브 코드가 필요하고, JS 동기 초기화만으로 보고된 증상이 해소되므로 이번엔 기각(후속 옵션으로 남김).

## 결과 (Consequences)

**얻는 것**

- 기본 경로에서 OS 스킴 해석이 사라져, 보고된 두 증상(스플래시 다크 번쩍, 복귀 후 상태바 불일치)의 원인이 모두 제거된다.
- 첫 프레임부터 올바른 테마가 적용된다. 부팅 지연 증가 없이.
- 시스템 바 재적용이 멱등해져, OS가 플래그를 되돌리는 미래의 경로(새 모달·새 화면)에도 자동으로 견딘다.
- 브릿지 유실이 조용한 영구 불일치로 이어지지 않는다.

**감수하는 트레이드오프**

- `themeStore`가 zustand `persist`를 벗어나므로 저장 로직을 직접 작성·테스트해야 한다. 다른 스토어(`useLanguageStore` 등)와 패턴이 갈린다.
- 두 저장 포맷(평문·봉투)을 읽어야 하는 호환 코드가 한동안 남는다. 모든 사용자가 새 버전으로 한 번 쓰기를 수행한 뒤에나 정리할 수 있다.
- `'system'`이 지원되지만 도달 불가인 어중간한 상태가 후속 작업까지 유지된다. 저장값 마이그레이션으로 기존 `'system'` 사용자는 라이트로 이동하며, 다크를 원하면 기존 토글로 명시 선택해야 한다.
- 부팅 시 네이티브→웹 push가 추가되어 핸드셰이크 경로가 한 단계 늘어난다. 웹이 아직 준비되지 않은 시점의 전달 실패를 처리해야 한다.
- `libs/theme`를 남겨두므로 테마 구현이 두 개 공존하는 상태가 유지된다 — `admin`·`desktop-web`·`landing`은 여전히 `'system'`을 기본으로 해석할 수 있고, 이 불일치는 의도적으로 다음 작업으로 미룬다.
