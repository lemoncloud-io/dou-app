# bridge — the app-side seam over `@chatic/bridges`

> Scope: `apps/web/src/app/bridge/` (45 files). The transport itself — `webClient`, readiness
> polling, timeouts, the message vocabulary — is [`@chatic/bridges`](../../../../libs/bridges/README.md);
> this document covers only the wrapper this app builds on top of it.

`app/bridge/` is the one place in `apps/web` that touches `@chatic/bridges`. No feature imports
`webClient`, `appBridge`, or `isNative` from anywhere else — a feature that needs the native shell
goes through this folder's hooks.

```bash
grep -rln "from '@chatic/bridges'" apps/web/src/app/features --include='*.ts' --include='*.tsx'
```

This document is also the index for the category. Two subjects are large enough to own their own
file, and both are bridge code rather than feature code — there is no `features/notifications/`
folder:

| Document                                   | Owns                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| [push-navigation.md](./push-navigation.md) | Where a tapped push lands — path handover, session state, and the back stack       |
| [device-token.md](./device-token.md)       | The shell adapter that hands a push token to `runtime.push`, and its native mirror |

## Outbound: `appBridge`

`appBridge` (`appBridge.ts`) wraps the `webClient.post`/`webClient.request` calls the app makes —
70 methods, one per native capability (FCM tokens, OAuth, camera, clipboard, purchases, config
mirrors, and more). A feature calls `appBridge.openURL(url)`, never `webClient.post({ type:
'OpenURL', ... })` directly — that keeps the message-type strings and payload shapes in one file. The
exceptions are the modules that own a whole exchange with its own fallbacks and timeouts —
`attachmentPicker`, `shareIntake`, `audioRecorder` — which call `webClient` themselves.

| Pattern                  | Shape                       | When                                                                         |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------- |
| Request (native replies) | `await appBridge.method()`  | `fetchFcmToken`, `oAuthLogin`, `getContacts`, `fetchPreference`, …           |
| Fire-and-forget          | `appBridge.method()` (void) | `openURL`, `setBadgeCount`, `savePreference`, `notifyWebAppReady`'s siblings |

## Inbound: `useHandleAppMessage` and `GlobalBridgeListener`

`useHandleAppMessage(type, handler)` (`useHandleAppMessage.ts`) subscribes to one native→web push
event through `webClient.onEvent`; every `useOn<EventName>` hook in that file (17 of them —
`useOnNavigate`, `useOnPurchaseSuccess`, `useOnFetchFcmToken`, …) is a typed alias over it. It is
push-only: a request/response exchange goes through `appBridge`, never through one of these hooks.

`GlobalBridgeListener` (mounted once in `app.tsx`) is where the app-wide subscriptions live:
`useDeviceTokenRegistration()`, the download catch-up (`useShellDownloadCatchUp()`), the
`OnUpdateDeviceInfo` listener that feeds the version-check
store, and `useAppForeground` for dismissing the native resume overlay. A feature-local push (e.g. a
purchase result inside `useSubscriptionIap`) subscribes directly with its own `useOn*` hook instead
of routing through this component.

## File transfers: `shellUpload`

`shellUpload.ts` picks the PUT an image message uses and owns the one per-page native transfer
registry behind it: `getShellPut()` returns the native sender inside the app and the page's own
`xhrPut` in a browser, and `syncShellTransfers()` catches up with transfers the shell finished while
the page was away. The native sender lives in `runtime/upload/` and takes the bridge it talks
through as an argument, so this file stays the only place that hands it `webClient`; `xhrPut` comes
from `@chatic/data`, and the native sender also uses it for a page video or document.
Its consumer and the rest of the story → [feature/channels/image-send.md](../feature/channels/image-send.md).

## Downloads and capabilities: `shellDownload`, `shellCapabilities`

`shellDownload.ts` is the download side of the same transfer module: `getShellDownloads()` returns
the page's one download registry (`runtime/transfer/nativeGet`), and `syncShellDownloads()` catches
up with downloads that ended while the page was away; calls that overlap share one list request.
`useShellDownloadCatchUp()`, mounted once in `GlobalBridgeListener`, runs it when the handshake
allows export and on every return to the front. In a browser it does nothing.

`shellCapabilities.ts` keeps what the handshake reply said the installed app can do. The viewer's
save and share must be absent before anyone presses them, so `useCanExportImages()` is true only
once the reply lists both `SaveToPhotoLibrary` and `ShareFile`, and false until it arrives — and in a
browser, which gets no reply. `supports(type)` answers the same question for any one message, for the
features newer than the oldest app this page runs in (the sub WebView, the voice recorder).
`main.tsx` is the one place that sets the reply. The consumer →
[feature/channels/image-export.md](../feature/channels/image-export.md).

## Haptics: `haptics`

`haptics.play(kind)` asks the shell for one short haptic; the page has none of its own on iOS. Every
call is a one-way `post`, which the shell plays without answering. A browser is never asked. What home uses it for →
[feature/home/README.md](../feature/home/README.md#haptics).

## Voice messages: `audioRecorder`

`audioRecorder.start()` / `stop(action)` drive the shell's recorder (`StartAudioRecording`,
`StopAudioRecording`), and `onEnded` hears the end the shell pushes by itself — its five-minute limit,
or an interruption (`OnAudioRecordingEnded`). `isSupported` (and the `useCanRecordAudio` hook) is
`shellCapabilities.supports('StartAudioRecording')`: the voice entry is drawn only where the handshake
lists it, never in a browser or an app built before the recorder. The start waits up to five minutes,
since the first one waits on the OS permission prompt; a stop, thirty seconds. A stop answered
`NOT_RECORDING` comes back as `null` — the shell had already ended the recording and pushed it. The
button and its rules → [feature/channels/image-send.md](../feature/channels/image-send.md#voice-messages).

## A page on another origin: `subWebView`

`openSubWebView({ url, title, params, appId })` shows a page from another origin without leaving the app, as far
as the app it runs in allows, and says where it went:

| Where the page runs                           | What happens                          | Returns                         |
| --------------------------------------------- | ------------------------------------- | ------------------------------- |
| An app whose handshake lists `OpenSubWebView` | The shell's sub WebView, over the app | `{ via: 'subWebView', viewId }` |
| An app built before it                        | `appBridge.openURL` — the OS browser  | `{ via: 'external' }`           |
| A plain browser                               | A new tab                             | `{ via: 'browser' }`            |

`appId` names the app `url` was resolved from (`bridge/subWebViewApps.ts`); the shell builds the
page's share link from it, so a link the page shares names the app rather than where it is hosted.
A page link (below) never takes the two fallbacks above: it opens in the sub WebView or not at all.

The handshake is read through `shellCapabilities.supports('OpenSubWebView')`, so an older app is
never asked something it would answer `NOT_FOUND`. A refusal from an app that does have it
(`NOT_ALLOWED` for a URL off its allowlist, `ALREADY_OPEN`) rejects instead of falling back: it means
this page asked for something the app will not show, and opening it in the OS browser would hide
that. `useOnSubWebViewClosed` hears the view close, with its `viewId` and a `reason`: `user`, `host`
(this page called `appBridge.closeSubWebView(viewId)`), `system` (the shell closed it before a deep
link or a tapped push sends this page an `OnNavigate`), or `page` (the page finished, and `result`
carries what it handed back). Handle an unknown reason too: an app released later may add one.
`params` (JSON, at most 16 KiB) reach the page only in the sub WebView, as
`window.ChaticSubWebView.params`; the two fallbacks cannot carry them.

Only pages under `*.apps.chatic.io` (`*.apps-dev.chatic.io` in dev), which the app's review pipeline
alone deploys to, can be opened — never this web app's own origin, and not an arbitrary site. The
page talks only to a host of its own with a few messages, and has none of this app's state; the
shell's side, and what it allows, is
[`apps/mobile/docs/webview/sub-webview.md`](../../../mobile/docs/webview/sub-webview.md).
An app link to a page (`app.chatic.io/apps/<appId>?…`) opens one too, through `OnNavigate` — see
[push-navigation.md](./push-navigation.md). No product screen opens one yet. The debug panel's
**Sub WebView (app)** screen opens one and logs how
it closed; the Bridge screen's `OpenSubWebView` preset sends the same request but shows no close event.

## Foreground detection

`useAppVisibility` (`useAppVisibility.ts`) merges two independent signals — the native
`OnBackgroundStatusChanged` message and the web `visibilitychange` event — because a plain browser
tab never gets the native message and a suspended WebView can miss `visibilitychange`. Same-direction
repeats within a 1s window are collapsed; `useAppForeground` is the filtered "came to foreground
only" view most callers use.

## The Purchase exception

Every other outbound call resolves through its own request/reply. `Purchase` cannot: the native
shell answers with `OnPurchaseSuccess` / `OnPurchaseError` push events instead, arriving on their own
timing relative to the store checkout flow. `appBridge.purchase()` is therefore `void`, and
`useSubscriptionIap` (`features/subscription/hooks/`) holds a `purchaseResolverRef` that the two push
handlers resolve or reject — turning an event pair back into the `Promise` the call site needs.

## Device token registration

Summarised here; the file-level detail is [device-token.md](./device-token.md). Registration policy (auth gating, once-per-install dedup, retry) lives in `@chatic/app-runtime`'s
`runtime.push`. `useDeviceTokenRegistration.ts` supplies only the three pieces only this shell can:
the FCM token fetch (`appBridge.fetchFcmToken()`), the platform read off
`window.CHATIC_APP_PLATFORM`, and a native-side mirror of the registration record
(`appBridge.fetchPreference` / `savePreferenceConfirmed`) so a WebView storage clear cannot look like
a fresh install. Outside the native shell `CHATIC_APP_PLATFORM` is unset, the delegate is `null`, and
the runtime hook is a no-op.

## Without a native shell

`isNative()` (from `@chatic/bridges`) is false in a plain browser tab, and every `appBridge` request
call rejects `NATIVE_NOT_SUPPORTED` after its timeout instead of resolving. A caller that can avoid
paying that wait branches on `isNative()` first rather than calling through and catching.

## Related

- Preference read/write over the bridge (`FetchPreference`, `PreferenceLoader`) is
  [stores.md](../state/stores.md).
- The web→native log relay (`setupBridgeLogger`) is [logging.md](../observability/logging.md).
- Push-tap routing (`app/bridge/navigation/`) is [push-navigation.md](./push-navigation.md).
