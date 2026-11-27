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

This document is also the index for the category. Four subjects are large enough to own their own
file. Two are bridge code rather than feature code — there is no `features/notifications/` folder —
the third is the host ports this app's declarations choose (`src/config/`), and the fourth is the native
transfer senders in `app/runtime/`:

| Document                                             | Owns                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [push-navigation.md](./push-navigation.md)           | Where a tapped push lands — path handover, session state, and the back stack                                                            |
| [device-token.md](./device-token.md)                 | The shell adapter that hands a push token to `runtime.push`, and its native mirror                                                      |
| [host-ports.md](./host-ports.md)                     | The host's ports the declarations choose at boot, and checkout's implementations                                                        |
| [native-transfers.md](./native-transfers.md)         | Why native uploads and downloads are sent, caught up and acknowledged the way they are                                                  |
| [native-request-rules.md](./native-request-rules.md) | Timeouts that differ from the default, OAuth start, the in-app picker, camera access, share intake, sub WebView links, foreground dedup |

## Outbound: `appBridge`

`appBridge` (`appBridge.ts`) wraps the `webClient.post`/`webClient.request` calls the app makes —
70 methods, one per native capability (FCM tokens, OAuth, camera, clipboard, purchases, config
mirrors, and more). Code calls `appBridge.openURL(url)`, never `webClient.post({ type:
'OpenURL', ... })` directly — that keeps the message-type strings and payload shapes in one file. Where
the work belongs to a host port (media, files, links, the app's frame, sign-in, diagnostics, push), a
feature calls the port (`runtime.links.openUrl(url)`) and the shell implementation of it,
`@chatic/host-web-mobile-shell`, sends the same messages with the `webClient` that
`src/config/adapters/` hands it ([host ports](./host-ports.md)). A request with a long timeout of its
own — the picker's, the video conversion's, share intake's, a file open or save — carries it there;
`attachmentPicker.ts` and `shareIntake.ts` call the port's members. The
exception is a module that owns a whole exchange with its own fallbacks and timeouts — `audioRecorder` —
which calls `webClient` itself.

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

`shellUpload.ts` hands an image message the PUTs the host's `files` port carries: `getShellPut()` is
`runtime.files.put` — the app's transfer module where the app moves files, the page's own `xhrPut`
otherwise — `getShellFilePut()` sends a file the app keeps, and `syncShellTransfers()` catches up with
transfers the shell finished while the page was away; the last two exist only where the port has a
transfer module (`transfers`). The one per-page native transfer registry behind them is made in
`config/adapters/files.ts`, on the first upload. The native sender lives in `runtime/upload/` and
takes the bridge it talks through as an argument, so that adapter is the only place that hands it
`webClient`; `xhrPut` comes from `@chatic/runtime-web` (through `@chatic/runtime-hybrid-web`), and the native sender also uses it for a page
video or document.
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
[feature/home/README.md](../feature/home/README.md#haptics); the MY tab and its settings →
[feature/mypage/README.md](../feature/mypage/README.md#the-hubs-header-follows-the-other-tabs-and-the-screens-answer-by-touch).

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

| Where the page runs                           | What happens                             | Returns                         |
| --------------------------------------------- | ---------------------------------------- | ------------------------------- |
| An app whose handshake lists `OpenSubWebView` | The shell's sub WebView, over the app    | `{ via: 'subWebView', viewId }` |
| An app built before it                        | `runtime.links.openUrl` — the OS browser | `{ via: 'external' }`           |
| A host with no sub WebView (a plain browser)  | `runtime.links.openUrl` — a new tab      | `{ via: 'browser' }`            |

`appId` names the app `url` was resolved from (`bridge/subWebViewApps.ts`); the shell builds the
page's share link from it, so a link the page shares names the app rather than where it is hosted.
A page link the shell hands over (below) never takes the two fallbacks above: it opens in the sub
WebView or not at all. A page link tapped in a chat message is the user asking for a link, so in an
app without the sub WebView it goes to the OS as any other link does.

The handshake is read through `shellCapabilities.supports('OpenSubWebView')`, so an older app is
never asked something it would answer `NOT_FOUND`. A refusal from an app that does have it
(`NOT_ALLOWED` for a URL off its allowlist, `ALREADY_OPEN`) rejects instead of falling back: it means
this page asked for something the app will not show, and opening it in the OS browser would hide
that. `runtime.links.subWebView.onClosed` hears the view close (the mini-app launcher and the debug
sub-view screen listen), with its `viewId` and a `reason`: `user`, `host`
(this page called `appBridge.closeSubWebView(viewId)`), `system` (the shell closed it before a deep
link or a tapped push sends this page an `OnNavigate`), or `page` (the page finished, and `result`
carries what it handed back). Handle an unknown reason too: an app released later may add one.
`params` (JSON, at most 16 KiB) reach the page only in the sub WebView, as
`window.ChaticSubWebView.params`; the two fallbacks cannot carry them.

What an app opens depends on its handshake's `subWebViewOpenScope`, read through
`useSubWebViewOpenScope()`. An app that says nothing opens only the pages under `*.apps.chatic.io`
(`*.apps-dev.chatic.io` in dev), which the app's review pipeline alone deploys to. One that says
`anyHttps` opens any plain https site as well, in the `external` tier: no manifest, the bar titled
with its host. The web ships before the app, so a control that opens an arbitrary site — the Lab's
mini app list ([mypage](../feature/mypage/README.md#the-mini-app-card)) — is drawn only where the
handshake says `anyHttps`. A push or a page link still reaches only the reviewed pages. The page talks
only to a host of its own with a few messages, and has none of this app's state; the shell's side,
and what it allows, is [`apps/mobile/docs/webview/sub-webview.md`](../../../mobile/docs/webview/sub-webview.md).
An app link to a page (`app.chatic.io/apps/<appId>?…`) opens one too, through `OnNavigate` — see
[push-navigation.md](./push-navigation.md). So does a tap on such a link, or on a page's own address,
in a chat message (`openExternalUrl`); `bridge/subWebViewLink.ts` reads and opens both, for either
caller. The Lab opens one for its pages and its mini app card. The debug panel's
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

Summarised here; the file-level detail is [device-token.md](./device-token.md). Registration policy (auth gating, once-per-install dedup, retry) lives in `@chatic/runtime-core`'s
`PushRegistration`, which the app starts through `runtime.push`. `useDeviceTokenRegistration.ts`
supplies only the three pieces only this shell can: the token, from the push port's `deviceToken`
(`runtime.push.deviceToken`, which asks the shell); the platform the shell injected
(`CHATIC_APP_PLATFORM`, read off `hostProfile().globals`); and a native-side mirror of the
registration record (`appBridge.fetchPreference` / `savePreferenceConfirmed`) so a WebView storage
clear cannot look like a fresh install. Where the port has no `deviceToken` (a browser) or no platform
was injected, the delegate is `null` and the runtime hook is a no-op.

## Who holds the session: the hello at boot

On the phone the session can belong to the shell's own runtime instead of the page. Inside a shell
`main.tsx` starts the `web-hybrid` declaration, whose engine (`engine.mirror`: `engineCandidates` over `engineShell` and `engineLocal` from `@chatic/runtime-hybrid-web`)
settles which before any port is built (`settleSessionOwner`); a plain tab's `web-browser` settles
nothing, as no shell can offer there:

- **No offer** in `CHATIC_APP_RUNTIME`, as the host profile took it at boot (a browser, a shell that does not run its runtime) — the
  page holds the session, as it always has, and nothing is said to the shell.
- **An offer** — the page says `RuntimeHello` and waits. On `native` it builds the mirror
  (`createBridgedRuntime`) in place of the page's own runtime, builds none of the declared ports and never opens the device vault: no
  `prepareSecretStorage`, no late-vault reload, no watch for a vault that was locked at launch. The
  vault is the shell's for that launch. At a sign-out it deletes, besides its own signed-out keys, any
  copy of the session's tokens still in `localStorage` (`runtime.boot.discardWebSessionCopy`): such a
  copy is from an app without a vault, and the next launch the page owns would otherwise let it replace
  the vault's session (`libs/auth` docs/session, "The device vault at boot").
- **No settled answer** — it asks again for 30 s of the page being shown, behind the boot cover, then
  shows the error screen (`runtime/sessionOwnerUnsettled.tsx`) in place of the app. Its button reloads,
  and so does the app coming back to the foreground — a shell that could not answer while the device
  was locked may answer now. It never boots its own runtime as a way out: the shell may hold the
  session, and the page would be a second owner.

On a `native` launch the shell's runtime cannot reach the page's storage, so the page takes its own
signed-out keys (`runtime/signedOutKeys.ts` — the log pipeline's and the telemetry policy's) at each
sign-out and at the `?logout=1` boot that follows one, as the page's own runtime does on its launches
(the declarations' `signedOutKeyPrefixes`). Every log entry made inside the app after the settle carries
`sessionOwner` (`web` or `native`).

**The switch.** `VITE_SESSION_MIRROR_DISABLED=true` in a build makes the page never ask, so launches are
the page's again whatever the installed app offers — the rollback for the shell owning the session. Two
limits:

- **It needs the variable in the build.** The deploy workflows fill it from the
  `WEB_DEV_SESSION_MIRROR_DISABLED` / `WEB_PROD_SESSION_MIRROR_DISABLED` repository variables (`true`
  turns it on; unset or anything else leaves the page asking), so setting one does nothing until the
  next web deploy of that stage. A local `web:build:prod` reads it from `.env.prod`; it is listed,
  commented out, in `.env.example`. It is the rollback that reaches a launch the shell's runtime cannot
  survive: an app that dies while starting its runtime dies before `WebAppReady`, so the default owner
  below never reaches it, while a page that never asks never starts that runtime at all.
- **It takes effect from the next app process.** A page in a fresh process is the page's alone, and the
  shell, never asked, keeps its runtime off. A page loaded into a process whose shell already holds the
  session asks anyway: from bridge 2.35.0 the offer says so (`held: true`), and the page says hello
  whatever this switch says — and whatever contracts it shares, a mismatch ending on the error screen —
  because booting its own runtime there would make it a second owner (`session.owner_held_asked` in the
  log). An app before 0.32.4 never says `held`, so a page reloaded into such a process still boots a
  second session; while those installs remain, roll back by naming `web` as the default owner below and
  leave the mirror on.

**The default owner.** The switch above stops this page from asking; it does not tell the app where to
start. That is `VITE_APP_SESSION_OWNER` (`web` or `native`): once the app's `WebAppReady` reply lists
`SetDefaultSessionOwner`, the page sends the value on every boot (`runtime/sessionOwnerDefault.ts`), and
the app records it for installs nobody switched, from their next start. A production app from 0.32.1
starts those installs on its runtime by default, so naming `web` here is the rollback that needs no app
release. A launch left on the unsettled screen sends it too, without the handshake, since that is the
launch a rollback must reach. Unset sends `null`, which clears an earlier value; with `VITE_SESSION_MIRROR_DISABLED=true` the
page names `web`. The deploy workflows fill it from the `WEB_DEV_APP_SESSION_OWNER` /
`WEB_PROD_APP_SESSION_OWNER` repository variables, so a change needs a web deploy to land
(apps/mobile `docs/runtime` README, "The page's default").

## Without a native shell

In a plain browser tab there is no bridge, and every `appBridge` request call rejects
`NATIVE_NOT_SUPPORTED` after its timeout instead of resolving. A caller that can avoid paying that wait
asks its domain's host port first ([host-ports.md](./host-ports.md)) — `'browser'` there means no
bridge to ask — rather than calling through and catching.

## Related

- Preference read/write over the bridge (`FetchPreference`, `PreferenceLoader`) is
  [stores.md](../state/stores.md).
- The web→native log relay (`setupBridgeLogger`) is [logging.md](../observability/logging.md).
- Push-tap routing (`app/bridge/navigation/`) is [push-navigation.md](./push-navigation.md).
