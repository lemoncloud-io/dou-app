# ADR-0146: Haptics are played by the shell, on a web request named by feel

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/app-messages/src/types/model/haptic.ts` · `apps/web/src/app/bridge/haptics.ts` ·
> `apps/mobile/src/app/bridge/HapticBridge.ts` · `apps/mobile/ios/Bridges/HapticModule.m` ·
> `apps/mobile/android/.../module/HapticModule.kt`
> · The module docs are [apps/web home README](../../apps/web/docs/feature/home/README.md#haptics),
> [apps/mobile native README](../../apps/mobile/docs/native/README.md) and
> [libs/app-messages README](../../libs/app-messages/README.md)

## Context

Home's pull-to-refresh and its new row swipe both have a decisive moment — the point past which
letting go refreshes, or opens the row's actions. A light haptic there is what makes the threshold
feel like one, and it is what the same gestures do in native lists.

The page cannot make one. WebKit implements no `navigator.vibrate`, so on iOS a WebView has no haptics
at all; Android's WebView has the Vibration API, but that is a raw motor pulse rather than the
platform's tuned effects, and it needs the VIBRATE permission.

## Decision

**The web asks the shell with a new bridge message, `TriggerHaptic { kind }`, and the shell plays it
natively.**

- **The kind names a feel, not a gesture**: `selection` (the lightest tick) and `impact` (a short,
  firmer tap). The web picks the feel; each shell maps it to its platform. A new gesture reuses a feel
  instead of adding a message value.
- **iOS** uses `UISelectionFeedbackGenerator` and a light `UIImpactFeedbackGenerator`. **Android**
  uses `performHapticFeedback` on the window's view (`CLOCK_TICK`, `VIRTUAL_KEY`), which needs no
  permission and is skipped when the user has turned touch feedback off. Both are small native
  modules of our own, not a library: two calls per platform do not justify a dependency and a pod.
- **The first haptic is a request; the rest are posts.** The web ships ahead of the app, and the
  first reply is how it tells a shell that knows the message from one that answers `NOT_FOUND`. One
  `NOT_FOUND` settles it for the session and nothing more is sent; a browser is never asked — the
  pattern the photo picker already uses. After one success, every haptic is a one-way post with no
  `refId`, which the shell plays and does not answer, so a reply never crosses back on the UI thread
  in the middle of a gesture.
- A shell with the message but without the native module (a JS change on a build whose native code
  predates it) answers success and plays nothing, silently — a warning would repeat on every gesture.

## Consequences

- **Haptics arrive with an app release.** Until then an installed app answers `NOT_FOUND` once and
  the gestures are silent, exactly as before.
- **Every haptic costs one bridge message**, and only the first an answer. Fine for a tick per
  gesture; this is not a channel for continuous feedback.
- **The device's own setting wins** on both platforms, so there is no in-app switch for it.
- A kind this shell does not know is refused with `INVALID_KIND`, so a later web can add a feel
  without breaking an older app.

## Alternatives

- **`navigator.vibrate` where it exists.** Rejected: nothing on iOS, a coarse pulse on Android, and a
  permission for it.
- **A haptics library** (`react-native-haptic-feedback` or similar). Rejected for now: it brings a pod
  and a native dependency to update for what is two calls per platform.
- **Posts only.** Rejected: an old shell's `NOT_FOUND` would come back to nobody, and the web would
  go on sending it on every gesture for the life of the session.
- **Requests only.** Rejected: each would send a reply back through `evaluateJavaScript` on the UI
  thread, mid-gesture, that nobody needs after the first.
