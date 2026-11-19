# host ports — how this app reaches what the host can do

> Scope: the `host` slot of `apps/web/src/config/`'s two declarations, and `config/adapters/checkout/`.
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

## links, appShell, signIn, diagnostics, push

Each is `{ kind: 'shell' | 'browser' }` (`appShell` and `signIn` add `os`), published from the declaration's
version-4 keys or, before them, the legacy rule. Where each domain's files read it:

- **links** — `openExternalUrl`, the clipboard copies, share intake (`bridge/shareIntake.ts`), sub web
  views (`bridge/subWebView.ts`), contact and SMS invites, invite links, link previews, the licenses
  page's link.
- **appShell** — haptics, the language and theme sync with the shell, the back handler, the keyboard in
  the attach panel, the update status, the app icon and the settings that offer it, the preference
  loader, and the badge read for logs (`os` tells iOS from Android).
- **signIn** — the login page and account linking (`os === 'ios'` offers Apple's own sign-in), social
  links, and the pairing screens: the app holds the account and approves; the page asks. Also the
  subscription entries that depend on who holds the account — My page's subscription row for a guest
  and the cloud-manage page — since a subscription follows the account the app signs in with.
- **diagnostics** — the console listener, the log context and uploader, the pending-report flusher,
  telemetry's entry point, boot metrics, the debug switch's mode, and who held the session.
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
