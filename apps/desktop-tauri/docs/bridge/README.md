# bridge

How the page and the shell talk, and what the shell answers.

## Path

The web posts a JSON string to `window.ChaticMessageHandler.postMessage`. The shell's initialization script defines that function, and it exists only when the page's origin is the configured web origin. It calls the app command `bridge_request`, which refuses any caller whose webview address is not on that origin, then hands the string to `bridge_host::BridgeHost`. Answers and pushed events go back as a `message` event on `window`, the way the phone and Electron shells deliver them.

The capability `web-bridge` (added at start-up for the baked origin) is the only one that lets a remote page invoke anything, and it allows `bridge_request` alone. No plugin command is reachable from the page.

## Envelope

`crates/bridge-host` repeats the contract of `libs/bridges/src/app/AppBridgeHost.ts`:

- `WebAppReady` answers `OnWebAppReady` with the shell version, the request's protocol version, the request types it handles, their response types and `subWebViewOpenScope: 'anyHttps'`.
- `Ping` answers `Pong` with the payload.
- A request type with no handler answers `ERROR` / `NOT_FOUND` (recoverable); a handler that fails answers `ERROR` with its code (not recoverable). Both echo `refId`, `version` and `nonce`.
- Pushed events wait until the page's first request that is not a log, storage or runtime one, then go out before that request's answer. Each new page load in the main window (a reload, or the window opened again) waits again, so an event pushed while the page loads reaches the new page.
- A message that is not a JSON object with a string `type` is dropped without an answer.

## Injected globals

`globals.rs` sets the `CHATIC_APP_*` values the web reads: platform `desktop`, the stage, a device id kept in the app data directory, the version, the OS language's bare subtag and `CHATIC_APP_CAPABILITIES = { version: 1, checkout: [] }`, so the web offers no subscription or purchase.

## Simple handlers

`SavePreference` is accepted and not stored (the page keeps its theme). `FetchFcmToken` answers the FCM token the dou-cli sidecar registered ([Push](../shell/README.md#push)): at once when there is one, `''` at once when there is no sidecar or push is off, otherwise after waiting up to 30 seconds (`''` when none came). Each new token is also pushed as `OnFetchFcmToken` with `{ token }`. `SetBadgeCount` sets the dock badge on macOS and draws the page's PNG overlay on the Windows taskbar button. `OpenURL` opens an http or https address in the system browser and refuses anything else. `OpenSubWebView` and `CloseSubWebView` open and close a mini-app window; see [Mini-apps](#mini-apps). `StartUpdateDownload` and `RestartToUpdate` drive `tauri-plugin-updater`: a build made with `DOU_UPDATE_FEED=<url of latest.json>` checks it every 30 minutes and pushes `OnUpdateStatus` (`available`, `downloading` with a percent, `downloaded`, `error`); without that variable the shell never checks. The feed is checked against the minisign public key in `tauri.conf.json` and the signature must carry the version. That key belongs to a throwaway pair made for the local run; replace it with the release key before shipping, and keep the private key out of the repository. `ShowNotification` shows an OS notification with the title (at most 200 characters, required) and the body (at most 1000); a click opens the `deeplink` path the way a push does ([Push](../shell/README.md#push)). A second launch brings the running window to the front, or opens a new one when it was closed, instead of starting another process. `OAuthLogin` and `FetchUrlMetadata` have their own sections below.

## What is handled

The list is `HANDLED` in `src-tauri/src/handlers/mod.rs`. `scripts/check-bridge-contract.mjs` compares it with the Electron handler list (`apps/desktop/src/main/bridgeHandlers.ts`, `updater.ts`): Tauri may handle what Electron handles and two additions, `OAuthLogin` and `OpenURL`; today it handles all of them. `--complete` requires equality. The script also checks that the Rust response-type table equals `WEB_MESSAGE_RESPONSE_TYPE`.

```sh
npx nx run desktop-tauri:check-bridge-contract
```

## Guards: Tauri and Electron

The web page behind the bridge is remote content, so a script injected into it can send any bridge message. The shell limits what that can do. `handlers/limits.rs` holds the numbers and `bridge_request` applies them before a message reaches a handler; a refused message is answered with an `ERROR` carrying the request's `refId`.

| Guard              | Tauri shell                                                                                                                                             | Electron (`apps/desktop/src/main`)                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Caller             | the `main` window at the web origin only                                                                                                                | the main window's web contents                                       |
| Message size       | 256 KiB, else `INVALID`                                                                                                                                 | none                                                                 |
| Rate per minute    | all messages 300; `ShowNotification` and `OpenURL` 10; `OpenSubWebView` 6; `OAuthLogin` 5; `StorageSave` and `FetchUrlMetadata` 30; else `RATE_LIMITED` | none (sub-webview hand-offs to the OS browser stop after 3 in a row) |
| Sub-webview scope  | `reviewed`: hub hosts and their subdomains only (`apps.chatic.io`, `apps-dev.chatic.io`); any other https host is `NOT_ALLOWED`                         | `anyHttps`                                                           |
| `OpenURL`          | http or https, at most 2048 characters                                                                                                                  | not handled                                                          |
| `StorageSave`      | key 256, value 64 KiB, one save 256 KiB; else `INVALID`                                                                                                 | none                                                                 |
| `ShowNotification` | title 200, body 1000 characters                                                                                                                         | none                                                                 |
| Local UI CSP       | `connect-src` is the IPC and the two web origins; `http://localhost:*` only in `devCsp`                                                                 | not applicable                                                       |

Tauri is stricter on purpose. A build that points `DOU_WEB_URL` at another host must add that origin to `connect-src` in `tauri.conf.json`, or the loader page cannot reach it.

## Social sign-in

`apps/web` offers Google (Apple too) when the shell answers `OAuthLogin`; it posts the request and listens for the `OnOAuthLogin` event. The flow is the one desktop-web uses on Electron (ADR-0009, ADR-0178), and `crates/oauth` holds its rules:

1. `OAuthLogin` with a provider records a start (provider, time, random nonce; one at a time, a new start replaces the old) and opens `<relay>/oauth/<provider>/authorize?redirect=<hand-off>/auth/oauth-response?nonce=&provider=` in the system browser. A provider other than `google` or `apple` answers `INVALID`; the shell does not answer a good start (the result comes as the event).
2. The relay returns to the hand-off page, which opens `chatic://oauth?provider=&code=&nonce=` (`chatic-dev:` on the dev channel). `tauri.conf.json` registers both schemes; `tauri-plugin-deep-link` delivers the link, and a second start on the same profile hands the link to the running app over `shell.sock` (see the shell doc).
3. `Pending::accept` is the only door: it spends the start only for a match or a start past its ten minutes (a stray link with the wrong nonce does not cancel a sign-in in progress), and refuses a link with no start, a start older than ten minutes, another provider, or a missing or different nonce. Only a match pushes `OnOAuthLogin` with `{ result: { platform, provider, code } }`; the web exchanges the code. Anything else is dropped and logged to stderr.

Addresses are baked at build time: the relay is `https://oauth2.eureka.codes` unless `DOU_SOCIAL_OAUTH_ENDPOINT` is set; the hand-off host is `https://desktop.dou.chatic.io` on the `prod` stage and `https://desktop.dou-dev.chatic.io` otherwise, unless `DOU_HANDOFF_URL` is set.

Limits: the start is kept in memory, so a sign-in whose browser round trip outlives the app process is refused when the link arrives (logged to stderr, nothing shown). The Electron app registers the same schemes, so on one machine whichever registered last receives the link. macOS delivers a link only to the installed `.app` bundle, not to a bare `cargo run` binary. The request form `oauthLogin` (used when linking an account) gets no answer and times out, because the result is an event.

## Link preview

`FetchUrlMetadata` fetches the page in Rust (`crates/unfurl`) with the rules of `apps/desktop/src/main/unfurl.ts`: only http and https; a loopback, private, link-local, `.local`/`.internal`/`.localhost` or dot-less host is refused before every hop (carrier-grade NAT `100.64.0.0/10` too, which Electron lets through); redirects are followed by hand up to five times and each hop is checked; three seconds in all; the first 256 KB; an HTML answer with a title; an image only if its address is https. A refused or failed fetch answers `success: false` inside a normal reply, not an error. The guard also checks the address a name resolves to: the HTTP client's resolver drops every private address and fails when none is left, so a public name pointing at `127.0.0.1` or `169.254.169.254` is refused on every hop. NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`) addresses are refused too.

## Mini-apps

`OpenSubWebView` opens a page in a second window owned by the main window; it matches the Electron `DesktopSubWebViewService` (ADR-0265, 0297, 0320, 0323). The rules of `libs/shared/src/utils/subWebViewTrust.ts` are in `crates/subview`: `parse_open` (https only), `trust_of` (first party, reviewed, external), `policy` (navigation, manifest, titles) and `page` (the page protocol).

| Behaviour          | Here                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One view at a time | `ALREADY_OPEN` for a second open; `NOT_OPEN` for a close that names another id                                                                                                                                                                                                                   |
| Window             | a native window owned by the main window, 960 x 720; the native title bar shows the bar title and its close button closes by `user`; a `clean` display has no title bar. The Electron in-window modal card is not copied: it needs Tauri's `unstable` multiwebview feature                       |
| Bar title          | the title the page set, else the document title, else the `title` of the open request, else the manifest name, else the host; an external page always shows its host                                                                                                                             |
| Manifest           | first-party and reviewed pages: `GET <origin>/.well-known/chatic-app.json` before the window opens (3 s, 64 KiB, no redirect, `manifestVersion` 1) gives `name` and `display` (`titled`, `clean`, `immersive` shown as `clean`); external pages are always `titled`                              |
| Navigation         | the opened origin loads; another https address goes to the system browser (at most 3 in 10 seconds); app deep links (`app.chatic.io/i`, `/s`), addresses with user info, backslashes or control characters, and everything else are blocked. Popups follow the same rule and never open a window |
| Storage            | one store per origin, derived from the profile (a WKWebView data store on macOS 14 and later, a WebView2 folder under `subview/` in the profile on Windows)                                                                                                                                      |
| Downloads          | cancelled                                                                                                                                                                                                                                                                                        |
| Close              | Esc, the native close button (`user`), `CloseSubWebView` (`host`), `FinishSubWebView` (`page`, with the result), or the main window starting a new page load, which closes it without an event                                                                                                   |

The page talks to the shell as it does in the app: `window.ReactNativeWebView.postMessage(string)` reaches a per-view `BridgeHost` through the `sub_bridge_request` command, and replies arrive as `message` events. `window.ChaticSubWebView` is the frozen context (`protocolVersion`, `viewId`, `platform: 'desktop'`, `appVersion`, `locale`, `theme`, `params`) and `OnWebAppReady` carries it as `subWebView`. A page may send `WebAppReady`, `Ping`, `FinishSubWebView`, `SetSubWebViewTitle` and `ReportSubWebViewError` (cut to 1000 and 4000 characters, 20 reports per page load, written to `shell.log`); a message over 64 KiB answers `TOO_LARGE`. A new page load gets a fresh host, so readiness and the report count start again. The two sub commands are allowed by a capability added for that one window label and origin when it opens; each call checks that the caller is the open view and still on the opened origin.

Known gaps against Electron: a subframe's own navigation and scheme are not gated (the platform webview offers no hook for it); permission prompts (camera, microphone, geolocation) are not denied (WKWebView exposes no handler through wry); a message from a same-origin subframe is accepted because the command sees only the top page's address; `SetSubWebViewCloseGuard`, the sub-view storage messages and the runtime messages are not implemented.

A developer opens a mini-app under development with `--mini-app` or on `shell.sock`; see [shell](../shell/README.md). A `http://localhost` mini-app is trusted as a reviewed app (so its manifest is read) and can only be opened that way, never by a page's `OpenSubWebView`.
