# ADR-0388: Desktop v2 receives FCM in the sidecar and the shell presents it

> Status: Accepted · Decided: 2026-11-28 · Builds on: [ADR-0387](./0387-desktop-v2-runs-the-ts-runtime-in-node-and-rust-is-the-shell.md) · Scope: `libs/push/desktop/`, `apps/dou-cli/`, `apps/desktop-tauri/`

## Context

Desktop v2 (ADR-0387) shows `apps/web` in a Tauri webview and runs the DoU logic in the `dou-cli` Node sidecar. It showed no message notifications: `FetchFcmToken` answered an empty token, so the server had nowhere to push, and a click on a `ShowNotification` notification opened nothing. The Electron app already receives FCM through `@chatic/push-desktop`, and the web already registers the token, shows its in-app banner on `OnReceiveNotification` and opens a room on `OnNavigate`. The server applies mutes and per-room settings before it pushes.

## Decision

1. **The server's FCM push is the only source of a notification.** The sidecar receives it; neither the page nor the sidecar decides from socket messages.
2. **`@chatic/push-desktop` takes its host from the caller.** `startPush(config, handlers, host)` gets the credentials path, the wake and focus signals and the keep-awake hook from the caller, and no longer imports `electron`. The Electron app passes its current behaviour; `dou-cli` passes a Node host that stores the credentials in `<profile>/node/fcm.json` and treats a late timer tick as a wake.
3. **The sidecar forwards, the shell presents.** `dou-cli serve` reads the FCM settings from the same environment as its boot, with values baked in at build time as the fallback, and sends `push_token` and `push_message` over `shell.sock`. The Rust shell has no FCM client: it holds the token for `FetchFcmToken` and `OnFetchFcmToken`, gives a push to the web as `OnReceiveNotification` when the main window is visible, focused and not minimised, and shows an OS notification otherwise.
4. **A click opens the room through the web.** The shell turns the push data into a path the way the mobile app does, carries it on the OS notification, and on a click shows or recreates the main window and pushes `OnNavigate`. `ShowNotification` uses the same presenter, so its `deeplink` opens the room too. A new main page load clears the bridge's ready flag, so an event pushed right after a recreate waits for the new page.
5. **The click comes from `tauri-plugin-notification`.** Its `on_action` callback already reports a desktop click with the notification's extra data. No native notification crate is added.

## Alternatives

- **The web decides from socket messages and shows a local banner.** The quiet-hours and per-room preferences of the old desktop web would have to move into `apps/web`, and a closed window would show nothing.
- **The sidecar decides from socket messages.** The sidecar's account can differ from the page's, and the notification settings would be copied a second time.
- **FCM in Rust.** No mature crate exists, and nothing would be shared with the Electron app.
- **A native click callback (`UNUserNotificationCenter` through objc2, or WinRT toast activation directly).** More code and a new dependency for what the plugin already reports.

## Consequences

- The Tauri build needs the five `VITE_FCM_*` values when it bundles `dou-cli`; without them push is off and `FetchFcmToken` answers `''` at once.
- An Electron app and a Tauri app on the same computer register two tokens, so one message can show two notifications.
- Windows reports a click only while the toast is on screen, not from the Action Center. A click after the app has quit reaches no handler, so it does not open the room.
