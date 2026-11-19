# What desktop-web asks of its host

The page runs in two hosts: the desktop app's window (the Electron shell, `apps/desktop`) and, for
pairing and sign-in hand-offs, a plain browser tab. Features never ask which one they are in. They call
the host ports `runtime.<port>` from `@chatic/runtime`, and the app's runtime declaration
(`src/config/desktop-web.ts`) builds each port once at start from what the host declared.

`links`, `appShell` and `diagnostics` carry their work as members; this app implements both sides of
each in `src/config/adapters/{links,appShell,diagnostics}.ts`. A capability the host does not have is a
member that is `null`, so a feature writes `runtime.appShell.selfUpdate?.restart()` and never reads the
port's `kind` — the root lint rule `@nx/workspace-host-port-kind` refuses that outside `src/config/`.
`checkout` is fixed to `checkout.none` (the desktop app sells nothing), and `media` and `files` to the
browser's own inputs and requests. How the ports themselves are built is in
[`libs/runtime-web`](../../../../libs/runtime-web/README.md); the phone's side of the same ports is in
[apps/web `docs/bridge/host-ports.md`](../../../web/docs/bridge/host-ports.md).

## What the desktop app does, and the tab does not

| Member                                          | Desktop app                                                                                      | Browser tab |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- |
| `appShell.ownsWindow`                           | `true` — the window is the page's, so it may reload itself or force its socket closed to recover | `false`     |
| `appShell.dockBadge`                            | paints the unread count on the dock or taskbar icon (`SetBadgeCount`, with an overlay image)     | `null`      |
| `appShell.selfUpdate`                           | update status events, then download and restart (`OnUpdateStatus`, `StartUpdateDownload`, …)     | `null`      |
| `links.linkPreview`                             | the main process fetches and parses the page (`FetchUrlMetadata`)                                | `null`      |
| `links.subWebView`                              | asks `WebAppReady` for the scope on each read, opens with `OpenSubWebView`                       | `null`      |
| `links.openUrl`, `links.copyText`               | the page's own `window.open` and Clipboard API — the desktop app answers neither message         | the same    |
| `diagnostics.entry`                             | `'icon'`                                                                                         | `'browser'` |
| everything else on `appShell` and `diagnostics` | `null` or `false`: no haptics, soft keyboard, back gesture, preference store or report queue     | the same    |

`ownsWindow` is why the socket wake recovery and the wedged-socket reload
(`src/app/shared/hooks/useSocketWakeRecovery.ts`, `useSocketWedgeReload.ts`) run in the desktop app and
never in a person's tab: reloading a tab the person opened would take their place in it from them.
