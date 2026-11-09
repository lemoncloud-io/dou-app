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
| `StartUpdateDownload` / `RestartToUpdate`     | Auto-update, packaged builds only                              |

Every other request in `@chatic/bridge-messages` is deliberately unanswered (`NOT_FOUND`), each with
its reason in `src/main/bridgeHandlers.contract.test.ts`. A new message fails that suite until it is
handled or listed there.

## Injected globals

The preload (`src/preload/index.ts`) sets these on `window` before the page runs:

- `CHATIC_APP_PLATFORM` (`'desktop'`), `CHATIC_APP_APPLICATION`, `CHATIC_APP_STAGE`,
  `CHATIC_APP_DEVICE_ID`, `CHATIC_APP_INSTALLATION_ID`, `CHATIC_APP_DEVICE_MODEL`,
  `CHATIC_APP_CURRENT_VERSION`, `CHATIC_APP_LATEST_VERSION`, `CHATIC_APP_BUILD_NUMBER`,
  `CHATIC_APP_CURRENT_LANGUAGE`, `CHATIC_APP_SHOULD_UPDATE` — the same keys the phone shell injects.
- `CHATIC_APP_STORAGE_MEDIA` — `['nativeSecure']`: the storage media the shell keeps. The web picks
  its storage from this list alone, synchronously at boot.
- `ChaticMessageHandler.postMessage` — the bridge's web → app path.
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
