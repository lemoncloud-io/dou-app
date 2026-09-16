# debug — the developer overlay and the gate in front of it

`apps/web/src/app/features/debug` is the app's only developer surface: a floating panel of **22
screens** that inspect runtime state, drive native bridge commands and read cached rows directly,
plus the hidden gate that decides whether that panel exists at all. There is no `/debug` route —
the panel is an overlay mounted beside the router, and the only way in is the gate.

This document covers what the feature owns and the rules that break things when ignored. How the
panel itself is put together, and why the app's own debug UI was folded into it, is
[observability/debug-panel.md](../../observability/debug-panel.md)'s subject.

## Layout

Things that sound like they are here and are not:

- **`webVitalsStore`** lives in `app/utils/`, not `metrics/`. The Boot and Perf screens read it;
  the reporter that feeds it (`app/utils/webVitalsReporter.ts`) is app-level because the server
  upload is not a debug feature.
- **There is no `tabs/` directory.** The tab strip is a projection of the same manifest the home
  menu uses (`DEBUG_TABS` vs `DEBUG_MENU_SECTIONS`), not a separate set of components.
- **There is no `debugMenu.ts`** and no `MiniPanel`/`ExpandedSheet`. One panel, one catalog.

## Responsibilities

**In** — the unlock gate and its dialog; the panel's navigation, sizing and chrome; the 22 screens
and their copy; the runtime metric collectors.

**Out** —

- **Where the unlock is triggered.** The tap target is on the Lab page, owned by
  [mypage](../mypage/README.md). This feature exports `useDebugUnlock` and the dialog; it does not
  own the screen they are mounted on.
- **The entry code and the stage policy.** Both are registry keys in
  [`@chatic/config`](../../../../../libs/config/README.md) (`debug.entryCode`,
  `debug.overlayEnabled`).
- **The log buffer itself.** The Log Buffer screen is a viewer;
  [`@chatic/logger`](../../../../../libs/logger/README.md) owns the queue, the listeners and the
  upload.
- **Push tap routing.** `app/bridge/navigation/` resolves an `OnNavigate` into a route — see
  [bridge/push-navigation.md](../../bridge/push-navigation.md). The Push screen only observes.

## The shared contract

### Three things can turn the panel on, and only one of them is a person

`useDebugMode()` reads one boolean, and it is an OR of three sources
([useDebugMode.ts](../../../src/app/features/debug/hooks/useDebugMode.ts)):

| Source                                | Set by                                            | Lives for                          |
| ------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `sessionStorage['chatic-debug-mode']` | the 10-tap + entry-code unlock                    | the tab                            |
| `window.CHATIC_APP_DEBUG_MODE`        | the native shell, injected at WebView boot        | the installed app's persisted flag |
| config row `debug.overlayEnabled`     | its own `byStage` rule (`LOCAL: true, DEV: true`) | the session                        |

The stage row is why a local dev never taps anything, and the reason it is a registry rule rather
than an `import.meta.env` check is that a repackaged shell cannot claim to be DEV: the row resolves
through `env.buildStage`. **On PROD all three are false until someone passes the gate**, and the
sessionStorage record is the only one that can become true there.

Disabling has to clear more than the record. `setDebugModeEnabled(false)` writes
`debug.overlayEnabled = false` on the local lane as well, because on LOCAL/DEV the stage rule is
what opened the panel and clearing only sessionStorage would leave it open. It also clears the
config unlock key, without which every `surface: 'dev'` control inside the panel renders disabled on
exactly the build where it is needed.

### The gate is a gesture and a code, and it fails closed

Ten taps within three seconds (the counter resets after three) raise the challenge dialog — but only
when an entry code is configured; without one the taps do nothing at all, silently. Three wrong codes
put the counter back to zero, and cancelling does the same. An unlock lives in `sessionStorage`, so
it ends with the tab, and the panel's own home can disable it.

The two halves do different jobs and neither replaces the other: **the gesture hides that a door
exists, the code asks whether you are allowed through it.** A person who hits ten taps by accident
meets a dialog they cannot pass, and three wrong answers put them back at zero taps.

`verifyDebugCode(input, expected)` is `!!expected && input === expected`, and the first clause is
the whole point — without it a build with no code configured would let `'' === ''` through. It is
not a timing-safe comparison, deliberately: the threat is an accidental arrival, and the code is
inlined in the bundle anyway.

### The entry code comes from the build and from nowhere else

`debug.entryCode` declares `envDefaultKey: 'VITE_DEBUG_CODE'` and `writableBy: []`. No lane can
supply it — not the shell, not local storage, not the panel's own settings screen. An unset secret
leaves it at `''`, which is the fail-closed above.

CI injects it into `.env` in four blocks (`deploy-dev.yml` ×1, `deploy-prod.yml` ×1,
`force-deploy.yml` ×2) from a secret named `<PREFIX>_DEV_DEBUG_CODE` / `<PREFIX>_PROD_DEBUG_CODE`.
The workflows strip empty assignments afterwards, so **whether the secret exists is the per-environment
on/off switch** — the wiring is already there, and an environment that should not have the panel
simply has no secret. The value is masked in Actions logs and plainly readable in the shipped
bundle; that is consistent with the threat model, not an oversight.

```bash
grep -rn "VITE_DEBUG_CODE" .github/workflows apps/web/.env.example
```

### One catalog, three sizes, three sections

[`screenManifest.ts`](../../../src/app/features/debug/overlay/screenManifest.ts) is the only place a
screen is declared. Everything else is derived from it: the home menu (`DEBUG_MENU_SECTIONS`,
grouped `info` → `tools` → `data`), the tab strip (`DEBUG_TABS`, every screen in menu order), the
lazy components (`screenRegistry.tsx`), the icons (`screenIcons.tsx`) and the forced sizes
(`DEBUG_SCREEN_SIZES`).

**Size is not navigation.** `mini`, `dock` and `full` change how much room the panel takes, never
which screens exist. `mini` and `dock` float and capture pointer events only inside themselves, so
the app underneath stays drivable while a screen watches it; `full` covers the viewport for content
the dock is too narrow for (`CacheTest` and `UploadTest` force it). Switching screens keeps the
current size unless the manifest demands otherwise, so the panel never resizes under the reader.

### Eight screens need the native shell

`requiresShell: true` marks a screen whose entire purpose is a bridge command — in a browser it
could only render buttons that fail. The panel checks once and shows a notice instead of the
screen, which replaces the per-screen `isNative()` checks that not every screen had.

```bash
grep -c "requiresShell: true" apps/web/src/app/features/debug/overlay/screenManifest.ts
```

The flag is **not** for a screen that merely has a native-only corner. Log Buffer, Cache Metrics and
the Bridge screen stay usable in a browser — the Bridge screen exists precisely to report that no
shell is attached. Shell presence is polled once a second while the panel is open
(`useShellPresence`), because the injected globals can appear after the web mounts.

### The overlay lives outside the router, and that costs it the contexts

`DebugOverlayHost` is mounted in `app.tsx`, outside both the `Router` and `AppRuntime`. That is what
keeps it reachable during a boot hang, when the router renders null and the panel is most useful.
The price is that it sits outside `ActiveCloudDataProvider` and `OtherCloudUnreadProvider`, so a
screen calling `useActiveCloudData()` throws "provider is missing".

`DebugObservationReporter` solves that by mirroring, not by re-observing: mounted inside the
providers in `AppRuntime`, gated on debug mode, it publishes the same objects into
`sharedObservationStore` for the panel to read. A second, independent observation would hide the
exact bug the inspector exists to find. With debug mode locked the reporter renders null and adds no
consumer at all.

The host also wraps the panel in its own `ErrorBoundary`. A crashing screen used to reach the
app-wide boundary and replace the entire UI — a read-only inspector taking the app down with it.

## Usage

The panel opens itself. The only calls from outside this feature are the Lab page's `useDebugUnlock`
— handed the `debug.entryCode` row — and `debugOverlayActions.open(size)` to jump straight to a size
once unlocked.

### How to add a screen

1. Write the component under `overlay/screens/`, exported by name.
2. Add an entry to `DEBUG_SCREENS` in `screenManifest.ts`: `key`, `icon` (a lucide name),
   `section`, a `load` that imports the component, plus `size` or `requiresShell` if it needs them.
3. Add the icon to `DEBUG_SCREEN_ICONS` in `screenIcons.tsx` — the map is typed against the
   manifest, so a missing one fails to compile.
4. Add `title` and `short` for the screen in **both** language tables in `i18n.ts`. The tables are
   `Record<DebugScreenKey, …>`, so the compiler asks for both.

Nothing else. The registry, the menu, the tab strip and the size rules all derive from step 2.

### What not to do

- **Do not write a label next to the screen that uses it.** Every string goes in `i18n.ts`, in both
  tables. A label written wherever the screen happens to be registered is how a single menu ends up
  listing some screens in English and others in Korean.
- **Do not fetch the panel's copy from `/locales/`.** The panel is what you open when boot is
  broken, and translations behind a network request come up as raw keys in exactly that case.
- **Do not put `import.meta` in a file that has a unit test.** ts-jest transpiles to CommonJS and
  the file stops compiling — indirectly too, through anything it imports. Keep verdict logic in
  pure functions and read env through the config registry.
- **Do not add a second catalog for "screens worth a tab".** The strip carries all of them in menu
  order. A hand-picked subset means a second rule about which screens deserve a chip, and the menu
  is one tap away regardless.
- **Do not let a screen consume a React context from the app tree.** Mirror it through
  `sharedObservationStore` instead; the host is out of tree on purpose.

## Notes for implementers and tests

- **`config.get('debug.entryCode')` answers `undefined` before `config.init()`.** That reads as
  "no code configured", which is the fail-closed path — correct, but it means an unlock attempt
  during a very early boot silently does nothing.
- **Unlock state is a module-level signal; tap state is component-local.** Every mounted
  `useDebugMode()` must see the same enabled flag the moment the Lab page unlocks, which is why it
  is a `useSyncExternalStore` signal that also subscribes to the config row. The tap counter and the
  challenge live in `useRef`/`useState` because only the screen attempting the unlock should know
  about them.
- **`main.tsx` sends `appBridge.setDebugMode(false)` on every boot.** It clears a persisted flag
  that older installed app builds still read; the native debug UI it used to gate no longer exists.
  Unlocking afterwards propagates with `setDebugMode(true)`.
- **`screenManifest.test.ts` is the catalog's guard** — unique keys, menu and registry in step, the
  tab strip in menu order, every icon resolvable, every screen named in both languages. A new screen
  that skips a step above fails there rather than at runtime.

    ```bash
    npx jest --config apps/web/jest.config.js features/debug
    ```

- **The panel needs an unlocked session to appear in a browser preview.** On a LOCAL build the stage
  rule opens it for you; otherwise set `VITE_DEBUG_CODE` in `apps/web/.env`, tap the Lab card's icon
  ten times within three seconds, and enter it.

## Further reading

- [observability/debug-panel.md](../../observability/debug-panel.md) — how the panel is assembled
  and what moved into it from the native shell.
- [push-verification.md](./push-verification.md) — the on-device runbook for the Push and Device
  Info screens.
- [mypage](../mypage/README.md) — the Lab page that hosts the tap target.
- [bridge/push-navigation.md](../../bridge/push-navigation.md) — what happens after a push is tapped.
- [`@chatic/config`](../../../../../libs/config/README.md) · [`@chatic/logger`](../../../../../libs/logger/README.md)
