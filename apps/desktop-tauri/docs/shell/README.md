# shell

The main window, the profile it runs in, where its web comes from, its logs, and the `shell.sock` control socket.

## Loading

The main window opens the web address directly (`WebviewUrl::External`); there is no local page in between on the happy path. The initialization script that injects the bridge is guarded by the web origin, so it does nothing on local pages.

Two things detect a web that cannot be reached, because the webview gives no load-error hook:

- **Probe.** When the window is created, a task opens a TCP connection to the web's host and port (3 s limit) in parallel with the load. If it fails and the page has not finished loading, the window moves to the offline page. A direct connection can be blocked where the webview's proxy still works; the offline page then reloads the web by itself, so the cost is a short flash.
- **Watchdog.** A navigation that starts on the web origin arms a 15 s timer; the page-load `Finished` event disarms it. A page that never finishes moves the window to the offline page. A new navigation re-arms it and supersedes the older timer.

The offline page (`ui/offline.html`, `offline.js`) takes the web address in its `to` query. It shows "No connection", waits 1.5 s, then requests the address (no-cors, 8 s limit) and replaces itself with it once the request succeeds. While that fails it retries on a growing delay (1, 2, 4, 8, then every 15 seconds), at once on the browser's `online` event, and on the button. Only an `https` address (or `http://localhost`) is followed.

The default address is baked at build time: `DOU_WEB_URL` if set, else the dev web in a debug build and the production web in a release build; `--app` ([App source](#app-source)) replaces it. Nothing here depends on which web it is. The address in use, whatever its source, is the only origin the bridge capability allows.

A debug build prints `main page loaded N ms after launch` when the main page finishes loading.

### Measured (2026-11-27)

Debug build on macOS against `scripts/smoke/page.html` on `http://localhost:4173`, 5 cold starts each, time from process start to the request that serves the page:

|                                     | median | runs (ms)                  |
| ----------------------------------- | ------ | -------------------------- |
| before (local loader, then the web) | 954    | 2321, 902, 832, 954, 1036  |
| after (the web directly)            | 1006   | 2107, 1087, 911, 915, 1006 |

The runs overlap: on loopback the removed hop is cheap, and a first start after a rebuild is slower. What the change removes is the loader's own request to the web before the real load; the gap between the two requests in the old runs was 65 ms median (65, 95, 57, 26, 66 ms), and it grows by a round trip plus a TLS handshake on a real network. No faster start is claimed on loopback. The offline path was run by starting the app with nothing listening: the offline page showed, and once the server came up the page loaded by itself and the bridge handshake passed.

## Profile

`--profile <dir>` makes one folder one instance. Without it the shell uses the app data directory, so an existing install keeps its vault key and device id.

| Path                                    | What it is                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `app.json`                              | the app source and the localhost port of a served folder               |
| `settings.json`                         | the Agent window settings                                              |
| `webview/`                              | WebView storage on Windows; macOS keys its store by the folder instead |
| `node/`                                 | dou-cli session files (`storage.file`)                                 |
| `logs/`                                 | `shell.log`, `webview.log`, rotated                                    |
| `shell.lock`                            | the single-instance lock                                               |
| `shell.sock`                            | the control socket (Windows: `shell.pipe` names the pipe)              |
| `mcp.sock`                              | the dou-cli MCP server (Windows: `mcp.pipe` names the pipe)            |
| `dou.env`                               | optional `VITE_*` file passed to dou-cli as `--env-file`               |
| `device-id`, `vault.key`, `secrets.bin` | identity and the vault, per profile                                    |

The folder is created with mode 0700; a folder that already holds a profile (or is empty) is tightened to 0700, any other existing folder is left as it is. The lock is an OS file lock on `shell.lock`, so a crash releases it and two profiles run side by side. A second start on a locked profile hands its deep-link arguments (`chatic://` and `chatic-dev://` only) to the running instance over `shell.sock` as `second_instance`, focuses it and exits. That is how the sign-in return reaches the running app on Windows.

Storage is isolated per profile when `--profile` is given: on macOS 14 and later through a WKWebView data store identified by a UUID derived from the profile path, on Windows through a WebView2 user data folder inside the profile. Earlier macOS versions share one store. The keychain entry of the vault key is per profile as well.

## App source

`--app <folder|URL>` chooses what the main window loads and is saved in `app.json`; without it the saved value is used, and without that the default web.

- A URL must be `https`, or `http` on `localhost`.
- A folder must hold an `index.html`. The shell serves it from `http://localhost:<port>/` (GET and HEAD only, no directory escape, symlinks out of the folder refused, unknown paths without an extension fall back to `index.html`). The port is saved and reused so the origin, and its localStorage, stay stable; if it is taken a new one is saved.

A release build accepts only the DoU web here (the production and dev hosts, or the address baked with `DOU_WEB_URL`) and refuses a folder, so neither `app.json`, `--app` nor `shell.sock` can hand the bridge, and with it the vault, to another origin. A debug build accepts any of the above.

Changing the source restarts the shell: origin, capability and init script are fixed at start.

## Mini-app under development

`--mini-app <folder|URL>` opens a mini-app in the mini-app window ([bridge](../bridge/README.md#mini-apps)) once the main web has loaded, and is saved in `app.json` as `miniApp`, so the next start opens it again; `--mini-app none` forgets it. A folder is served like `--app` (index page fallback, no escape from the folder) from `http://localhost:<port>`; the port is saved as `miniPort` and reused so the origin, and its storage, stay the same. A URL is `https`, or `http` on `localhost`. The page is trusted as a reviewed mini-app, so `/.well-known/chatic-app.json` in the folder sets its title and display. The main window loading a new page closes it, so it opens after the first full web load only.

## Logs

The init script hooks `console.*`, `error` and `unhandledrejection` on the web origin and sends each to the `log_event` command, which the web capability allows. `log_event` checks the caller's origin, cuts a line at 4 KiB and drops more than 200 events a second. Messages are written as they are, so a page that prints a secret to the console leaves it in `webview.log`. `shell.log` and `webview.log` rotate at 1 MiB and keep three older files.

## shell.sock

A Unix socket (mode 0600, in the 0700 profile folder) or, on Windows, a named pipe with a random name that rejects remote clients. Newline-delimited JSON-RPC 2.0, one request per line.

| Method            | Params                               | Result                                                                                   |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `reload`          | none                                 | `{ reloaded }`                                                                           |
| `app_source`      | `{ set? }`                           | the current source, or `{ restarting, source }`                                          |
| `screenshot`      | none                                 | `{ format: "png", base64 }` of the main webview                                          |
| `logs_tail`       | `{ file?, lines? }`                  | `{ file, lines }` (`shell`, `webview`; 100 lines)                                        |
| `mini_app_open`   | `{ source }`                         | the opened view: `{ viewId, url, origin, trust, title, dev }` (folder or URL, not saved) |
| `mini_app_list`   | none                                 | `{ views }`, none or one                                                                 |
| `mini_app_close`  | `{ viewId? }`                        | `{ closed, viewId }`; without `viewId` the open one closes                               |
| `focus`           | none                                 | `{ focused }`                                                                            |
| `second_instance` | `{ argv }`                           | `{ accepted }`                                                                           |
| `push_token`      | `{ token }`                          | `{ accepted }`; `null` means push is off in the sidecar ([Push](#push))                  |
| `push_message`    | `{ title?, body?, deeplink?, data }` | `{ accepted }` ([Push](#push))                                                           |

The screenshot is taken by the webview (`takeSnapshot` on WKWebView, `CapturePreview` on WebView2) in `crates/capture`, so it needs no screen recording permission and has no window chrome.

`dou-shellctl --profile <dir> <reload|focus|app-source [value]|mini-app <open <folder|url>|list|close [viewId]>|screenshot <out.png>|logs [name] [lines]>` is a small client for it.

## Node sidecar

The sidecar uses `--parent-pipe` and the `build-sidecar` target of `apps/dou-cli`. The control sockets are Unix sockets; on Windows the MCP request from the Agent window has no read timeout yet.

The shell starts `dou-cli --profile <dir> --parent-pipe serve` and keeps its stdin pipe open: when the shell dies the pipe closes and dou-cli exits, so no orphan keeps `mcp.sock`. It stops dou-cli on exit. Output goes to `logs/node.log` (rotated like the others, readable with `logs_tail` and `dou-shellctl logs node`).

- **Where dou-cli comes from:** in a debug build `DOU_CLI_NODE_SCRIPT` (a built `main.mjs`, run with `node` or `DOU_CLI_NODE`), else `DOU_CLI_BIN`; otherwise `dou-cli` beside the app executable (the bundled single executable). If none exists the shell logs it and runs without MCP.
- **Crashes:** a stopped dou-cli restarts after 1, 2, 4 … 30 seconds. A run of a minute or more resets the count; after eight quick failures the shell stops trying and the Agent window shows the failure.
- **Pairing:** the shell pauses the sidecar, runs `dou-cli pair`, then resumes it (one process per profile may own the session files).
- **`dou-mcp --profile <dir>`:** a byte pipe from stdin and stdout to `mcp.sock`. It waits up to 15 seconds for the socket, then exits 1 with one line. Claude Code registers this command from the Connectors tab.
- **Bundling:** `tauri.sidecar.conf.json` adds `dou-cli` and `dou-mcp` as external binaries; `yarn nx run dou-cli:build-sidecar` and `node apps/desktop-tauri/scripts/stage-dou-mcp.mjs` put them in `src-tauri/binaries` named by target triple, then `cargo tauri build --config src-tauri/tauri.sidecar.conf.json`. The default build does not need them. On macOS the bundler signs every binary with the hardened runtime, so `src-tauri/Entitlements.plist` grants `com.apple.security.cs.allow-jit`: without it Node in `dou-cli` cannot allocate JIT memory and dies at start with `SIGTRAP`. The bundler applies one entitlements file to every binary in the app, so the shell and the Rust helpers carry it too. `.github/workflows/build-desktop-tauri.yml` runs these steps on macOS and Windows runners and uploads the `.dmg` and the NSIS `.exe`; the install guide is in the app README.

## Push

dou-cli receives FCM and hands it to the shell over `shell.sock` ([dou-cli Push](../../../dou-cli/README.md#push)); the shell keeps no FCM code of its own.

- **Token:** `src-tauri/src/fcm.rs` holds the token in one slot that starts waiting when a sidecar was found and off when not. `push_token` fills it (`null` turns it off); a token that differs from the one held is pushed to the web as `OnFetchFcmToken`, the same token again is not. `FetchFcmToken` reads the slot ([bridge](../bridge/README.md#simple-handlers)). The log has the token length, never the token.
- **A push:** `push_message` cuts the title to 200 and the body to 1000 characters and keeps only string `data` values. When the main window is visible, focused and not minimised, the push goes to the web as `OnReceiveNotification` with `{ notification: { title, body, data } }`, the shape the Electron shell sends, and the web shows its in-app banner. Otherwise the shell shows an OS notification with the same presenter `ShowNotification` uses; a push with no title shows nothing.

## Tray and shortcut

A tray icon (all platforms) has Open DoU, Open DoU Agent… and Quit; a left click opens the main window. The shortcut `CmdOrCtrl+Alt+D` shows the main window, or hides it when it is visible and focused. If another app already owns the shortcut, the app logs that and runs without it. Closing a window still closes it; when the main window is gone, the tray entry, a left click and the shortcut open a new one.

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
