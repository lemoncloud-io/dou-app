# ADR-0027: First round of RN-WebView hybrid boot optimisation (shortening the native pre-webview stretch)

> Status: Accepted · Decided: 2026-07-23

## Context

`apps/mobile` is a hybrid: a native shell hosting a single WebView. Boot is entirely serial, so any
native pre-webview delay pushes the start of the WebView URL load (`load-start`) back wholesale.

Earlier instrumentation (`boot-performance-instrumentation`, commit `1c32ac84`, already on develop)
measured (v0.19.2, eight cold boots) the native pre-webview stretch at **53% of boot (580ms on
average)**, with wide cold variance (326 → 882ms). The detailed bottlenecks, measured from the JS
entry:

- `app-mount → main-screen`: 251ms — mounting NavigationContainer plus two layers of navigator
- `main-screen → load-start`: 206ms — creating the WebView instance plus preparing the injection script

**Constraints and evidence (from reading the code):**

- The entry point `main.tsx` → `App.tsx` imports the `./services` barrel, so the `provider.ts:174`
  singleton is constructed synchronously before registerComponent. Its constructor synchronously
  instantiates MMKV, opens SQLite, and builds nine DataSources plus cache, upload, IAP, icon, SMS, OAuth
  and Crashlytics (`provider.ts:81-164`).
- `App.tsx:56` gives `SafeAreaProvider` no `initialWindowMetrics`, so children wait for an asynchronous
  inset measurement round trip.
- `RootNavigator` (a native stack with one screen, `MainNavigator`) plus `MainNavigator` (a native stack
  with one screen, `MainScreen`) → two redundant native containers.
- `AppWebView.tsx:58,72-76` calls synchronous DeviceInfo bridges (`getUniqueIdSync()`,
  `getApplicationName()`, `getDeviceId()`) on the critical path of the injection script — which is
  needed before the WebView is created — on every render.
- Already fine: the WebView source URL is the static `Config.VITE_WEBVIEW_BASE_URL`, `initTables()` is
  void, IAP and deeplink init are asynchronous in useEffect, and handler registration buffers events so
  it does not block the load.

**A correction to the history:** the same plan was implemented up to 4.1–4.3 on an earlier branch,
`claude/boot-performance-optimization-d90642`, but it never merged to develop and survives neither
locally nor remotely (lost). So **all four steps are implemented afresh** on this branch (based on
`develop`). This session **can measure BootMetrics on a real device before and after a cold boot**, so
the discipline applies in full: one independent commit per step, at least three measurements on a real
device with the median compared, and a revert of just that step when it shows no effect.

## Decision

Shorten the native pre-webview stretch in four steps, lowest risk first. Each step is an independent
commit with a before-and-after BootMetrics comparison. The `disciplined-implementation` rules (English
comments, a verification checklist, unit tests) apply.

**4.1 Pass `initialWindowMetrics` to `SafeAreaProvider` (low risk, high value)**
Injecting `initialWindowMetrics` from `react-native-safe-area-context` removes the asynchronous inset
measurement round trip, so the navigator and MainScreen render on the first frame. This hits
`app-mount → main-screen` directly.

**4.2 Cache the synchronous DeviceInfo calls at module level (low risk, medium value)**
Promote `getUniqueIdSync()`, `getApplicationName()`, `getDeviceId()`, `getVersion()` and
`getBuildNumber()` to module-level constants computed once (version, build and userAgent already are —
`AppWebView.tsx:28-32`). That removes the synchronous bridge round trips from computing the injection
script prop. A unit test pins the injected values as unchanged.

**4.3 Merge the navigator stacks (medium risk, high value)**
Merge into **a single native stack** where `RootNavigator` hosts `MainScreen` directly, and delete
`MainNavigator`. The contracts are preserved:

- Flatten `RootStackParamList` (`{ Main: undefined }`), drop the nested `MainStackParamList`, and update
  the `navigationRef` type.
- Flatten the deeplink native route state to a single level. `deeplinkUtils.ts:409` today produces
  `{ routes: [{ name: 'Main', state: { routes: [{ name: 'Main' }] } }] }` → `{ routes: [{ name: 'Main' }] }`.
- **The Debug and Modal native routes are dead paths, unregistered in the navigator**
  (`useDeepLinkNavigation.ts:81-82` says so in a comment, and `ModalScreen` and the Debug screens are
  confirmed unregistered) → the nested branch goes.
- **Invariants kept:** the web-route `OnNavigate` path, the `navigationRef.reset()` calling convention,
  and `useDeepLinkNavigation`'s cold and warm capture flows. `deeplinkUtils.test.ts` is updated.

**4.4 Make non-essential provider initialisation lazy (medium-high risk, high value, last, service by
service)**
Convert the layers the WebView URL load does not need into lazy getters (built on first access). Lazy
getters are used instead of an `InteractionManager` delay, which structurally removes the "not ready
when first used" risk.

- **Stays eager (the boot and webview critical path):** `logService`, `consoleLogger`,
  `keyValueStorage (MMKV)`, `bootMetricsService` (foundational and cheap), `deeplinkService`,
  `deeplinkManager`, `notificationService` (a cold start calls `getInitialUrl` /
  `getInitialNotification` on the first render), and **`firebaseCrashlyticsService` (crash
  observability during boot beats the performance — observability wins)**.
- **Goes lazy:** `sqliteDatabase` plus the nine DataSources, `cacheCrudService`, `cacheSearchService`,
  `testRecordService`, `uploadService` (the heaviest), `subscriptionIapService`,
  `dynamicAppIconService`, `smsService`, `oauthService`, `clipboardService`, `permissionService`,
  `preferenceService` and `deviceService`.

**Scope:**

- In: the four steps above (the native pre-webview stretch).
- Out: web-side bundle and runtime optimisation (round two), service worker caching (round three),
  deploy and CDN policy, and the uninstrumented stretch from the native app process to the JS entry.

## Alternatives

- **A WebView pre-warming pool** — rejected. RN creates the instance when the component mounts, so
  pooling costs more complexity than it returns. With a static source and a single webview, 4.1–4.3 are
  enough.
- **Delaying provider initialisation with `InteractionManager`** — rejected. If any path expects a
  delayed service synchronously right after the first render, it breaks with "not ready". A lazy
  getter's build-on-access guarantee is structurally safer.
- **Rebasing or cherry-picking the earlier `d90642` branch** — impossible; it is lost both locally and
  remotely. Implemented afresh.
- **Making Crashlytics lazy too** (as the document originally proposed) — rejected. It would leave a gap
  in crash reporting during boot. Observability first.

## Consequences

**What is gained**

- The goal: cut the cold-boot `load-start` median by **at least 150ms** (judged by comparing BootMetrics
  before and after).
    - **Measured (median of four cold boots): `load-start` 438 → 156.5ms, −281.5ms — past the goal.**
      The largest contribution was 4.1 + 4.3 (`app-mount→main-screen` 220ms → ≈0), then 4.4
      (`provider-ready` 54 → 4.5ms). 4.2 was not measurable. The details are in the measurement results
      in boot-optimization.md.
- One fewer native container layer, so a lower mount cost and a simpler structure.
- Independent commits per step, so a step with no effect or a regression is reverted on its own.

**Trade-offs and risks accepted**

- **4.3, merging the stacks:** code that depends on route names or the `navigationRef` contract can
  break → every reference was checked before merging (navigationRef call sites, the deeplink native
  route state, and confirming Modal and Debug are unregistered). A regression smoke test (deeplink
  entry, the back button, returning to the foreground) is mandatory.
- **4.4, lazy SQLite:** when the web sends its first cache message, opening SQLite happens
  synchronously on first access, so that path can be slower. **Confirm the trade-off by measuring on a
  real device** and, if it matters, return just that service to eager.
- **Measurement noise:** variance between cold and warm states is large, so each step is measured at
  least three times and the medians compared.

**How it is verified**

- Per step: a type check, the relevant unit tests, and a BootMetrics before-and-after comparison over
  three cold boots on a real device (through the boot performance screen).
- Regressions: deeplink entry, the back button, returning to the foreground, and the first use of
  anything made lazy (cache, upload).
- The verdict: goal met if the `load-start` median improves by at least 150ms.
- Known pre-existing failures (baseline, unrelated to this change): the worktree type check's stale
  `@lemoncloud/chatic-sockets-api` plus six missing nx-svg typings, and the native-stack ESM transform
  not configured for `useDeepLinkNavigation.test.ts`.
