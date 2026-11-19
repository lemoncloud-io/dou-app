# host ports — how this app reaches what the host can do

> Scope: the `host` slot of `apps/web/src/config/`'s two declarations, `config/adapters/checkout/`, and
> `config/adapters/{media,files,links,appShell,signIn,diagnostics,push}.ts`.
> The port types and the adapters are [`@chatic/runtime-web`](../../../../libs/runtime-web/README.md#the-host-port-adapters);
> the host profile they read is [`@chatic/bridges`](../../../../libs/bridges/README.md#the-host-profile).

What the host does for a feature — sell a subscription, pick and move files, open links, run the app's
frame, sign in, collect diagnostics, receive push — reaches the feature through a host port, never
through `isNative()` or a `CHATIC_APP_*` global. The declaration `main.tsx` starts from names one
adapter per port, and `startRuntime` builds and publishes them once, right after it initialises config
and before the runtime boots. Each port's default, `<port>.host` (`checkout.host` for checkout), answers
what the host declared — or, for a shell built before declarations, the port's legacy rule — exactly as
the entry's own chooser did before. A feature reads `runtime.<port>` from `@chatic/runtime` where it
uses it; push's members join the push hooks' group one by one (`runtime.push.notifications`, …).
Read before the publish, a port — or a push member — throws an error that names it (for example
`push.notifications.onReceive`), so a module that reads one at module scope fails loudly.

Inside a shell (`web-hybrid`) a `port.<name>` toggle may move one port: to `<port>.browser`, the page
doing the work, or to `<port>.shell` where the shell declared that it does it; checkout to the store or
the website where the host offers them, or to nothing. In a browser tab (`web-browser`) every port has
its default alone — the page already does everything itself.

## Every port carries the work

A port carries what the host does, not only who does it. Each but checkout still has `kind`
(`appShell` and `signIn` add `os`), published from the declaration's keys or, before them, the legacy
rule, and only the declaration part and the log pipeline (below) read it: a feature calls the port's
members and never branches on `kind`. The contracts are runtime-client's (`host/<port>.ts`). This app's
two implementations of each are in `src/config/adapters/<port>.ts`: the shell side through `appBridge`
(and `webClient` for the messages it does not wrap), the page side with what any browser offers.
runtime-web's `<port>Adapters` turn them into the `<port>.host`, `.shell` and `.browser` adapters the
declarations name.

**What every host does is a method; what only some hosts have is a member that is `null` where the
host lacks it.** A feature asks for the member (`runtime.links.contacts`), not for the side, so a toggle
that moves one port to the page, or a host that does the work a third way, changes nothing in it.

- **media** — the phone app's `picker` (its own picker for photos, videos and documents),
  `photoLibrary` (the device library the in-app grid reads), `videoConverter` (turns a video it keeps
  into one the server takes, with its poster) and `cameraPermission` (asked before the page opens a
  capturing input: Android's WebView never asks for itself, so without it a refusal never reaches the
  page). All four are `null` in a browser, where the attach panel opens the page's own input.
- **files** — `put` everywhere: the phone app's transfer module, which hands the page's own PUT
  whatever it does not move itself, or the page's PUT in a browser. The phone app's `transfers` is its
  transfer module — `putShellFile`, `syncUploads`, `openFile`, `saveFile`, `readVideoFrame` — and
  `null` in a browser, where the page PUTs, fetches and saves the file itself and draws frames from the
  bucket. The module is made once per page, on the first upload, so every waiting upload stays
  reachable from its one event listener.
- **links** — `openUrl` and `copyText` everywhere (the OS browser and `CopyToClipboard` in the phone
  app; `window.open` and the Clipboard API in a browser). The phone app's `shareSheet`, `shareIntake`,
  `contacts`, `sms`, `linkPreview` and `subWebView` (open one, and hear every close through
  `onClosed`) are `null` in a browser. Read by `openExternalUrl`, the clipboard copies, share intake
  (`bridge/shareIntake.ts`), sub web views (`bridge/subWebView.ts`), contact and SMS invites, invite
  links, link previews and the licenses page's link. `subWebView.onClosed` is heard by the mini-app
  launcher (`useMiniAppLauncher`, which answers the hub it opened) and the debug sub-view screen; in a
  browser there is no close to hear, since the page opens in a tab.
- **appShell** — `ownsWindow` and `reportsKeyboardHeight` (the keyboard in the attach panel), and the
  phone app's `haptics`, `preferences` (its own store: the theme and language sync, the preference
  loader), `backGesture`, `iconBadge` (the badge `UnreadBadgeRunner` reads for logs; the iOS/Android
  split lives in the implementation), `appIcon`, `storeUpdate` (the update check, the update prompt,
  the required-update screen and the settings page's store link) and `systemSettings` (the app's page
  in the OS settings, which the contact invite's permission banner, `PermissionDeniedBanner`, opens).
  `dockBadge` and `selfUpdate` are the desktop app's
  ([desktop-web `docs/host/`](../../../desktop-web/docs/host/README.md)), `null` here; in a browser
  every capability is `null`.
- **signIn** — `sessionScope` (`device` in the app, which keeps its own registration and, signed in
  through an approval, signs out with its approver; `tab` in a browser), `approvesPairing` (the app
  only) and `requestsPairing` (both), and the phone app's `providerSignIn` — the providers it offers,
  Apple's on iOS only, and two ways to run its native sign-in. The login page calls `start(provider)`
  and hears the outcome through `onResult` (credential, cancel or failure, each an `OnOAuthLogin`
  message), with no deadline, since the person may take as long as they need at the provider's
  screens; account linking awaits `credential(provider)`, which resolves with the credential in hand.
  Social sign-in and linking are offered only where `providerSignIn` is there, since a browser cannot
  obtain the raw provider token linking needs; the pairing screens read the pairing fields.
  `relayOAuth` is desktop-web's, `null` here.
  The subscription entries that depend on how a subscription is bought — My page's row for a guest and
  the cloud-manage page — read `runtime.checkout`, not this port.
- **diagnostics** — `entry` (telemetry's entry point: `icon` or `browser`), and the phone app's
  `debugMode` (the debug switch), `bootMetrics` and `pendingReports` (the pending-report flusher),
  `null` in a browser. The log pipeline — the console listener, the log context and uploader, and who
  held the session — is wired before the ports are published, so it still reads the choice, through
  `config/diagnosticsKind.ts`.
- **push** — the phone app's `notifications` (banner taps and deliveries while the page is open; the
  invited-cloud runner listens to it, and `usePushNavigate` recovers an evicted invited cloud before a
  tap's switch only where it is there) and `deviceToken`, `null` in a browser. `deviceToken` is what
  registers the device: `useDeviceTokenRegistration` builds its delegate only where the member is
  there and the shell injected its platform, the push-mute toggle (`useDevicePushMute`) is supported
  under the same gate, and the debug page reads the same member, so the three cannot disagree.
  `tokenRenewal` and `localBanner` are the desktop app's, `null` here: the phone app raises its
  banners from the push itself and picks a renewed token up at the next launch. `runtime.push` was
  already the push hooks' group, so the port joins it member by member — `runtime.push.kind`,
  `runtime.push.notifications`, … — rather than replacing it.

`@nx/workspace-host-port-kind` (`tools/eslint-rules/host-port-kind.js`) reports a read of `kind` (and of
`os` on `appShell` and `signIn`) off any of these seven ports anywhere but `apps/*/src/config/**` and
tests. A test starts from `browserMedia()`, `browserFiles()`, `browserLinks()`, `browserAppShell()`,
`browserSignIn()`, `browserDiagnostics()` or `browserPush()` (`@chatic/runtime/testing`) and lays the
members it watches on top.

Identity and config values the shell injects — device ids, version, stage, the config bag — are not
ports: they are read from `@chatic/bridges` (`hostProfile().globals`, or `liveShellGlobals()` /
`liveShellValue()` where the shell rewrites them after load).

## Where the members decide

- **Attaching.** The picker (`bridge/attachmentPicker.ts`) and the photo library
  (`bridge/photoLibrary.ts`) are unsupported where their member is `null`, and the attach panel then
  opens the page's own input. The recent-photos strip shows outside the grid only with a
  `photoLibrary`; the camera input waits for the app's camera permission (`ChatImageAttach`,
  `bridge/cameraAccess.ts`) only where there is a `cameraPermission`; a send hands a video to the app
  to convert (`useSendImages`) only with a `videoConverter`.
- **Moving files.** `shellUpload` hands uploads to `files.put` and catches up with the ones the app
  finished through `transfers.syncUploads`. With a transfer module, `useFileDownloads` lets the app
  download, keep, open and share a document, and the video-frame maker (`useVideoFrames`) asks the app
  for a video's first frame. `shellDownload` catches up with the app's downloads where there is a
  transfer module — and also wherever the handshake (`shellCapabilities`) allows image export, since
  saving or sharing a photo or video uses the same downloads but is decided by the handshake, not by
  this port.

## checkout

| What the host sells through | Implementation                          | What it does                                                                           |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `apple`, `google`           | `adapters/checkout/storeCheckout.ts`    | The store's catalog, purchase, finish, held purchases and management, over `appBridge` |
| `web`                       | `adapters/checkout/webCheckout.ts`      | Leaves for a page of the website (`leaveForWeb`); the purchase completes there         |
| nothing                     | `{ kind: 'none' }` from `checkout.host` | Nothing to sell                                                                        |

The phone app declares its store and the desktop app declares that it sells nothing, from the first
builds made after they began to declare; the e2e fake shell declares as the phone does. A shell that
declares nothing — an older build — is answered as before: a bridge means a store (Apple's when the
injected platform is `ios`, Google's otherwise), and no bridge means the website. A declaration
(`CHATIC_APP_CAPABILITIES.checkout`) can say otherwise, which is what lets a development shell with a
bridge check the website's checkout — the virtual shell's `DOU_SHELL_CHECKOUT`
([shell-adapter § Checkout](../../../shell-adapter/README.md#checkout)).

**A purchase settles from the shell's events, not from its reply.** `Purchase` is posted; the shell
pushes `OnPurchaseSuccess` or `OnPurchaseError` later. `storeCheckout` listens to both for as long as
the port lives — from boot on — and settles the one purchase that is waiting, or gives it up as
`timeout` after 60 seconds. Every store failure is logged there: a cancellation as `info`, anything
else as `error`. The subscription feature (`useSubscriptionIap`) refuses a guest and a missing social
link before it asks the port, validates the receipt with the relay, then finishes the purchase.

**What goes to the store is shaped per store.** Google receives the offer token, the new plan and, on a
tier change, the old plan, without which it books a second subscription instead of a replacement;
Apple receives the product id alone.
