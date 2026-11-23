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

## Device token registration

`useDeviceTokenRegistration` is only the shell's side of push registration. The policy (sign-in gating,
once per install, retry) lives in `@chatic/runtime`'s push registration and is shared with the phone app;
this hook hands it the pieces that depend on the host.

- The token and its renewals come from the `push` port. The desktop app answers the token request itself
  and announces each token it mints again, because it stays open for days and waiting for the next launch
  to notice a rotation would leave the endpoint stale that long.
- Where the app holds no token (a browser tab) the delegate is `null` and registration does nothing.
- The token request resolves empty when push is not configured or is still registering. The runtime
  treats an empty token as a failure and retries on the next trigger.
- The device's platform, install id and stage are what the shell injected at boot, read from the host
  profile. The stage is sent explicitly: without it the broker applies its own default (`dev`) and
  registers a production desktop into the development push application.

## What the page reads off `window.electronAPI`

`src/app/shared/utils/electronApi.ts` is the one declaration of what the shell's preload exposes.
`declare global` merges across the program, so two files asserting their own shape of
`window.electronAPI` is a compile error, and `vite build` does not typecheck, so it would surface late.
Features import the types and the `get…Api` readers from there. Every member is optional; outside the
desktop app, or in an older shell, it is `undefined`.

- The contracts shared with the main process (custom-UI, launch-at-login, downloads) are kept in step
  by hand with their `apps/desktop/src/main/*Contract.ts` files. An app-to-app import is blocked by the
  workspace rules and a shared library for a few fields was not worth it. A change to one needs the
  other, and nothing checks that the preload object satisfies the page's declaration, which is inherent to
  `contextBridge`.
- **Launch at login** reports `enabled` as the OS read back after a write, never the requested value,
  because the OS can leave the registration pending approval, and echoing the request would show a
  switch that is on for an app that will not start. `supported` is false where Electron has no
  login-item integration (it is true on macOS and Windows only), and the settings row hides.
- **Download notices** report how a download the page started ended. A save whose dialog was dismissed
  is not reported, so it says nothing, and `reveal` answers false when the shell no longer has the file.
  Saves that end close together share one notice that counts them
  (`useDownloadNotices`); the join window is shorter than the toast's life by half a second, because a
  toast closes that long after it opened whatever it was updated to, and a closed one cannot be updated.

## Details that bite

- **One object to `post`.** The shell bridge's `webClient.post` takes a single `{ type, data }` object.
  The two-argument form fails typecheck and, worse, silently does nothing at runtime: the message
  has no `type`, so no handler matches (the update actions `StartUpdateDownload` and
  `RestartToUpdate` are posts).
- **System browser, not the window.** The shell sends an untrusted `https` page the app window opens
  to the OS browser, and blocks navigating the app's own window away (`will-navigate`), so the relay
  sign-in goes out through `window.open`. A code that returns inside the app window is exchanged
  there; in a tab, the return page hands it to the app through the deeplink and closing the tab
  ends the sign-in.
- **The sub view handshake is asked for here only.** desktop-web sends no handshake at startup, so
  `links.subWebView.openScope` sends the one `WebAppReady` on demand, and the desktop app answers it
  with no side effect. A failed handshake is logged and read as "not offered", which is the same
  answer as a shell that said no but leaves a trace, so it is not mistaken for one.
- **Link previews cross to the main process** because the page cannot read another origin; it
  fetches the page and parses its tags.
- **A banner that fails never breaks the page.** An older app answers `NATIVE_NOT_SUPPORTED` to
  `ShowNotification` and the bridge can fail in passing, so the request's rejection is swallowed: a
  dropped OS banner is the cost, never a broken renderer.
- **An empty bridge event is dropped.** The notification feed is typed as always carrying a payload,
  but an event is whatever the other side sent; a message without one is not passed on, rather
  than thrown on inside the bridge's dispatch.
- **The token is renewed unprompted** (`OnFetchFcmToken`) because the app stays open for days, and
  waiting for the next launch would leave the registered endpoint stale for that long.
