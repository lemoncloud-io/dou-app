# Desktop shell (`apps/desktop`)

The Electron shell around `desktop-web`. The main process owns the window, the tray, OS
notifications, FCM push, auto-update and the device vault; the page is the remote `desktop-web`
build (or a custom UI bundle on the dev channel).

Main-process modules that hold logic stay electron-free — electron and `fs` are injected — so they
run under jest (`npx jest` in this folder). The wiring files below connect them to electron and are not
loaded by any test.

## Start-up and wiring

`src/main/index.ts` holds the start-up order and nothing else: the dev channel's name and `userData`
first (every later path reads `userData`), then the web URL, the custom UI scheme, the sub view service
and the device vault, then the single-instance lock, and on `ready` the session handlers, the custom UI
boot, the vault read, the application menu, the window, the macOS notification registration and a
cold-start deep link. Each role sits in a file of its own, with its state, so a later move into a
package is a file move:

| File                                                     | Role                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `appChannel.ts`                                          | Dev channel, deep-link scheme, web URL                                        |
| `mainWindow.ts`                                          | The window: bridge host, handlers, sub view, updater, push, window events     |
| `windowBounds.ts`                                        | Saved window size and position                                                |
| `loadRecovery.ts`                                        | Load retries, crash and hang recovery, error page                             |
| `navigationGates.ts`                                     | Navigation locked to trusted origins                                          |
| `menus.ts`                                               | Tray, application menu, reload after a custom UI change                       |
| `deeplinks.ts`                                           | Protocol client, `second-instance`, `open-url`, cold-start link               |
| `bridgeIpc.ts`                                           | The bridge's IPC pair                                                         |
| `customUiIpc.ts` · `loginItemIpc.ts` · `downloadsIpc.ts` | The desktop-only IPC channels; `downloadsIpc.ts` also handles `will-download` |
| `sessionPermissions.ts`                                  | Permission requests                                                           |
| `osNotifications.ts`                                     | OS notifications, badge, the macOS first-launch registration                  |
| `deviceVault.ts`                                         | The device vault on electron `safeStorage`                                    |
| `deviceId.ts`                                            | The installation's device id                                                  |
| `shellState.ts`                                          | The quitting flag and the main window's bridge host                           |

Writes of small state files (window bounds, the notification marker) are best-effort: a failed write
reopens at the default size or posts the registration notification again.

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

`RestartToUpdate` quits and hands over to the platform installer; on Windows that is the one-click
installer with its own window, which starts the app again when it is done. The install runs after the
app has exited, so the updater writes what it did up to that point — the version and executable of
every run, each check, the installer it started and its arguments — to `updater.log` in the app's
logs directory (`app.getPath('logs')`). A version that starts again after an install was started is
an update that did not apply. The log starts over at a launch that finds it past 1 MiB, and a failed
write is ignored: the log can never fail an update.

The handshake (`WebAppReady`) also says `subWebViewOpenScope: 'anyHttps'` — set by
`DESKTOP_MAIN_HOST_OPTIONS` in `bridgeHandlers.ts`, which `mainWindow.ts` and the contract suite both use.

## Back and Forward

The Go menu's Back and Forward items (shown as ⌘[ / ⌘] and Ctrl+[ / Ctrl+], not registered, because
the page binds those keys itself) and the three-finger trackpad swipes Electron reports as `left` and
`right` send `chatic-ui:back` and `chatic-ui:forward` to the page, which decides where a step goes.
The menu items do nothing while the window is hidden: they would otherwise raise the window and move a
page the reader never saw. The mouse's side buttons are not handled here: Chromium delivers them to
the page, which answers them along with the keys, and handling them here too would step twice.

## Downloads

Every download the app's own page starts is reported back to it when it ends
(`chatic-download:done`, `downloadsContract.ts`): the saved file's name, completed or interrupted —
a cancelled save dialog is not reported. A completed one carries an id; the page shows the file in
Finder or Explorer by sending that id back (`chatic-download:reveal`), behind the same trusted-frame
gate as every renderer channel. The shell keeps the last 50 finished paths (`createDownloadLog` in
`downloads.ts`) and never takes a path from the page, so the page can reveal only what the shell
itself saved. An image whose name matches its type still saves into Downloads with no dialog.

## Sub view

`src/main/subWebView/`. The web opens a page on another origin with `OpenSubWebView`; the shell shows
it as a modal over the main window and tells the web `OnSubWebViewClosed` (with the page's `result`)
when it goes. One at a time; a second open is `ALREADY_OPEN`. It is the desktop counterpart of the
phone shell's sub WebView, and pages talk to it the same way: what a page and the shell say to each
other is the protocol in `apps/mobile/docs/webview/mini-app-protocol.md`, whose desktop section
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
manifest gives the bar its fallback name and the display, read as the phone reads it, earlier names
included (`titled` by default; `clean` fills the window, bar kept; `immersive` is shown as `clean`,
since a window has no system bars). No tier gets more than the base set below.

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
- `CHATIC_APP_CAPABILITIES` — `{ version: 1, checkout: [] }`: the desktop app sells no subscription.
  Without it the web's rule for an app that declares nothing would read the bridge as a phone's and
  pick Google's store; `desktop-web` publishes no checkout either way.
- `ChaticMessageHandler.postMessage` — the bridge's web → app path. The sub view's page gets none
  of these; it has a preload of its own (Sub view above).
- `electronAPI` — app version, platform, the dev-channel custom UI controls and launch-at-login.
  Desktop-only, so kept off the shared bridge vocabulary.

## Device vault (`nativeSecure`)

[`@chatic/storage-safe-storage`](../../libs/storage/safe-storage/README.md); `src/main/deviceVault.ts` hands it
electron's `safeStorage`, the `userData` folder and the platform. One JSON `Record<string, string>`, encrypted with Electron
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

## Why it works this way

Constraints behind choices that look arbitrary.

### Custom UI bundle (dev channel)

A downloaded ZIP replaces the remote web, so every step assumes the archive is hostile.

- **Dev channel only.** `apply` is refused off the dev channel in the renderer-facing channel, not only in the
  UI: a script injected into the production web could otherwise replace the app's UI for good. `status` and
  `disable` stay available everywhere (they only move back to the deployed web), and a production install that
  once took a bundle is still reset by them. Launch also ignores a recorded bundle or the
  `MAIN_VITE_CUSTOM_UI_ROOT` override off the dev channel, without deleting either.
- **A way out that the bundle cannot hide.** The bundle owns the whole renderer, so Reset lives in the tray and in
  the application menu (with a shortcut), both of which main owns, and appears whenever a bundle is being served.
  A bundle may switch itself off but not apply the next one, so bundles cannot chain.
- **Archive handling.** Only `https` URLs, with redirects refused (checking only the first hop would let a
  redirect reach an internal host). Symlink entries are rejected, because the extractor creates them without
  checking their target and the served files would then expose anything the user can read. `index.html` must be
  a real file at the archive root: a ZIP with DOS-only entry attributes makes the extractor create it as a
  directory, which an existence check accepts and then serves as a 404 with a body, which Chromium counts as a
  completed navigation, so no recovery fires. The archive is buffered whole before it is written, so a dropped
  connection never leaves a truncated zip.
- **Applying is non-destructive until the final rename.** Extraction goes beside the live root, the live root is
  moved aside rather than deleted, and a failed swap puts it back. Re-applying a URL targets the directory
  being served, so extracting in place would destroy a working bundle. Applies are serialized (the same archive
  is the default for the tray and the debug panel), and a failed apply leaves whatever was serving untouched.
- **What survives a restart** is the extraction root alone; the scheme registration and "active" flag are rebuilt
  at boot from it. A root without a servable `index.html`, or anything unusable, clears the record instead of
  retrying, so it costs one launch on the remote web, not a failure every start.
- **Serving.** The scheme `chatic-local` has a fixed host so storage written by one bundle survives the next one;
  it is registered `standard` (real origin and storage partition), `secure` (IndexedDB, crypto and service
  workers need it) and with fetch and CORS enabled (without CORS enabled every API call fails). A request that
  finds no file gets `index.html` only when it is a document navigation (judged by `Accept`, not by a missing
  file extension, since invite codes and tokens contain dots), so a missing asset stays a 404 instead of arriving
  as HTML. A path that leaves the root is a 404, never the fallback. The root check is `startsWith(root + sep)`:
  the decoded path can hold `..` after encoded slashes and backslashes that URL parsing does not resolve, so it
  is the real defence and not a backstop.
- **Failure falls back.** A bundle that fails to load, crashes or hangs is not a network blip: the shell drops
  back to the remote web and forgets the bundle, instead of retrying local files or reloading a hung bundle
  into itself. Crash and hang budgets are not refilled by a bundle that loads and dies a second later.

### Loading, recovery and navigation

- **One answer for the web URL.** `webUrl.ts` is the only source for the URL the shell loads and the origins it
  trusts (first load, retry, post-sleep recovery, the error page's retry link, the IPC gate and the navigation
  gates), so a change cannot be applied to some sites and not others. The custom bundle's origin is in the
  trusted set exactly while a bundle is served, and the remote origin stays trusted either way so the fallback
  load is not refused.
- **Retry and recovery are bounded.** Connection failures (offline, DNS, refused) retry on a backoff ladder before
  the branded error page, since a cold launch after boot or wake often precedes the network, or desktop-web's
  dev server. A crash that reproduces would otherwise reload forever with no error page (the aborted
  navigation is filtered), so crash reloads are capped and then show the error page with the reason. A renderer
  that stays unresponsive for 15 s is reloaded; shorter bursts recover on their own. Waking from sleep retries
  once if the window ended on the error page.
- **Navigation is locked to trusted origins.** The shell never opens another Electron window (it would keep the
  preload bridge); external links go to the system browser. `will-frame-navigate` is the real gate, since it also
  covers subframes (a downloaded bundle can iframe anything); `will-navigate` is a redundant main-frame guard and
  `will-redirect` covers server redirects, which neither of the others see.
- **Permissions.** The page is remote content, so everything the app does not use is denied rather than
  Electron's allow-all default. Notifications and sanitized clipboard writes are granted; fullscreen only to
  trusted origins (without it a video's fullscreen button silently does nothing).
- **Sandbox.** The renderer is sandboxed with context isolation and the preload uses no Node: values arrive as
  `additionalArguments` and base64 goes through `src/preload/base64.ts` (`btoa` throws on non-Latin-1 text and
  there is no `Buffer`). Everything injected into the page is base64 and decoded inside the snippet, because
  `JSON.stringify` does not escape `</script>`, U+2028 or U+2029. Run `yarn test:sandbox` after touching the
  preload: it boots the real built preload under `sandbox: true`, asserts values rather than presence, and runs
  a control without the arguments that must fail, so the gate cannot go vacuous.
- **Channel-scoped settings stay off the bridge.** Custom UI and launch-at-login have their own IPC channels (and
  `electronAPI` entries) because the bridge vocabulary is shared with the phone, and a desktop-only setting must
  not bump the bridge version. Launch-at-login is read back from the OS rather than echoed: macOS 13+ can answer
  `requires-approval` and leave it off.
- **Dev channel isolation.** An unpackaged or dev-channel shell gets its own app name, `userData`, single-instance
  lock and deep-link scheme (`chatic-dev`), otherwise it collides with the installed app (the second instance
  quits silently, and OAuth hand-offs relaunch the production app instead of the one under test).

### Push and notifications

- **Cross-cloud push** is [`@chatic/push-desktop`](../../libs/push/desktop/README.md): an in-process FCM
  registration that `mainWindow.ts` starts with the FCM config from `appChannel.ts`. A new token goes to the web
  to re-register, and a push goes to the renderer, which decides presentation as it does for same-cloud banners.
  `FetchFcmToken` answers with `awaitFcmToken()`.
- **No coalescing of OS notifications.** Closing the previous toast for a channel raced the new `show()` on macOS
  and dropped bursts, so each call shows its own banner; the renderer already emits one per cache snapshot.
- **macOS first launch** posts one silent notification (once per install) so the bundle appears in Notification
  Center and in System Settings; the main process has no permission-request API.
- **Badge.** macOS and Linux use the dock badge; Windows has none, so the renderer draws a PNG overlay (Electron
  cannot rasterize SVG).
- **Tray.** The macOS tray icon is a template image so the OS re-tints it; a dark glyph would vanish on a dark
  menu bar, and an invisible tray is an invisible escape hatch. The window hides instead of closing so the
  socket stays alive for background notifications.

### Updates, downloads, link previews

- **Update checks** run at launch, about every 30 minutes, on wake and on focus, gated to one per 10 minutes, so
  a release reaches an app left open all day. The feed is a small `no-cache` file. No check runs while an update
  is downloading or ready (a check re-emits "available" and would drop the banner back), and only a failure the
  user started is reported; a failed background check stays silent and retries. The installer runs with default
  arguments on Windows (one-click, with a window, restarts the app), because silent mode would hide a failed
  install. The updater log writes synchronously because its most important lines are written while quitting.
- **Image downloads skip the save dialog** only when the file name agrees with its type (an allowlist of image
  extensions): the dialog is where the user saw a file before it landed, and without it a script in the page
  could drop an executable into Downloads. Names in flight count as taken, since `will-download` asks for a path
  before any byte is written. The origin check reads the top-level page, which is fine while the app embeds no
  other origin.
- **Link previews (`FetchUrlMetadata`)** run in main (CORS) through
  [`@chatic/host-desktop`](../../libs/host/desktop/README.md), which guards the fetch against reaching the internal
  network; `src/main/unfurl.ts` only re-exports it.
- **Language** is the OS locale's bare language subtag (`ja`, `zh`), as the phone injects it, not a `PageLanguage`
  value (`jp`, `cn`); inventing the mapping here would make the two clients disagree. Menu labels follow the OS
  locale too, since the in-app language choice never reaches main.
- **Menu shortcuts shown but not registered** (Back, Forward, shortcuts sheet, zoom reset) are the keys the page
  binds itself; a registered accelerator would swallow the key before the page sees it.

### Packaging

- **Apple Silicon** kills an unsigned arm64 binary with no crash log, so `afterPack` ad-hoc signs the app unless a
  real Developer ID (`CSC_LINK`) is provided. `afterAllArtifactBuild` signs, notarizes and staples each dmg
  (electron-builder leaves the dmg unsigned, so Gatekeeper rejects the downloaded file); it does nothing without
  notarization credentials.
- **Korean name.** Spotlight matches an app only by its bundle names, so a search for `두유` found nothing while
  the bundle said only `DoU`. `afterPack` writes `Contents/Resources/ko.lproj/InfoPlist.strings` with the product
  name's `DoU` read as the brand in `build/locales/ko.json` (`두유`, `두유 Dev`), and `LSHasLocalizedDisplayName` is
  set, so a Mac whose primary language is Korean shows and finds the app as `두유`. Spotlight indexes the primary
  language's name only: with English first and Korean second the search still finds nothing, as it does for
  Apple's own apps. The hook generates the file instead of shipping a static one under `build/`, so the dev build
  gets `두유 Dev`. It runs before any signing, so the signature seals it. Windows is not covered.
