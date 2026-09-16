# theme — state, DOM application, and the native sync

Covers `apps/web/src/app/hooks/useTheme.ts`, `runtime/ThemeApplier.tsx` and
`config/legacyPreferenceMigration.ts`. The value model, default, storage format and web↔native
contract are owned by [`apps/mobile/docs/system/theme.md`](../../../mobile/docs/system/theme.md) — this document
covers only the web-internal wiring. The storage/lane mechanism itself is
[`@chatic/config`](../../../../libs/config/README.md)'s canon; see also [stores.md](../state/stores.md)
for how apps/web wires into that mechanism generally.

Theme is the `ui.theme` registry key of `@chatic/config` (moved 2026-09-09, retiring the old
`usePreferenceStore`). The shared `@chatic/theme` package (its `ThemeProvider`) is no longer used
by web — it stays in use by admin-v2, desktop-web and landing only.

## Value model

```ts
type Theme = 'dark' | 'light' | 'system';
```

- The default is **`'light'`** — with no stored value, the OS color scheme is not consulted. If
  `'system'` were the default, web (`matchMedia`) and the native shell (RN `useColorScheme`) would
  each resolve it independently, and a frame where only one side had resolved would show a visibly
  split screen.
- `'system'` is still a supported value, and choosing it keeps a live OS change reflected through
  a `matchMedia` `change` listener. But **no current UI lets a user choose it** — all three
  toggles ([`SettingsControl`](../../src/app/ui/components/SettingsControl.tsx),
  [`Sidebar`](../../src/app/ui/components/Sidebar.tsx),
  [`MyPage`](../../src/app/features/mypage/pages/MyPage.tsx)) are light↔dark binary switches.

## Components

| Role                | Location                      | Responsibility                                                                           |
| ------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| State + persistence | `@chatic/config`'s `ui.theme` | Lane resolution + `shell` persist (bridge sync + local mirror). Canon at the link above. |
| Consumer API        | `hooks/useTheme`              | `{ theme, setTheme, isDarkTheme }` — same shape as `@chatic/theme`'s `useTheme`.         |
| DOM application     | `runtime/ThemeApplier`        | The `light`/`dark` class on `<html>` and `meta[theme-color]`. Renders nothing.           |

`ThemeApplier` mounts in `app.tsx` **outside** `AppRuntime`, because the theme has to be correct
before a session exists (the login screen, for instance). `useTheme` subscribes to `@chatic/config`'s
global singleton, so no Context is needed.

`ThemeApplier` also updates `meta[theme-color]` because `index.html`'s pre-paint script only runs
once, at boot — without this, an in-app theme change would leave the mobile status bar color stale
until the next reload. It looks the meta tag up by `meta[name="theme-color"]`, not by `id`: binding
to an `id` would silently break the sync the moment that attribute is removed.

**`ThemeApplier` never touches `--splash-bg`.** Its only consumer is the `#splash` placeholder
inside `index.html`'s `#root`, and React replaces that placeholder on its first commit — before
`ThemeApplier` ever runs. Only the pre-paint script's own write to that variable has any effect.

The color pair (`#121212`/`#ffffff`) is hand-maintained in several places that cannot import a
shared constant: `index.html`'s pre-paint script and its anti-flash `<style>` block,
`apps/desktop-web/index.html`, and `apps/mobile`'s `getThemeBackgroundColor`. Changing the palette
means changing all of them together.

## Storage flow — three channels, one write

`ui.theme` is `persist: 'shell'`, so `config.set('ui.theme', theme, { lane: 'shell' })` already
handles the bridge round-trip (`SaveConfigValue`), one retry, and the local mirror — canon in the
[`@chatic/config` README](../../../../libs/config/README.md). That alone is not enough, though:
the native shell's own status bar, root background and `window.CHATIC_APP_THEME` pre-injection
read the native's own legacy `themeStore` (updated by the mobile `usePreferenceCacheHandler`'s
`'theme'` case), not `ConfigKvService`. So `hooks/useTheme.ts`'s `setTheme` writes **twice**:

1. `config.set('ui.theme', theme, { lane: 'shell' })` — the storage `config.get('ui.theme')`
   resolves from on the next boot.
2. `appBridge.savePreferenceConfirmed({ key: 'theme', value: theme })` (native only, confirmed
   with one retry) — the storage native's own UI reads.

On top of that, `localStorage.setItem('vite-ui-theme', theme)` makes a third write —
`vite-ui-theme` is not private to web; it is shared by five apps (see below). Each of the three
channels can fail independently without breaking the others: only the second has no self-healing
path, which is why it alone gets confirmation + retry — if native owns the status bar and this
write is lost, the two layers stay wrong until the next full app restart.

**Reading** is just `useConfigValue('ui.theme')` (`@chatic/config/react`) — local cache, native
injection and default-value ordering are decided by `@chatic/config`'s lane resolver and are not
re-explained here.

### First paint is still `index.html`'s job

`@chatic/config` initializes when `main.tsx` boots — the first paint, which happens earlier, does
not know about it yet. `index.html`'s pre-paint script is therefore unchanged: it synchronously
reads `localStorage.getItem('vite-ui-theme') || window.CHATIC_APP_THEME || 'light'`.
`window.CHATIC_APP_THEME` is the global the native shell injects via
`injectedJavaScriptBeforeContentLoaded`, sourced from the same native `themeStore` above — another
reason `setTheme` has to keep that store current.

[`PreferenceLoader`](../../src/app/runtime/PreferenceLoader.tsx)'s legacy bridge fallback remains
as a secondary path for a shell old enough to lack the boot injection
(`CHATIC_APP_CONFIG_BAG`): only when `config.snapshot('ui.theme')?.isOverridden` is false does it
fetch the value via `FetchPreference` and write it with `{ lane: 'shell' }`.

### Parsing bridge values

Mobile used to store the theme via zustand persist, so a value read off the bridge or the boot
injection can arrive as a JSON envelope (`{"state":{"theme":"dark"},"version":0}`) instead of a
plain string (`'dark'`). `parseThemeBridgeValue` (`stores/preferenceParsers.ts`, used by
`PreferenceLoader`) normalizes both shapes and discards anything unrecognized. Mobile now writes
plain strings too, but some devices haven't gone through a write since the format changed, so the
compatible read stays.

## Migration notes

- **`vite-ui-theme` is mirrored forever, not moved.** This key is not web-only — `index.html`'s
  pre-paint scripts in five apps (web, desktop-web, admin-v2, testbed, block-kit-builder) and
  `@chatic/theme`'s `ThemeProvider` (admin-v2, desktop-web, landing) all read and write it directly,
  so renaming and deleting it the way other config keys were migrated would break those five call
  sites. `config/legacyPreferenceMigration.ts`'s `syncThemeFromSharedKey()` re-syncs
  `vite-ui-theme` into `ui.theme`'s namespaced storage on every boot instead, without ever deleting
  the original.
- The default flip from `'system'` to `'light'` stands (a decision from 2025, affecting only users
  with no stored value).
- A legacy-envelope `'system'` still found on the native side is folded to `'light'` by the mobile
  shell at init and re-written as a plain string. A plain-string `'system'` is honored as an
  explicit choice, which does not conflict with web also honoring a stored `'system'`.
