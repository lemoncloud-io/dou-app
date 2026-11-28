# @chatic/host-web-desktop-shell

**The web side of the host ports inside the desktop app.** The page asks the Electron shell over the
bridge, and the shell's main process does the work (dock badge, self-update, link previews, sub web views,
push and OS banners). This is the desktop-shell member of the `host/web` family
([ADR-0375](../../../../docs/adr/0375-platform-implementations-live-in-libs-as-families-of-one-port.md)); the
contract is `HostPorts` from [`@chatic/ports`](../../../contracts/ports/README.md).

Tags: `layer:adapter` · `platform:web` · `formfactor:any`.

**Every implementation that talks to the shell takes its bridge client** (`DesktopShellBridge`: `post`,
`request` and `onEvent` of `@chatic/bridges`' web client) instead of reaching for an app's bridge wrapper.
Each returns a half of runtime-hybrid-web's `ShellOrBrowserImplementations`, handed the runtime's choice
(`base`):

| Export                                 | Port          | What it does                                                                                                                                        |
| -------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktopShellAppShell(bridge)`         | `appShell`    | owns its window; dock badge (`SetBadgeCount`), self-update (`OnUpdateStatus`, `StartUpdateDownload`, `RestartToUpdate`); the phone's members `null` |
| `desktopShellDiagnostics`              | `diagnostics` | `entry: 'icon'`; debug switch, boot metrics and pending reports `null`                                                                              |
| `desktopShellLinks(bridge)`            | `links`       | `pageLinks`, link preview (`FetchUrlMetadata`), sub web view (`WebAppReady` on demand, `OpenSubWebView`, `OnSubWebViewClosed`)                      |
| `desktopMedia`                         | `media`       | both sides: picker, photo library, video converter and camera permission `null`, and no `images`                                                    |
| `desktopShellPush(bridge)`             | `push`        | notification feed, device token (`FetchFcmToken`), renewal (`OnFetchFcmToken`), OS banner (`ShowNotification`)                                      |
| `desktopShellSignIn(bridge)`           | `signIn`      | `sessionScope: 'device'`, approves pairing; relay OAuth in the system browser, hand-off deeplinks read off the notification feed                    |
| `desktopBrowserSignIn`                 | `signIn`      | desktop-web in a plain tab: `sessionScope: 'tab'`, requests pairing; relay OAuth navigates the tab and hands the code back                          |
| `desktopShellNotificationFeed(bridge)` | —             | the one reader of `OnReceiveNotification`, shared by `push.notifications` and `signIn.relayOAuth.handoffLinks`                                      |

The other browser halves are `@chatic/host-web-browser`'s (`browserAppShell`, `browserDiagnostics`,
`browserFiles(put)`, `browserLinks`, `browserPush`). `files` has no desktop member: inside the app and in a
tab the page sends with its own PUT, so desktop-web declares `browserFiles(pageUploadPut)` on both sides.

```ts
import { webClient } from '@chatic/bridges';
import { browserPush } from '@chatic/host-web-browser';
import { desktopShellPush } from '@chatic/host-web-desktop-shell';
import { pushAdapters } from '@chatic/runtime-hybrid-web';

export const {
    host: pushHost,
    shell: pushShell,
    browser: pushBrowser,
} = pushAdapters({
    shell: desktopShellPush(webClient),
    browser: browserPush,
});
```

## What the page reads off `window.electronAPI`

`src/preload.ts` is the one declaration of what the shell's preload exposes (`declare global` merges across
the program, so a second declaration of `window.electronAPI` is a compile error). Pages read it through
`getShellApp()` (the app's version and platform), `getCustomUiApi()`, `getLoginItemApi()` and
`getDownloadsApi()`. Every member is optional; outside the desktop app, or in an older shell, it is
`undefined`. The screens that use them (launch at login, download notices, the custom-UI debug page) stay
in desktop-web.

## Rules

- **Bridge messages do not change here.** Each member sends the message and data desktop-web's adapters
  sent before the move; the specs assert the message itself. An installed shell is older than the page it
  loads, so a renamed message or field breaks it.
- **One message, one reader.** Everything the app hands the page about notifications arrives on
  `OnReceiveNotification`; `desktopShellNotificationFeed` reads it for both push and sign-in, and drops an
  event without a payload.
- **A banner that fails never breaks the page.** An older app answers `NATIVE_NOT_SUPPORTED` to
  `ShowNotification`; the rejection is swallowed.
- **The preload contracts are kept in step by hand** with the desktop app's main-process contract files;
  nothing checks that the preload object satisfies this declaration, which is inherent to `contextBridge`.
