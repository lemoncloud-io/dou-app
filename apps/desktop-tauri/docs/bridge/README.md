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
- Pushed events wait until the page's first request that is not a log, storage or runtime one, then go out before that request's answer.
- A message that is not a JSON object with a string `type` is dropped without an answer.

## Injected globals

`globals.rs` sets the `CHATIC_APP_*` values the web reads: platform `desktop`, the stage, a device id kept in the app data directory, the version, the OS language's bare subtag and `CHATIC_APP_CAPABILITIES = { version: 1, checkout: [] }`, so the web offers no subscription or purchase.

## Simple handlers

`SavePreference` is accepted and not stored (the page keeps its theme). `FetchFcmToken` answers an empty token until FCM exists. `SetBadgeCount` sets the dock badge on macOS and draws the page's PNG overlay on the Windows taskbar button. `OpenURL` opens an http or https address in the system browser and refuses anything else. `OpenSubWebView` opens a plain https page in a second window of its own (one at a time, `ALREADY_OPEN` otherwise; the rules of `libs/shared/src/utils/subWebViewTrust.ts` are in `crates/subview`), with no bridge and no IPC; the window may only load the opened origin, and `CloseSubWebView` or closing the window ends it with `OnSubWebViewClosed` (`host` or `user`). Not done yet: the shell chrome bar, the manifest, sandbox and permission denial, the page-to-shell protocol (`FinishSubWebView` and the rest) and hand-off of links to the OS browser. `StartUpdateDownload` and `RestartToUpdate` drive `tauri-plugin-updater`: a build made with `DOU_UPDATE_FEED=<url of latest.json>` checks it every 30 minutes and pushes `OnUpdateStatus` (`available`, `downloading` with a percent, `downloaded`, `error`); without that variable the shell never checks. The feed is checked against the minisign public key in `tauri.conf.json` and the signature must carry the version. That key belongs to a throwaway pair made for the local run; replace it with the release key before shipping, and keep the private key out of the repository. `ShowNotification` shows an OS notification with the title (at most 200 characters, required) and the body (at most 1000); the `deeplink` is not used yet, so a click does not open the room. A second launch brings the running window to the front instead of starting another process.

## What is handled

The list is `HANDLED` in `src-tauri/src/handlers/mod.rs`. `scripts/check-bridge-contract.mjs` compares it with the Electron handler list (`apps/desktop/src/main/bridgeHandlers.ts`, `updater.ts`): Tauri may handle what Electron handles and two additions, `OAuthLogin` and `OpenURL`. `--complete` requires equality. The script also checks that the Rust response-type table equals `WEB_MESSAGE_RESPONSE_TYPE`.

```sh
npx nx run desktop-tauri:check-bridge-contract
```
