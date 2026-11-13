# apps/mobile documentation

The React Native shell around one WebView, and a second one it shows over it for a page on another
origin. These documents describe **the shell**: what it does
before, around, and underneath the web client. Product behaviour inside the WebView is documented in
`apps/web/docs/`, not here.

## Tree rules

1. Every category folder has a `README.md` — either the category's lead document, or a short index.
2. A category name has to answer "does this document belong here?" on its own. Names that cannot
   (`misc`, `common`, `architecture`) are not used.
3. Depth stops at `docs/<category>/<topic>.md`. Needing another level means the category is wrong.
4. No topic files directly under `docs/` — this file is the only top-level document.

## Categories

| Category                        | Answers                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [webview/](./webview/README.md) | The single seam between shell and web — the bridge surface, injection, remote debugging, and the sub WebView |
| [boot/](./boot/README.md)       | What runs before the first pixel, and what that costs on-device                                              |
| [native/](./native/README.md)   | How the shell wraps the OS — the three-way parity contract and the service execution boundary                |
| [push/](./push/README.md)       | Notification delivery, click routing, and the app icon badge                                                 |
| [storage/](./storage/README.md) | What the shell persists for the web client — SQLite, MMKV, the device vault, and resumable uploads           |
| [runtime/](./runtime/README.md) | The session run by the app itself — who owns it per launch, how the runtime boots, and what it keeps running |
| [system/](./system/README.md)   | OS-level state both sides must agree on — theme, language and deep links                                     |
| [release/](./release/README.md) | Building, shipping, updating, running against a local web server, and device scenarios                       |

Shared libraries the shell depends on are documented in their own packages: `libs/bridge-messages`,
`libs/bridges`, `libs/logger`, `libs/device-utils`, `libs/shared`.
