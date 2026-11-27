# shell

The main window, the profile it runs in, where its web comes from, its logs, and the `shell.sock` control socket.

## Loading

The window opens the local `ui/index.html` with the web address in its `to` query. `ui/loader.js` requests the address (no-cors, 8 s limit) and replaces the page with it once the request succeeds. While it fails the page says "No connection" and retries on a growing delay (1, 2, 4, 8, then every 15 seconds), or at once on the button. An `https` address is followed, and `http` only on `localhost`.

The default address is baked at build time: `DOU_WEB_URL` if set, else the dev web in a debug build and the production web in a release build. The address in use, whatever its source, is the only origin the bridge capability allows.

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

Changing the source restarts the shell: origin, capability and init script are fixed at start.

## Logs

The init script hooks `console.*`, `error` and `unhandledrejection` on the web origin and sends each to the `log_event` command, which the web capability allows. `log_event` checks the caller's origin, cuts a line at 4 KiB and drops more than 200 events a second. Messages are written as they are, so a page that prints a secret to the console leaves it in `webview.log`. `shell.log` and `webview.log` rotate at 1 MiB and keep three older files.

## shell.sock

A Unix socket (mode 0600, in the 0700 profile folder) or, on Windows, a named pipe with a random name that rejects remote clients. Newline-delimited JSON-RPC 2.0, one request per line.

| Method            | Params              | Result                                            |
| ----------------- | ------------------- | ------------------------------------------------- |
| `reload`          | none                | `{ reloaded }`                                    |
| `app_source`      | `{ set? }`          | the current source, or `{ restarting, source }`   |
| `screenshot`      | none                | `{ format: "png", base64 }` of the main webview   |
| `logs_tail`       | `{ file?, lines? }` | `{ file, lines }` (`shell`, `webview`; 100 lines) |
| `focus`           | none                | `{ focused }`                                     |
| `second_instance` | `{ argv }`          | `{ accepted }`                                    |

The screenshot is taken by the webview (`takeSnapshot` on WKWebView, `CapturePreview` on WebView2) in `crates/capture`, so it needs no screen recording permission and has no window chrome.

`dou-shellctl --profile <dir> <reload|focus|app-source [value]|screenshot <out.png>|logs [name] [lines]>` is a small client for it.

## Node sidecar

The sidecar depends on `--parent-pipe` and the `build-sidecar` target of dou-cli, which land in their own pull request (`apps/dou-cli` is not part of this folder). The control sockets are Unix sockets; on Windows the MCP request from the Agent window has no read timeout yet.

The shell starts `dou-cli --profile <dir> --parent-pipe serve` and keeps its stdin pipe open: when the shell dies the pipe closes and dou-cli exits, so no orphan keeps `mcp.sock`. It stops dou-cli on exit. Output goes to `logs/node.log` (rotated like the others, readable with `logs_tail` and `dou-shellctl logs node`).

- **Where dou-cli comes from:** in a debug build `DOU_CLI_NODE_SCRIPT` (a built `main.mjs`, run with `node` or `DOU_CLI_NODE`), else `DOU_CLI_BIN`; otherwise `dou-cli` beside the app executable (the bundled single executable). If none exists the shell logs it and runs without MCP.
- **Crashes:** a stopped dou-cli restarts after 1, 2, 4 … 30 seconds. A run of a minute or more resets the count; after eight quick failures the shell stops trying and the Agent window shows the failure.
- **Pairing:** the shell pauses the sidecar, runs `dou-cli pair`, then resumes it (one process per profile may own the session files).
- **`dou-mcp --profile <dir>`:** a byte pipe from stdin and stdout to `mcp.sock`. It waits up to 15 seconds for the socket, then exits 1 with one line. Claude Code registers this command from the Connectors tab.
- **Bundling:** `tauri.sidecar.conf.json` adds `dou-cli` and `dou-mcp` as external binaries; `yarn nx run dou-cli:build-sidecar` and `node apps/desktop-tauri/scripts/stage-dou-mcp.mjs` put them in `src-tauri/binaries` named by target triple, then `cargo tauri build --config src-tauri/tauri.sidecar.conf.json`. The default build does not need them. Release workflow steps are not part of this folder.