# 테마

> 대상: `apps/web/src/app/hooks/useTheme.ts` · `runtime/ThemeApplier.tsx` · `config/legacyPreferenceMigration.ts`
> 계약 소유: 값 모델·기본값·저장 포맷·웹↔네이티브 동기화는 [apps/mobile/docs/theme.md](../../../mobile/docs/theme.md)가 소유한다. 이 문서는 웹 내부 상세만 다룬다. 저장·레인 메커니즘 자체의 정본은 [`@chatic/config` 아키텍처 문서](../../../../libs/config/docs/architecture.md)와 [stores.md](./stores.md).

web의 테마는 `@chatic/config`의 `ui.theme` 레지스트리 키다(2026-09-09 이관, 구 `usePreferenceStore` 폐기). 공용 `@chatic/theme`(ThemeProvider)는 더 이상 web에서 쓰지 않는다 — admin/desktop-web/landing 전용으로 남아 있다.

## 값 모델

```ts
type Theme = 'dark' | 'light' | 'system';
```

- 기본값은 **`'light'`** — 저장된 값이 없으면 OS 컬러 스킴을 보지 않는다. `'system'`을 기본으로 두면 웹(`matchMedia`)과 네이티브 셸(RN `useColorScheme`)이 각각 해석하므로, 한쪽만 해석을 끝낸 프레임에서 화면이 갈린다.
- `'system'`은 값으로는 계속 지원하고, 고른 경우 OS 설정 변경이 matchMedia `change` 리스너로 **실시간 반영**된다. 다만 **현재 UI에 `'system'` 선택 수단이 없다** — 세 토글([`SettingsControl`](../../src/app/ui/components/SettingsControl.tsx) · [`Sidebar`](../../src/app/ui/components/Sidebar.tsx) · [`MyPage`](../../src/app/features/mypage/pages/MyPage.tsx))이 모두 light↔dark 이진이다.

## 구성 요소

| 역할        | 위치                          | 책임                                                                            |
| ----------- | ----------------------------- | ------------------------------------------------------------------------------- |
| 상태·영속화 | `@chatic/config`의 `ui.theme` | 레인 리졸버 + `shell` persist(브릿지 동기화 + 로컬 미러). 정본은 상단 링크 참고 |
| 소비 API    | `hooks/useTheme`              | `{ theme, setTheme, isDarkTheme }` — `@chatic/theme`의 useTheme과 동일 API      |
| DOM 적용    | `runtime/ThemeApplier`        | `<html>`의 `light`/`dark` 클래스 + `meta[theme-color]`. 렌더 없음               |

`ThemeApplier`는 `app.tsx`에서 AppRuntime **바깥**에 마운트한다 — 세션 준비 전(로그인 화면 등)에도 테마가 맞아야 하기 때문. `useTheme`이 `@chatic/config`의 전역 싱글턴을 구독하므로 Context는 필요 없다.

`meta[theme-color]`를 `ThemeApplier`에서도 갱신하는 이유: `index.html`의 프리페인트 스크립트는 부팅 시 한 번만 돌기 때문에, 인앱 테마 변경 후 리로드 전까지 모바일 상단 시스템 UI 색이 stale하게 남는다. meta는 `id`가 아니라 `meta[name="theme-color"]`로 찾는다 — `id`에 결합하면 그 속성을 지웠을 때 동기화가 조용히 죽는다.

**`--splash-bg`는 `ThemeApplier`가 건드리지 않는다.** 유일한 소비자가 `index.html`의 `#root` 안에 있는 `#splash` 자리표시자이고, React가 첫 커밋에서 그것을 교체한 뒤에야 이 컴포넌트가 처음 실행되므로 쓰기가 무의미하다. 프리페인트 스크립트가 세팅하는 것만 효과가 있다.

색상 쌍(`#121212`/`#ffffff`)은 import가 불가능한 곳에 여러 번 손으로 유지된다 — `index.html`의 프리페인트 스크립트와 anti-flash `<style>` 블록, `apps/desktop-web/index.html`, `apps/mobile`의 `getThemeBackgroundColor`. 팔레트를 바꾸려면 전부 함께 고쳐야 한다.

## 저장 흐름 — 두 채널이 함께 간다

`ui.theme`는 `persist: 'shell'`이라 `config.set('ui.theme', theme, { lane: 'shell' })`가
브릿지(`SaveConfigValue`)로 확인 응답 + 1회 재시도 + 로컬 미러를 전부 처리한다(정본:
`@chatic/config` 아키텍처 문서). 하지만 그것만으로는 부족하다 — 네이티브 자신의 상태바·루트
배경·`window.CHATIC_APP_THEME` 사전 주입은 `ConfigKvService`가 아니라 **네이티브의 옛
`themeStore`**(모바일 `usePreferenceCacheHandler`의 `'theme'` 케이스가 갱신)를 본다. 그래서
`hooks/useTheme.ts`의 `setTheme`은 **두 번 쓴다**:

1. `config.set('ui.theme', theme, { lane: 'shell' })` — 다음 부팅에 `config.get('ui.theme')`이
   풀릴 저장소.
2. `appBridge.savePreferenceConfirmed({ key: 'theme', value: theme })` (네이티브에서만,
   확인 응답 + 1회 재시도) — 네이티브 자신의 UI가 보는 저장소.

거기에 `localStorage.setItem('vite-ui-theme', theme)`까지 더해 총 **세 곳**에 쓴다 —
`vite-ui-theme`는 web 전용이 아니라 5개 앱이 공유하는 키이기 때문(아래 참고). 세 채널 중 어느
하나가 실패해도 나머지는 독립적으로 성공한다: 신뢰할 수 있는 자기 치유 경로가 없는 건 2번뿐이라,
확인 응답 + 재시도는 거기에만 있다 — 네이티브가 상태바를 소유하는데 그 쓰기가 유실되면 두 계층이
영구히 어긋나기 때문이다.

**읽기**는 `useConfigValue('ui.theme')`(`@chatic/config/react`)가 전부다 — 로컬 캐시·네이티브
주입·기본값 순서는 `@chatic/config`의 레인 리졸버가 결정하며(정본 링크), 이 문서에서 다시
설명하지 않는다.

### 첫 페인트는 여전히 `index.html`의 몫이다

`@chatic/config`는 `main.tsx`가 부팅할 때 초기화된다 — 그보다 먼저 그려지는 첫 페인트는 `config`를
아직 모른다. `index.html`의 프리페인트 스크립트는 그래서 **바뀌지 않았다**:
`localStorage.getItem('vite-ui-theme') || window.CHATIC_APP_THEME || 'light'`를 그대로 동기로
읽는다. `window.CHATIC_APP_THEME`은 네이티브가 `injectedJavaScriptBeforeContentLoaded`로 주입하는
전역이고, 이 값도 위 "네이티브 자신의 themeStore"에서 나온다 — `setTheme`이 그 스토어를 계속
갱신해야 하는 또 다른 이유다.

[`PreferenceLoader`](../../src/app/runtime/PreferenceLoader.tsx)의 레거시 브릿지 폴백은 부팅
주입(`CHATIC_APP_CONFIG_BAG`)이 없는 구버전 셸을 위한 보조 경로로 남는다 —
`config.snapshot('ui.theme')?.isOverridden`이 false일 때만 `FetchPreference`로 값을 가져와
`{ lane: 'shell' }`로 채운다.

### bridge 값 파싱 주의

모바일은 과거 테마를 zustand persist로 저장했으므로, bridge/주입으로 읽은 값이 평문(`'dark'`)이
아니라 **JSON 봉투**(`{"state":{"theme":"dark"},"version":0}`)일 수 있다.
`parseThemeBridgeValue`(`stores/preferenceParsers.ts`, `PreferenceLoader`가 사용)가 두 형태를 모두
정규화하고, 해석 불가 값은 무시한다. 모바일도 이제 평문으로 통일해 쓰지만, 아직 새 버전 쓰기를
거치지 않은 기기가 있어 호환 읽기는 유지한다.

## 마이그레이션 메모

- **`vite-ui-theme`는 옮기지 않고 영구히 미러링한다.** 이 키는 web 전용이 아니라 `index.html`
  프리페인트 스크립트 5개(web·desktop-web·admin-v2·testbed·block-kit-builder)와 `@chatic/theme`의
  `ThemeProvider`(admin-v2·desktop-web·landing)가 전부 직접 읽고 쓰는 공유 계약이다 — 다른 config
  키처럼 새 이름으로 옮기고 지우면 이 5곳이 깨진다. `config/legacyPreferenceMigration.ts`의
  `syncThemeFromSharedKey()`가 매 부팅 `vite-ui-theme` → `ui.theme`의 네임스페이스 저장소로
  동기화하고, 원본은 지우지 않는다.
- 기본값이 `'system'` → `'light'`로 바뀐 건 그대로다(2025년 어느 시점 결정, 저장값이 없던 사용자만
  영향).
- 네이티브에 남아 있던 **레거시 봉투 포맷의** `'system'`은 모바일 셸이 초기화 시점에 `'light'`로
  접고 평문으로 되쓴다. 평문으로 저장된 `'system'`은 명시적 선택으로 존중되므로, 웹이 저장된
  `'system'`을 존중하는 것과 어긋나지 않는다.
