# ADR-0314: A session the phone app's runtime held ends by restarting the app's JS context

> Status: Accepted · Decided: 2026-11-15 · Implemented: `feat/native-session-end`
> · Scope: `apps/mobile/src/app/services/appRestart/` (the restart note, `chatic-app-restart`);
> `apps/mobile/src/app/bridge/AppRestartBridge.ts` with `ios/Bridges/AppRestartModule.m` and
> `android/.../module/AppRestartModule.kt` with `bridge/AppRestartPackage.kt`, registered in
> `MainApplication.kt` (the reload); `services/runtime/restartOnSessionEnd.ts`;
> `features/main/screens/MainScreen.tsx` (the first address after a session's end);
> `webview/hooks/useDeepLinkNavigation.ts` (`skipColdStart`); the development owner switch —
> `services/runtime/sessionOwnerSwitch.ts`, `webview/hooks/useSessionOwnerHandler.ts`,
> `libs/bridge-messages/src/types/model/session-owner.ts` (`FetchSessionOwner`, `SetSessionOwner`) and
> the web debug overlay's Session owner screen
> · The behaviour is documented in [apps/mobile docs/runtime](../../apps/mobile/docs/runtime/README.md)
> · Amends: [ADR-0309](./0309-the-phone-shell-may-own-the-session-settled-per-launch.md) — "per launch"
> now means per JS context, which the app can start over itself
> **Amended by [ADR-0322](./0322-the-apps-runtime-ships-switched-off-and-production-opens-the-owner-switch-in-debug-mode.md) (2026-11-16):**
> decision 5's switch is also answered by a production build while the app's debug mode is on; a
> production install moved onto the runtime stays there until it is moved back.

## Context

When a page holds the session, a sign-out ends with the page replacing its own document with
`/?logout=1`. The reload is what drops everything the session left in memory: the repository graph,
the sync engine and its room feeds, the background clouds, the credential renewers, the outboxes and
the image-send queue. The next document starts empty, and the `logout=1` it carries runs the last sweep.

When the app's runtime holds the session (ADR-0309), the runtime saves the same `logout=1` for its next
boot and calls the app's way home. Nothing listened. The runtime has no reload, and it cannot be
assembled again in the same JS context: `createRuntime` refuses a second call, and the packages it wires
— session, transport, sync, auth, data, app-runtime — each keep module-level state of their own (dozens
of maps, sets and singletons). The next account to sign in would inherit all of it.

The app also needed a way to turn the runtime on for testing. `writeSessionOwner` existed with no
caller, and the app has no native debug screen: its debug settings are shown by the web's debug overlay
over the bridge, as the custom web build switch already is.

## Decision

1. **A session's end restarts the app's JS context.** The runtime host's `onSessionEnded` listener
   (`restartOnSessionEnd`) reloads the React Native bundle. Every JS module begins again from nothing,
   which is the one way to drop the runtime's state that does not depend on every package listing what
   it holds. The process, the native modules and what is on disk stay — the vault, the cache database,
   the runtime's plain store with the saved `logout=1`.
2. **The reload is a native module of the app's own** (`AppRestart`): `RCTTriggerReloadCommandListeners`
   on iOS and the React host's `reload` on Android. Both work in a release build; `DevSettings.reload`
   does nothing there.
3. **The restart carries a note to the next context.** Before it reloads, the app writes
   `{ reason, homeSearch?, at }` to its own MMKV file; the next context reads it once and removes it.
   The main WebView's first load opens the base address with `homeSearch` (`logout=1…`), so the page
   boots as one that signed itself out, in the same single load the restart causes anyway. Only the
   first: a page booted with `logout=1` empties the vault, so a later mount must not repeat it over a
   session signed in since. A note older than thirty seconds is ignored — the process died before its
   reload, and the launch that finds it is the OS's — and a context restarts at most once.
4. **A restarted context skips the cold-start lookups.** The OS keeps answering `getInitialURL` and the
   initial notification with what launched the process; the previous context already followed it.
5. **The owner switch lives in the web's debug overlay and is gated by the build's stage.** Two
   requests, `FetchSessionOwner` and `SetSessionOwner`, are registered only by a build whose baked
   `VITE_ENV` is not production. Setting a different owner records it and restarts the JS context, which
   reads the owner again — "settled once per launch" becomes "settled once per JS context".

## Alternatives

- **Tear the runtime down in place.** Give every package a dispose that empties its module state, then
  build a new runtime in the same context. Rejected: it touches every core package, and it is only as
  good as its completeness — a map someone adds later and forgets to clear carries one account's data
  into the next with no test that would notice. A new context is complete by construction.
- **Only send the WebView home.** Navigate the page to `/?logout=1` and keep the runtime. Rejected: the
  page would be fresh while the session's memory, which now lives in the app, would not.
- **Restart the process.** Kill the app and relaunch it. Rejected: iOS does not let an app relaunch
  itself, so the person would land on the home screen and have to open the app again.
- **A third-party restart library** (`react-native-restart`). It does the same two calls. Rejected for a
  dependency with its own native code and release cycle where twenty lines of the app's own suffice.
- **Gate the switch on `__DEV__`.** Rejected: it would exist only in a Metro debug build, not in the
  release builds of a test stage that testers install. The stage is what the custom web build switch
  is gated on, for the same reason — nothing in a page can change it.

## Consequences

- A sign-out on a runtime-owned launch costs a bundle evaluation and the app's services starting again,
  on top of the page's cold boot that a sign-out always had. The launch splash is not shown again; the
  web's own boot cover is.
- Sub WebViews are closed by the restart. That is what a sign-out wants.
- The boot metrics start over with the context, so a restart sends a `boot` trace and a `first_screen`
  sample typed as a cold boot. They need a type of their own before the runtime is turned on.
- A switch can change the owner while one side's "logout not confirmed" marker is set, which the other
  side does not read (ADR-0309's open item). The switch does not check; it is a development tool.
