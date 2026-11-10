# Desktop shell (`apps/desktop`)

The Electron shell around `desktop-web`. The main process owns the window, the tray, OS
notifications, FCM push, auto-update and the device vault; the page is the remote `desktop-web`
build (or a custom UI bundle on the dev channel).

Main-process modules that hold logic stay electron-free — electron and `fs` are injected — so they
run under jest (`npx jest` in this folder). `src/main/index.ts` is the one file that wires them to
electron and is not loaded by any test.

## Bridge

Web → app requests arrive on one IPC channel and are answered by an `AppBridgeHost`. The channel sits
behind `fromTrustedFrame` (`src/main/ipcSenderGate.ts`): only a frame whose origin is the configured
`desktop-web` origin (or the active custom UI bundle) is answered. Anything else is dropped unanswered.

Handled requests, all registered in `src/main/bridgeHandlers.ts` except the two update ones
(`src/main/updater.ts`) and `WebAppReady` / `Ping` (inside `AppBridgeHost`):

| Request                                       | What the shell does                                            |
| --------------------------------------------- | -------------------------------------------------------------- |
| `ShowNotification`                            | OS notification for the current cloud; a click routes deeplink |
| `FetchUrlMetadata`                            | Link preview fetch on the renderer's behalf (CORS)             |
| `FetchFcmToken`                               | The FCM token, once registration lands (`''` if it never does) |
| `SetBadgeCount`                               | Unread badge, painted per platform                             |
| `SavePreference`                              | Accepted and not stored (the renderer keeps the theme)         |
| `StorageGet` / `StorageSave` / `StorageClear` | The device vault — see below                                   |
| `OpenSubWebView` / `CloseSubWebView`          | A page on another origin, as a modal — see Sub view below      |
| `StartUpdateDownload` / `RestartToUpdate`     | Auto-update, packaged builds only                              |

Every other request in `@chatic/bridge-messages` is deliberately unanswered (`NOT_FOUND`), each with
its reason in `src/main/bridgeHandlers.contract.test.ts`. A new message fails that suite until it is
handled or listed there.

The handshake (`WebAppReady`) also says `subWebViewOpenScope: 'anyHttps'` — set by
`DESKTOP_MAIN_HOST_OPTIONS` in `bridgeHandlers.ts`, which `index.ts` and the contract suite both use.

## Sub view

`src/main/subWebView/`. The web opens a page on another origin with `OpenSubWebView`; the shell shows
it as a modal over the main window and tells the web `OnSubWebViewClosed` (with the page's `result`)
when it goes. One at a time; a second open is `ALREADY_OPEN`. It is the desktop counterpart of the
phone shell's sub WebView, and pages talk to it the same way: what a page and the shell say to each
other is the protocol in `apps/mobile/docs/webview/sub-webview-protocol.md`, whose desktop section
lists what differs.

**What opens** is the shared rule `libs/shared/src/utils/subWebViewTrust.ts` — the one file of
`@chatic/shared` the main bundle aliases (`electron.vite.config.ts`), since the barrel carries React.
Any plain https URL opens, in one of three tiers: `firstParty` (the hub, `https://apps.chatic.io` and
`https://apps-dev.chatic.io` exactly), `reviewed` (one label under those domains — the phone shell's
allowlist) and `external` (anything else: a link a cloud's owner registered). Userinfo, a port, a
backslash, whitespace, control characters and IP literals are refused as `NOT_ALLOWED`. The phone
opens `reviewed` alone, which is why this shell says `anyHttps` in its handshake and the web offers a
registered link only where it does.

**Trust by tier.** An external site gets no manifest fetch — not even a request to its
`/.well-known` — and is always shown with the bar, titled with its host whatever the page or the web
asks: a third-party page under DoU's chrome must not be able to name itself DoU. A trusted page's
manifest gives the bar its fallback name and the display (`standard` by default; `fullscreen` fills
the window, bar kept). No tier gets more than the base set below.

**The view.** Two `WebContentsView`s added to the main window: the shell's chrome (a dimmed backdrop,
the card, the bar with its close control — a local page, `subWebViewChrome.ts`) and the page over it.
The page view is sandboxed with context isolation and no Node, in a session of its own per origin
(`persist:sub-webview:<origin>`) that refuses every permission request, answers every device chooser
(Bluetooth, HID, USB, serial) with no device, and cancels downloads. Electron picks the first device
itself when a chooser has no listener, so the choosers are answered rather than left alone.

- Only the opened origin loads. Another https URL — a link, a redirect, `window.open` — goes to the OS
  browser and the view stays; other schemes and DoU's own invite links are dropped
  (`decideDesktopSubWebViewNavigation`). No second window is ever created. A view hands at most three
  URLs to the OS browser in any ten seconds and drops the rest with a warning: Electron has no popup
  blocker, so a page could otherwise open browser tabs in a loop without a click.
- Esc and the bar's close control close it as `user`. The main window starting a new page removes it
  without an event (`resetForNewHost`), because the page that opened it is gone. A load failure keeps
  the card and its close control, with a message in place of the page.

**The page's bridge** is a host of its own per page load (`desktopSubBridgeHost.ts`), never the main
window's, on an IPC pair of its own (`chatic-sub-webview:*`). It answers `WebAppReady`, `Ping`,
`FinishSubWebView`, `SetSubWebViewTitle` and `ReportSubWebViewError`; everything else is `NOT_FOUND`,
whatever a manifest declares. Main hears a message only from the page view's main frame while it
shows the opened origin. Its preload (`src/preload/subWebView.ts`) defines, on the opened origin
only, the frozen `window.ChaticSubWebView` (`platform: 'desktop'`) and
`window.ReactNativeWebView.postMessage` — the phone's channel, so a page built with
`chatic-apps-sdk` runs unchanged. It asks main for that context synchronously over IPC
(`chatic-sub-webview:boot`), answered for the page view's main frame on the opened origin only —
never on the command line, where the names in it would be readable by any process on the machine.
That preload imports nothing the main preload does: the two are
built together, and a shared module becomes a chunk a sandboxed preload cannot load.

The decisions live in electron-free modules (`DesktopSubWebViewService.ts`,
`desktopSubWebViewPolicy.ts`, `desktopSubBridgeHost.ts`); `desktopSubWebViewWindow.ts` wires them to
electron and runs under jest against a fake electron (`desktopSubWebView.test.ts`).

## Injected globals

The preload (`src/preload/index.ts`) sets these on `window` before the page runs:

- `CHATIC_APP_PLATFORM` (`'desktop'`), `CHATIC_APP_APPLICATION`, `CHATIC_APP_STAGE`,
  `CHATIC_APP_DEVICE_ID`, `CHATIC_APP_INSTALLATION_ID`, `CHATIC_APP_DEVICE_MODEL`,
  `CHATIC_APP_CURRENT_VERSION`, `CHATIC_APP_LATEST_VERSION`, `CHATIC_APP_BUILD_NUMBER`,
  `CHATIC_APP_CURRENT_LANGUAGE`, `CHATIC_APP_SHOULD_UPDATE` — the same keys the phone shell injects.
- `CHATIC_APP_STORAGE_MEDIA` — `['nativeSecure']`: the storage media the shell keeps. The web picks
  its storage from this list alone, synchronously at boot.
- `ChaticMessageHandler.postMessage` — the bridge's web → app path. The sub view's page gets none
  of these; it has a preload of its own (Sub view above).
- `electronAPI` — app version, platform, the dev-channel custom UI controls and launch-at-login.
  Desktop-only, so kept off the shared bridge vocabulary.

## Device vault (`nativeSecure`)

`src/main/secureStorage/` (interfaces in `types.ts`). One JSON `Record<string, string>`, encrypted with Electron
`safeStorage` (Keychain on macOS, DPAPI on Windows, Secret Service or KWallet on Linux) into
`userData/secrets.bin`.

- **Start.** Read into memory when the app is ready, before the first window. A `StorageGet` that
  arrives before that read finishes waits for it.
- **Unavailable for the run** (`status: 'unavailable'`, `reason: 'error'`): encryption is not
  available, Linux fell back to the `basic_text` backend (a hard-coded key — encrypted in name only),
  or the file exists but cannot be read.
- **Reset.** A file that does not decrypt, or decrypts to anything but a string record, came from
  another OS account or keyring. Nothing in it is recoverable, so the file is deleted and the vault
  starts empty with `reset: true`; the web signs the person in again. The flag drops once a save or
  clear lands.
- **Save.** `set` / `remove` are applied to a copy, encrypted and written to a temp file that is then
  renamed over the vault. `ok: true` is answered only after the rename. A failed write answers
  `ok: false` and leaves the vault unavailable for the rest of the run. Saves and clears run one at a
  time, in arrival order.
- **Clear.** Deletes the file and empties memory; `ok` after the delete.
- **No reinstall detection.** macOS has no uninstall hook, so the vault survives an uninstall the same
  way the rest of `userData` does. The web cannot tell a reinstall from a restart here, and does not
  try.

A request for a medium other than `nativeSecure`, or a `StorageSave` whose `set` is not a string
record or whose `remove` is not a string list, is answered with error code `INVALID`.
