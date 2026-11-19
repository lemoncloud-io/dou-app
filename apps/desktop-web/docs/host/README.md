# What desktop-web asks of its host

The page runs in two hosts: the desktop app's window (the Electron shell, `apps/desktop`) and, for
pairing and sign-in hand-offs, a plain browser tab. Features never ask which one they are in. They call
the host ports `runtime.<port>` from `@chatic/runtime`, and the app's runtime declaration
(`src/config/desktop-web.ts`) builds each port once at start from what the host declared.

Every port carries its work as members; this app implements both sides of each in
`src/config/adapters/<port>.ts` (`media`, `files`, `links`, `appShell`, `signIn`, `diagnostics`,
`push`). A capability the host does not have is a member that is `null`, so a feature writes
`runtime.appShell.selfUpdate?.restart()` and never reads the port's `kind` or `os` — the root lint rule
`@nx/workspace-host-port-kind` refuses that outside `src/config/`. `checkout` is fixed to
`checkout.none` (the desktop app sells nothing), and `media` and `files` to their browser side: the
desktop app has no picker, photo library or transfer module of its own, so both sides of each are the
page's own inputs and requests. How the ports themselves are built is in
[`libs/runtime-web`](../../../../libs/runtime-web/README.md); the phone's side of the same ports is in
[apps/web `docs/bridge/host-ports.md`](../../../web/docs/bridge/host-ports.md).

## What the desktop app does, and the tab does not

| Member                                                           | Desktop app                                                                                                                                                                                                                                            | Browser tab                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `appShell.ownsWindow`                                            | `true` — the window is the page's, so it may reload itself or force its socket closed to recover                                                                                                                                                       | `false`                                                                                               |
| `appShell.dockBadge`                                             | paints the unread count on the dock or taskbar icon (`SetBadgeCount`, with an overlay image)                                                                                                                                                           | `null`                                                                                                |
| `appShell.selfUpdate`                                            | update status events, then download and restart (`OnUpdateStatus`, `StartUpdateDownload`, …)                                                                                                                                                           | `null`                                                                                                |
| `links.linkPreview`                                              | the main process fetches and parses the page (`FetchUrlMetadata`)                                                                                                                                                                                      | `null`                                                                                                |
| `links.subWebView`                                               | asks `WebAppReady` for the scope on each read, opens with `OpenSubWebView`, hears every close (`OnSubWebViewClosed`) through `onClosed`                                                                                                                | `null`                                                                                                |
| `links.openUrl`, `links.copyText`                                | the page's own `window.open` and Clipboard API — the desktop app answers neither message                                                                                                                                                               | the same                                                                                              |
| `diagnostics.entry`                                              | `'icon'`                                                                                                                                                                                                                                               | `'browser'`                                                                                           |
| `signIn.sessionScope`                                            | `'device'`                                                                                                                                                                                                                                             | `'tab'` — closing the tab ends the sign-in                                                            |
| `signIn.approvesPairing`, `.requestsPairing`                     | approves, never requests: a code shown in the app would ask a phone to approve the app beside it                                                                                                                                                       | requests, never approves                                                                              |
| `signIn.relayOAuth`                                              | opens the relay in the system browser, exchanges a code that lands in the app window, and hears the deeplinks the app is opened with (`handoffLinks`, read off the same notification feed as `push.notifications`)                                     | navigates the tab to the relay; a code that lands here is handed back to the app through the deeplink |
| `push.notifications`                                             | everything the app hands the page on `OnReceiveNotification`: banner clicks, the menu bar's `chatic-ui:` links, and every push it receives, which the cross-cloud banner, the cloud rail's badge, the place unread counts and the refresh-on-push hear | `null`                                                                                                |
| `push.deviceToken`                                               | the main process answers `FetchFcmToken`                                                                                                                                                                                                               | `null`                                                                                                |
| `push.tokenRenewal`                                              | announces each token it mints again (`OnFetchFcmToken`): the app stays open for days                                                                                                                                                                   | `null`                                                                                                |
| `push.localBanner`                                               | raises an OS banner when the page asks (`ShowNotification`) — the same-cloud message banners, and a cross-cloud push while the window is unfocused; a banner it cannot show is dropped                                                                 | `null`                                                                                                |
| everything else on `appShell` and `diagnostics`                  | `null` or `false`: no haptics, soft keyboard, back gesture, preference store, OS settings page or report queue                                                                                                                                         | the same                                                                                              |
| `signIn.providerSignIn`, every `media` member, `files.transfers` | `null`: no provider sign-in of its own, picker, photo library, video conversion, camera prompt or transfer module; `files.put` is the page's PUT, which the chat uploads (the composer and Forward) send through                                       | the same                                                                                              |

**One message, one reader.** The desktop app sends everything it hands the page about notifications
on one message, `OnReceiveNotification`: a banner click, a menu bar link, a forwarded push and every
deeplink the app is opened with, an OAuth hand-off's included. `push.notifications` and
`signIn.relayOAuth.handoffLinks` both read it through one subscription helper
(`src/config/adapters/notificationFeed.ts`), so a change to how the message is read reaches both at
once, and each listener tells its own payloads apart. No feature subscribes to the message or sends
`ShowNotification` itself.

`ownsWindow` is why the socket wake recovery and the wedged-socket reload
(`src/app/shared/hooks/useSocketWakeRecovery.ts`, `useSocketWedgeReload.ts`) run in the desktop app and
never in a person's tab: reloading a tab the person opened would take their place in it from them.
