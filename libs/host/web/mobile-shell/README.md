# @chatic/host-web-mobile-shell

**The web side of the host ports inside the phone app.** The page asks the React Native shell over the
bridge, and the shell does the work (`push/mobile`, `sign-in/mobile`, `checkout/store` and the shell's own
handlers). This is the mobile-shell member of the `host/web` family
([ADR-0375](../../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)); the
contract is `HostPorts` from [`@chatic/ports`](../../../contracts/ports/README.md).

Tags: `layer:adapter` · `platform:web` · `formfactor:any`.

**Every implementation takes its bridge client** (`ShellBridge`: `post`, `request` and `onEvent` of
`@chatic/bridges`' web client) instead of reaching for an app's bridge wrapper. Each returns the `shell`
half of runtime-hybrid-web's `ShellOrBrowserImplementations`, handed the runtime's choice (`base`):

| Export                                              | Port          | What it asks the shell                                                                                                                  |
| --------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mobileShellAppShell(bridge)`                       | `appShell`    | haptics, preferences, back gesture, icon badge (iOS reads the live badge, Android the shared base), app icon, store update, OS settings |
| `mobileShellDiagnostics(bridge)`                    | `diagnostics` | debug switch, boot metrics, pending reports                                                                                             |
| `mobileShellFiles({ bridge, sender, syncUploads })` | `files`       | open and save a file, read a video frame; `put` and `putShellFile` go to the app's transfer module (`sender`)                           |
| `mobileShellLinks({ bridge, subWebViewOpenScope })` | `links`       | open, copy, share sheet and intake, contacts, SMS, link preview, sub web view                                                           |
| `mobileShellMedia(bridge)`                          | `media`       | picker, photo library, video conversion, camera permission; `images` is the page's own `browserImages`                                  |
| `mobileShellPush(bridge)`                           | `push`        | notification feed and device token                                                                                                      |
| `mobileShellSignIn(bridge)`                         | `signIn`      | the native provider sign-in (Apple only on iOS)                                                                                         |
| `mobileShellStoreCheckout(bridge)(store)`           | `checkout`    | the store's catalog, purchase, finish, held purchases and management                                                                    |

Two values stay with the app because they are the app's state, not the shell's: the transfer module that
moves uploads (`sender`, made once per page on the first upload) and the open scope the handshake reported
for sub web views (`subWebViewOpenScope`).

```ts
import { webClient } from '@chatic/bridges';
import { browserMedia } from '@chatic/host-web-browser';
import { mobileShellMedia } from '@chatic/host-web-mobile-shell';
import { mediaAdapters } from '@chatic/runtime-hybrid-web';

export const {
    host: mediaHost,
    shell: mediaShell,
    browser: mediaBrowser,
} = mediaAdapters({
    shell: mobileShellMedia(webClient),
    browser: browserMedia,
});
```

## Rules

- **Bridge messages do not change here.** Each member sends the message, data and timeout the app's
  `appBridge` sent before the move; the specs assert the message itself. An installed shell is older than
  the page it loads, so a renamed message or field breaks it.
- **Long waits are named.** A request the person answers on the shell's screen carries its own budget —
  `PICK_TIMEOUT_MS` (30 min), `SHELL_USE_TIMEOUT_MS` and `SHARE_INTAKE_FETCH_TIMEOUT_MS` (10 min),
  `PROVIDER_SIGN_IN_TIMEOUT_MS` (3 min), … — exported with the implementation. The rest take the bridge
  client's default.
- **A purchase settles from the shell's events.** `Purchase` is posted; `OnPurchaseSuccess` or
  `OnPurchaseError` arrives later, heard for as long as the port lives, and a purchase nobody answered gives
  up as `timeout` after `PURCHASE_TIMEOUT_MS` (60 s). A second purchase supersedes the first.
- **Desktop is not here.** The page inside the desktop app is `host/web/desktop-shell`, a later step; until
  then desktop-web keeps its implementations in its `src/config/adapters/`.
