# ADR-0054: Theme — Pin the Light Default and Make Web↔Native Sync Reliable

> Status: Accepted · Decided: 2026-07-31

## Context

The mobile shell (WebView hybrid) has reports of theme intermittently "coming undone." Specifically:

- **After returning from the background, or after app launch,** the status bar color does not match
  the current theme.
- **Even light-mode users see a brief flash of dark background right after the splash screen.**

Investigating the current structure found the cause is not one thing, but four independent flaws
overlapping.

### Current structure

- **The web is the source of truth (SoT).** The `theme` key in
  `apps/web/src/app/stores/usePreferenceStore.ts` uses a `native+local` strategy, writing to both
  `localStorage['vite-ui-theme']` and the `SavePreference` bridge message at the same time.
- **Native is receive-only.** [`usePreferenceCacheHandler.ts:42`](../../apps/mobile/src/app/webview/hooks/usePreferenceCacheHandler.ts)
  receives `SavePreference('theme')` and applies it to
  [`themeStore`](../../apps/mobile/src/app/stores/themeStore.ts), and
  [`SystemBars`](../../apps/mobile/src/app/features/core/components/SystemBars.tsx) applies it to the
  status bar. A native→web path such as `OnThemeChanged` **does not exist.**
- **There is no theme-specific bridge message.** It rides on the general-purpose
  `SavePreference`/`FetchPreference` with `key: 'theme'`.
- The separate implementation [`libs/theme`](../../libs/theme) is used only by `admin`, `desktop-web`,
  and `landing` — `apps/web` no longer uses it.

### Confirmed flaws

1. **The default value differs across three places, and two of the three are `'system'`.**
    - The web store's default, `'system'` (`apps/web/src/app/stores/usePreferenceStore.ts`)
    - The web pre-paint script defaults to light when there is no stored value
      ([`index.html:20`](../../apps/web/index.html))
    - The mobile store's default, `'system'` (`apps/mobile/src/app/stores/themeStore.ts`)

    `'system'` is **interpreted independently by each runtime** — the web via `matchMedia`, native via
    RN's `useColorScheme()` — so even with the same stored value, a mismatch in interpretation timing
    splits the screens apart.

2. **The native store's restore is asynchronous and ungated → the direct cause of the dark splash
   flash.**
   `themeStore` wraps zustand's `persist` around `storageAdapter` (an async `preferenceService` →
   MMKV), with no `skipHydration`/`onFinishHydration` handling. `theme` is unconditionally `'system'`
   during the earliest cold-start frames, and since
   [`App.tsx:46,51,54`](../../apps/mobile/src/app/App.tsx) paints the root with
   `useResolvedTheme().backgroundColor`, **a user who chose light but whose OS is in dark mode gets
   `#121212` painted first.** This matches the reported symptom exactly.

    MMKV itself supports a synchronous read
    ([`MmkvStorage.ts:26`](../../apps/mobile/src/app/database/mmkv/MmkvStorage.ts) `getString`). The
    asynchrony is not a storage limitation — it comes from the layer that wraps it in a `Promise`.

3. **`SystemBars` only reacts to a value change → the cause of it not sticking after returning from
   background.**
   [`SystemBars.tsx:11-17`](../../apps/mobile/src/app/features/core/components/SystemBars.tsx)'s
   `StatusBar.setBarStyle` / `SystemBarsBridge.setAppearance` only run when `isDark` changes. When the
   OS resets the appearance flag on app return, a modal, or a screen rotation, **the value is
   unchanged, so re-application never fires and the wrong state persists indefinitely.**

4. **`SavePreference` is fire-and-forget.**
   [`appBridge.ts:100`](../../apps/web/src/app/bridge/appBridge.ts) uses `post`, not `request`, and the
   caller never checks the result. If the bridge is not ready yet, or a message is lost, **the web ends
   up dark while native stays light**, and it does not recover until the next change. Since there is no
   native→web direction, the first paint is wrong even after a cache clear or reinstall.

As a side note, [`ThemeApplier`](../../apps/web/src/app/runtime/ThemeApplier.tsx) only updates the
`<html>` class and never touches `<meta name="theme-color">` or `--splash-bg` (only the boot script
sets those, once). They stay stale after an in-app change until reload.

## Decision

### 1. Pin the default theme to light

Unify the "no stored value" default across all three points to `'light'`: the web store's
`defaultValue`, the web pre-paint script, and the mobile `themeStore` initial value. This way, when
there is no stored value, web, native, and pre-paint all reach the same conclusion without looking at
the OS scheme — **flaw 1 is structurally eliminated.**

`'system'` **remains supported** in the value, store, and bridge contract. Only the UI entry point is
withheld from this scope (see the exclusion below). A stored `'system'` is migrated to light once —
since no UI currently calls `setTheme('system')`, a stored `'system'` value is not a user's deliberate
choice but a leftover from a past default, so this migration does not lose intent.

### 2. Make native's first paint correct with a synchronous read

Detach `themeStore` from the zustand `persist` middleware, and instead **read `theme` from MMKV
synchronously at module load time** to use as the initial state. Saving happens explicitly inside
`setTheme`.

- The restore-wait window disappears, so the correct background and status bar apply from the first
  frame. **Boot delay is zero** (this does not conflict with ADR-0086's early-mount optimization).
- To stay compatible with existing user data, the read accepts both formats: plain text (`"dark"`) and
  the zustand persist envelope (`{"state":{"theme":"dark"},"version":0}`). **Writes are unified to
  plain text.**
- The web-side `parseTheme` (`usePreferenceStore.ts:121-130`) stays for bidirectional compatibility.

Make `useResolvedTheme`'s `getThemeBackgroundColor` the single source for background color, converging
the hardcoded `#121212`/`#ffffff` duplicates on the first-paint path onto this function.

### 3. Reapply the system bars idempotently

Detach `SystemBars`'s application from depending on a value change, and **reapply the current theme at
every point the OS can reset the appearance:** app foreground return (`AppState`), modal show/hide,
screen rotation. Reapplication must be idempotent and must run even when the value has not
changed — **because the essence of flaw 3 is "nothing happens when the value doesn't change."**

### 4. Keep the web as SoT, but add a native→web recovery path

- **The web keeps change authority.** No theme-change UI is built on native.
- **On boot, native forwards its stored theme to the web.** The first paint must be correct even if
  the web's cache is empty or it was reinstalled. The web receives this and applies it to its own store
  and localStorage.

    > **Implementation deviation:** this handoff was implemented not as a bridge message (a handshake
    > push) but as **injecting `window.CHATIC_APP_THEME` via
    > `injectedJavaScriptBeforeContentLoaded`.** A bridge message arrives **after** content load and
    > cannot fix the first paint, and the web-side receiver (`PreferenceLoader`) also only runs after
    > the session is ready. Injection runs before document parsing, so the pre-paint script can use the
    > value. As a result, no new contract was added to `libs/app-messages`/`libs/bridges` — the
    > contract-extension item above turned out to be unnecessary. Details:
    > [apps/mobile/docs/theme.md](../../apps/mobile/docs/system/theme.md)

- **Switch `SavePreference('theme')` to `request` and retry on failure.** The web UI reflects the
  change optimistically and immediately, while the bridge confirmation runs in the background, so a
  15-second timeout never blocks the user's action.

### 5. Complete the web's theme application scope

Have `ThemeApplier` update not just the `<html>` class but also `<meta name="theme-color">` and
`--splash-bg`, so in-app changes stay consistent without a reload.

**In:** `apps/web` (store defaults, the pre-paint script, `ThemeApplier`, bridge confirmation/retry,
receiving the native push), `apps/mobile` (`themeStore`'s synchronous init, `SystemBars` reapplication,
unifying the background color, the boot-time push), `libs/app-messages`/`libs/bridges` (the
native→web theme handoff contract), migrating the `'system'` stored value.

**Out (follow-up work):**

- **A `'system'`-selection UI.** All three current web toggles
  ([`SettingsControl.tsx:41`](../../apps/web/src/app/ui/components/SettingsControl.tsx),
  [`Sidebar.tsx:41`](../../apps/web/src/app/ui/components/Sidebar.tsx),
  `apps/web/src/app/features/mypage/pages/MyPage.tsx:91`) are binary light↔dark toggles. The value is
  supported but its entry point is a separate piece of work. **In this release, `'system'` stays a
  state no user can reach.**
- **`libs/theme` and its consumers (`admin`, `desktop-web`, `landing`).** Not even unifying their
  default is in this scope — that would grow the surface to verify to four apps. Retiring `libs/theme`
  and migrating to the `apps/web` pattern is handled by a separate ADR.
- **Dark variants of splash assets.** No Android `values-night/` or iOS colorset dark appearance is
  created — pinning the default to light actually makes the current white hardcoding more consistent,
  not less.
- **`SystemBars`'s modal show/hide trigger.** Only app-return and rotation are implemented. The
  reported repro conditions were app return and launch, and whether a modal actually resets appearance
  was not confirmed.
- Theme application at native's early stage (Kotlin/Swift).

## Alternatives

- **Remove `'system'` from the type entirely** (`ThemeMode = 'light' | 'dark'`) — would eliminate the
  whole path where both runtimes independently interpret the OS, the most robust option. Rejected
  because there is a product requirement to keep following OS settings. Instead, pinning the default to
  light keeps OS interpretation out of the **default path** only.
- **Switch native to be SoT** (MMKV as the origin, web only reflects it) — best cold-start consistency,
  but splits the web's standalone execution path (browser, desktop) from this, splitting the storage
  layer in two. Rejected.
- **Keep it one-directional + only reinforce reliability** (switch to `request` plus retry only) —
  smallest change, but the first paint is still wrong after a cache clear or reinstall. Rejected.
- **`skipHydration` + defer painting a color until restore finishes** — a smaller structural change,
  but it creates the reverse symptom of a white flash for dark-mode users, and adds a wait into the
  boot path. Since MMKV supports a synchronous read, there is no reason to wait at all — rejected.
- **Read MMKV and apply at native's creation stage (Kotlin/Swift)** — theoretically the most ideal,
  earlier than the Activity/ViewController background and the splash screen. But it needs new native
  code on both platforms, and a JS synchronous init alone resolves the reported symptom, so rejected
  for now (left as a follow-up option).

## Consequences

**What is gained**

- OS scheme interpretation disappears from the default path, removing the cause of both reported
  symptoms (the dark splash flash and the status-bar mismatch after return).
- The correct theme applies from the first frame, with no increase in boot delay.
- System bar reapplication becomes idempotent, automatically surviving future paths where the OS
  resets the flag (a new modal, a new screen).
- A lost bridge message no longer leads to a silent, permanent mismatch.

**Trade-offs accepted**

- `themeStore` leaves zustand `persist`, so its storage logic must be written and tested by hand — its
  pattern diverges from other stores (e.g. `useLanguageStore`).
- Compatibility code that reads two storage formats (plain text and envelope) sticks around for a
  while — it can only be cleaned up once every user has written once under the new version.
- `'system'` stays supported but unreachable until the follow-up work lands. The stored-value migration
  moves existing `'system'` users to light; anyone who wants dark must select it explicitly via the
  existing toggle.
- A native→web push at boot adds one more step to the handshake path. Failure to deliver while the web
  is not yet ready has to be handled.
- Leaving `libs/theme` in place means two theme implementations keep coexisting — `admin`,
  `desktop-web`, and `landing` can still interpret `'system'` as their default, and this inconsistency
  is deliberately deferred to a later piece of work.
