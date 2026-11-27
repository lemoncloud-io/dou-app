# shell

The main window and how it reaches the web.

## Loading

The main window opens the web address directly (`WebviewUrl::External`); there is no local page in between on the happy path. The initialization script that injects the bridge is guarded by the web origin, so it does nothing on local pages.

Two things detect a web that cannot be reached, because the webview gives no load-error hook:

- **Probe.** When the window is created, a task opens a TCP connection to the web's host and port (3 s limit) in parallel with the load. If it fails and the page has not finished loading, the window moves to the offline page. A direct connection can be blocked where the webview's proxy still works; the offline page then reloads the web by itself, so the cost is a short flash.
- **Watchdog.** A navigation that starts on the web origin arms a 15 s timer; the page-load `Finished` event disarms it. A page that never finishes moves the window to the offline page. A new navigation re-arms it and supersedes the older timer.

The offline page (`ui/offline.html`, `offline.js`) takes the web address in its `to` query. It shows "No connection", waits 1.5 s, then requests the address (no-cors, 8 s limit) and replaces itself with it once the request succeeds. While that fails it retries on a growing delay (1, 2, 4, 8, then every 15 seconds), at once on the browser's `online` event, and on the button. Only an `https` address (or `http://localhost`) is followed.

The address is baked at build time: `DOU_WEB_URL` if set, else the dev web in a debug build and the production web in a release build. Nothing here depends on which web it is. The same address is the only origin the bridge capability allows.

A debug build prints `main page loaded N ms after launch` when the main page finishes loading.

### Measured (2026-11-27)

Debug build on macOS against `scripts/smoke/page.html` on `http://localhost:4173`, 5 cold starts each, time from process start to the request that serves the page:

|                                     | median | runs (ms)                  |
| ----------------------------------- | ------ | -------------------------- |
| before (local loader, then the web) | 954    | 2321, 902, 832, 954, 1036  |
| after (the web directly)            | 1006   | 2107, 1087, 911, 915, 1006 |

The runs overlap: on loopback the removed hop is cheap, and a first start after a rebuild is slower. What the change removes is the loader's own request to the web before the real load; the gap between the two requests in the old runs was 65 ms median (65, 95, 57, 26, 66 ms), and it grows by a round trip plus a TLS handshake on a real network. No faster start is claimed on loopback. The offline path was run by starting the app with nothing listening: the offline page showed, and once the server came up the page loaded by itself and the bridge handshake passed.

## Tray and shortcut

A tray icon (all platforms) has Open DoU, Open DoU Agent… and Quit; a left click opens the main window. The shortcut `CmdOrCtrl+Alt+D` shows the main window, or hides it when it is visible and focused. If another app already owns the shortcut, the app logs that and runs without it. The tray does not change what closing a window does.

Known limit: clicking an OS notification does not open the room. `tauri-plugin-notification` has no click callback on desktop, and a focus-after-notification guess would navigate on unrelated focus changes. A native callback (macOS `UNUserNotificationCenter`, Windows toast activation) is the follow-up.

## Updater and build values

| Build env                                 | Effect                                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOU_UPDATE_FEED` and `DOU_UPDATE_PUBKEY` | both set: the updater checks the feed every 30 minutes and verifies downloads with the key. Either missing: the updater is off, no check runs, and `StartUpdateDownload` answers `success: false`. |
| `DOU_BUILD_NUMBER`                        | digits; becomes `CHATIC_APP_BUILD_NUMBER`. Anything else, or unset, gives `1`.                                                                                                                     |

`CHATIC_APP_SHOULD_UPDATE` stays `false`: it is the web's forced-update flag, and Electron also leaves it `false`. An available update reaches the web as `OnUpdateStatus`. The repository holds no signing key; generate one with `cargo tauri signer generate` and pass its public half as `DOU_UPDATE_PUBKEY`, its private half as `TAURI_SIGNING_PRIVATE_KEY` in the release build.

## Tests that catch drift

- `handlers/mod.rs`: `HANDLED` equals the set of names the handlers register (plus `WebAppReady` and `Ping`).
- `command_drift_tests.rs`: every command in `generate_handler!` is in `build.rs`, every `agent_*` command is granted to the agent window in `capabilities/agent.json`, and the agent window is not granted `bridge_request`.
- `bridge.rs`: `caller_is_web` refuses every origin but the web's (userinfo and suffix tricks, plain http, `tauri://`, localhost).
