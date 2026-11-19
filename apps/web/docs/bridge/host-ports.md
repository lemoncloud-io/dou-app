# host ports — how this app reaches what the host can do

> Scope: the `host` slot of `apps/web/src/config/`'s two declarations, `config/adapters/checkout/`, and
> `config/adapters/{links,appShell,diagnostics}.ts`.
> The port types and the adapters are [`@chatic/runtime-web`](../../../../libs/runtime-web/README.md#the-host-port-adapters);
> the host profile they read is [`@chatic/bridges`](../../../../libs/bridges/README.md#the-host-profile).

What the host does for a feature — sell a subscription, pick and move files, open links, run the app's
frame, sign in, collect diagnostics, receive push — reaches the feature through a host port, never
through `isNative()` or a `CHATIC_APP_*` global. The declaration `main.tsx` starts from names one
adapter per port, and `startRuntime` builds and publishes them once, right after it initialises config
and before the runtime boots. Each port's default, `<port>.host` (`checkout.host` for checkout), answers
what the host declared — or, for a shell built before declarations, the port's legacy rule — exactly as
the entry's own chooser did before. A feature reads `runtime.<port>` (`runtime.push.kind` for push)
from `@chatic/runtime` where it uses it.

Inside a shell (`web-hybrid`) a `port.<name>` toggle may move one port: to `<port>.browser`, the page
doing the work, or to `<port>.shell` where the shell declared that it does it; checkout to the store or
the website where the host offers them, or to nothing. In a browser tab (`web-browser`) every port has
its default alone — the page already does everything itself.

## links, appShell, diagnostics — ports that carry the work

These three carry what the host does, not only who does it. Each still has `kind` (`appShell` adds
`os`), published from the declaration's version-4 keys or, before them, the legacy rule, and only the
declaration part and the log pipeline (below) read it: a feature calls the port's members and never
branches on `kind`. The contracts are runtime-client's (`host/links.ts`, `host/appShell.ts`,
`host/diagnostics.ts`). This app's two implementations of each are in
`src/config/adapters/{links,appShell,diagnostics}.ts`: the shell side through `appBridge` (and
`webClient` for the few messages it does not wrap), the page side with what any browser offers.
runtime-web's `linksAdapters` / `appShellAdapters` / `diagnosticsAdapters` turn them into the
`<port>.host`, `.shell` and `.browser` adapters the declarations name.

**What every host does is a method; what only some hosts have is a member that is `null` where the
host lacks it.** A feature asks for the member (`runtime.links.contacts`), not for the side, so a toggle
that moves one port to the page, or a host that does the work a third way, changes nothing in it.

- **links** — `openUrl` and `copyText` everywhere (the OS browser and `CopyToClipboard` in the phone
  app; `window.open` and the Clipboard API in a browser). The phone app's `shareSheet`, `shareIntake`,
  `contacts`, `sms`, `linkPreview` and `subWebView` are `null` in a browser. Read by `openExternalUrl`,
  the clipboard copies, share intake (`bridge/shareIntake.ts`), sub web views (`bridge/subWebView.ts`),
  contact and SMS invites, invite links, link previews and the licenses page's link.
- **appShell** — `ownsWindow` and `reportsKeyboardHeight` (the keyboard in the attach panel), and the
  phone app's `haptics`, `preferences` (its own store: the theme and language sync, the preference
  loader), `backGesture`, `iconBadge` (the badge read for logs; the iOS/Android split lives in the
  implementation), `appIcon` and `storeUpdate` (the update check and the store listing). `dockBadge`
  and `selfUpdate` are the desktop app's
  ([desktop-web `docs/host/`](../../../desktop-web/docs/host/README.md)), `null` here; in a browser
  every capability is `null`.
- **diagnostics** — `entry` (telemetry's entry point: `icon` or `browser`), and the phone app's
  `debugMode` (the debug switch), `bootMetrics` and `pendingReports` (the pending-report flusher),
  `null` in a browser. The log pipeline — the console listener, the log context and uploader, and who
  held the session — is wired before the ports are published, so it still reads the choice, through
  `config/diagnosticsKind.ts`.

`@nx/workspace-host-port-kind` (`tools/eslint-rules/host-port-kind.js`) reports a read of these ports'
`kind` anywhere but `apps/*/src/config/**` and tests. A test starts from `browserLinks()`,
`browserAppShell()` or `browserDiagnostics()` (`@chatic/runtime/testing`) and lays the members it
watches on top.

## signIn, push

Each still carries the choice alone, `{ kind: 'shell' | 'browser' }` (`signIn` adds `os`), published the
same way, and the files that use it branch on `kind`:

- **signIn** — the login page and account linking (`os === 'ios'` offers Apple's own sign-in), social
  links, and the pairing screens: the app holds the account and approves; the page asks. Also the
  subscription entries that depend on who holds the account — My page's subscription row for a guest
  and the cloud-manage page — since a subscription follows the account the app signs in with.
- **push** — device-token registration, push mute, push taps (`usePushNavigate`) and the invited-cloud
  runner.

Identity and config values the shell injects — device ids, version, stage, the config bag — are not
ports: they are read from `@chatic/bridges` (`hostProfile().globals`, or `liveShellGlobals()` /
`liveShellValue()` where the shell rewrites them after load).

## media

Who picks what a person attaches. `media.host` publishes `{ kind: resolveMediaMethod() }`; the
picker (`bridge/attachmentPicker.ts`) and the photo library (`bridge/photoLibrary.ts`) are unsupported
unless it is `'shell'`, and the attach panel then opens the page's own input. The same answer decides the
three other places that used to ask `isNative()`: whether the camera input waits for the app's camera
permission (`ChatImageAttach`), whether the recent-photos strip shows outside the grid, whether a send
hands a video to the app to convert (`useSendImages`), and whether the permission banner can open the
app's settings (`PermissionDeniedBanner`).

## files

Who moves a message's files. `files.host` publishes `{ kind: resolveFilesMethod() }`; where it is
`'shell'`:

- `shellUpload` hands uploads to the app's transfer module and catches up with the ones it finished.
- `shellDownload` catches up with the app's downloads. Saving or sharing a photo or video uses the same
  downloads but is decided by the handshake (`shellCapabilities`), not by this port, so the catch-up
  also runs wherever the handshake allows image export.
- `useFileDownloads` lets the app download, keep, open and share a document.
- The video-frame maker (`useVideoFrames`) asks the app for a video's first frame.

Where it is `'browser'`, the page PUTs, fetches and saves the file itself and draws frames from the bucket.

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
