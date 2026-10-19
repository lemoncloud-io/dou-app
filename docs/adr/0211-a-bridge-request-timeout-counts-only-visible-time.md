# ADR-0211: A bridge request timeout counts only visible time

> Status: Accepted · Decided: 2026-10-19 · Implemented: `fix/invite-sms-false-failure`
> · Scope: `libs/bridges/src/web/WebBridgeClient.ts` (every web → app request) ·
> `apps/web/src/app/features/invite/utils/sendInviteMessage.ts` · `apps/mobile/src/app/webview/hooks/smsHandlers.ts` ·
> `apps/mobile/android/app/src/main/AndroidManifest.xml`
> · Related: [ADR-0089](./0089-relay-dm-invite-and-auth-parallel-tracks.md) — the SMS composer with
> its clipboard fallback · [ADR-0167](./0167-bridge-requests-are-measured-before-the-bridge-is-split.md)
> — the request samples whose round trips this lengthens
> · The module doc is [`libs/bridges` scenario 7](../../libs/bridges/README.md#7-another-app-in-front-of-this-one)

## Context

An Android user sending an invite by SMS was told it failed. Production logs showed
`SendSms bridge request failed, falling back to clipboard` with `Request timed out after 15000ms`,
then the clipboard request timing out 15 s later. In the same runs, native cache reads took about
15 s, and then everything recovered at once.

Reproduced on an Android 16 emulator with a probe that timestamps every bridge message inside the
WebView:

- The host builds `OnSendSms` a few milliseconds after the request; `Linking.openURL` resolves as soon
  as the composer activity starts. The reply reached the page only when the app came back to the
  front — 58.8 s later in the measured run, 0.46 s after it was foregrounded — together with every
  other reply held in between.
- The page kept running the whole time. Its timers fired (heartbeats every second while hidden), and
  its messages to the host arrived live. Only the host → page direction was stopped.
- The reason is in React Native, not in this repo: `webViewRef.postMessage` is a WebView command, the
  Fabric renderer runs WebView commands only from its Choreographer frame callback, and
  `FabricUIManager.onHostPause()` removes that callback. Every path from the shell to the page is a
  WebView command, so no change in the shell can deliver a reply sooner.

Two more defects sat behind the same symptom:

- `OnSendSmsPayload` declares `data: { success }`, but the shell's handler replied `{ type, success }`
  with no `data`, and `sendInviteMessage` required `data.success`. Every composer that opened was read
  as a failure: the invite text was copied over the clipboard and the toast said "copied". The unit
  test mocked the declared shape, not the one the shell sent.
- The Android manifest declared no `<queries>` for `sms`. From Android 11 package visibility hides the
  SMS app from `canOpenURL`, so on stock Android the composer never opened at all. The production
  timeouts come from devices where the SMS app is visible anyway.

## Decision

1. **`WebBridgeClient` holds every request timeout while the page is hidden.** On `visibilitychange`
   to hidden it clears each running timer and keeps what was left of its budget, on the monotonic
   clock; on visible it re-arms that remainder, never less than 2 s. A request dispatched while hidden
   starts counting when the page shows. **Any message from the host also ends the hold**, because it
   proves the host can reach the page — so the hold never rests on the visible edge alone. The source
   is `document.visibilityState`, replaceable through the client's config.
2. **A resolved `OnSendSms` means the composer opened unless `data.success` is `false`.** That reads
   the replies of shells already installed (no `data`) correctly.
3. **The shell replies in the declared shape** — `success: true` with `data: { success }` — and keeps a
   failed reply for a call that threw.
4. **The Android manifest queries `sms`**, so `canOpenURL` finds the SMS app.

1 and 2 ship with a web deploy and stop the false failure for installed apps. 3 and 4 need an app
release.

## Alternatives

- **Hold the timeout only for `SendSms` and its clipboard fallback** (a per-request option). Smaller
  blast radius, but the stall is not specific to SMS: any request in flight when another app comes to
  the front, or when the user switches away, fails the same way. The native cache reads in the same
  runs did. Rejected for leaving those failing.
- **Treat a timeout after the page went hidden as success** inside `sendInviteMessage`. A guess where
  the real answer is on its way; it also leaves the clipboard request to time out behind it. Rejected.
- **Raise the SMS request's timeout** (a minute, five). There is no length the user cannot outlast
  while writing a message, and a longer timeout still counts time in which no reply can arrive.
  Rejected.
- **Deliver replies from the shell without a WebView command** (a native module calling
  `evaluateJavascript` directly). Possible, but it forks the reply path away from the one every
  handler uses, for a case the page can handle by itself. Rejected.

## Consequences

- A request whose host really is gone waits while the page is hidden and times out only after it
  shows, or after the next message from the host.
- **Hidden is not paused.** React Native stops delivering replies on any activity pause, including a
  partial cover — the chooser shown when several SMS apps exist and none is the default, a permission
  dialog, the share sheet — while the page stays visible. The timeout keeps counting there, as before;
  this decision does not close that gap.
- Desktop never holds: its window turns off `backgroundThrottling`, which keeps the Page Visibility
  API reporting `visible` while minimised, and its replies keep arriving then anyway.
- On iOS the app is suspended in the background, timers included. A timer that fell due during the
  suspension used to fire on return, possibly ahead of a reply on its way; it now gets its remainder.
  Not measured on a device.
- Request samples (`setRequestObserver`) still measure wall-clock round trips, hidden time included.
  A long `roundTripMs` from a backgrounded run is the user being away, not a slow host.
- On stock Android, inviting by SMS now opens the composer where it used to copy to the clipboard.
