# Desktop Shell loads Desktop Web remotely

The Desktop Shell (Electron) loads the Desktop Web client from a deployed remote URL rather than bundling it inside the app package. We chose this for instant web updates without re-releasing the Shell, mirroring how the Mobile Shell already consumes `VITE_WEBVIEW_BASE_URL`. The Shell stays thin and rarely needs to ship.

## Considered Options

- **Local bundle** (the Slack/common pattern): web assets packaged with the app, updated via `electron-updater`. Offline-capable and immune to version skew, but every web change needs a Shell release.
- **Remote URL** (chosen): Shell `loadURL`s the deployed Desktop Web. Instant updates, no rebuild.
- **Hybrid**: bundle shell + remote web assets with a version handshake and cache. Rejected as over-engineered for now.

## Consequences

- **Capability Skew** is accepted as a real risk: Shell and Web deploy independently and may speak different Bridge versions. It is mitigated — not assumed away — by the existing `WebAppReady` handshake (`libs/bridges/src/app/AppBridgeHost.ts`), through which the Web side feature-detects the host's supported messages and capabilities. Bumping `BRIDGE_VERSION` on any wire-contract change is a standing discipline.
- The app does not boot offline. Acceptable for a chat client, which is network-bound anyway.
