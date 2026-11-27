# desktop-tauri

The Tauri shell that shows `apps/web` on macOS and Windows. Why it loads the deployed web and answers the bridge from Rust is in [ADR-0384](../../docs/adr/0384-the-tauri-shell-loads-the-deployed-web-and-answers-the-bridge-from-rust.md). The Electron desktop (`apps/desktop`, `apps/desktop-web`) and the parked Rust engine (`apps/desktop-native`) are separate and untouched; this shell does not depend on the engine.

## Layout

| Path                    | What it is                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/`            | the Tauri app crate (`dou-tauri`)                                                                                                        |
| `ui/`                   | local pages the app serves itself: the loader shown while the web address is checked                                                     |
| `crates/bridge-host`    | the bridge envelope in Rust, free of any UI toolkit                                                                                      |
| `crates/agent-settings` | validation of the MCP permission settings                                                                                                |
| `crates/connectors`     | registering the launcher with Claude Desktop and Claude Code                                                                             |
| `crates/vault`          | the encrypted `nativeSecure` store                                                                                                       |
| `crates/capture`        | PNG of the main webview, taken by the webview itself (the only crate allowed `unsafe`)                                                   |
| `scripts/`              | `check-bridge-contract.mjs`; `smoke/` (a fixture page and a server for the CI smoke run)                                                 |
| `docs/`                 | [agent](./docs/agent/README.md), [bridge](./docs/bridge/README.md), [storage](./docs/storage/README.md), [shell](./docs/shell/README.md) |

## Commands

The Rust targets are named `rust-build`, `rust-test` and `rust-lint` so the repo-wide `-t build`, `-t test` and `-t lint` gate does not run a Rust toolchain.

```sh
npx nx run desktop-tauri:rust-build
npx nx run desktop-tauri:rust-test
npx nx run desktop-tauri:rust-lint
npx nx run desktop-tauri:dev      # cargo tauri dev; needs: cargo install tauri-cli --locked --version '^2'
```

`DOU_WEB_URL` and `DOU_STAGE` at build time pick the web address and the stage.

## Running instances

`dou-tauri --profile <dir> [--app <folder|URL>]` runs one instance per folder, so two profiles run side by side with separate storage. `--app` loads a built web folder (for example a worktree's `apps/web` dist) or a dev server URL instead of the deployed web and remembers it in `<dir>/app.json`. `dou-shellctl --profile <dir> screenshot out.png` (also `reload`, `focus`, `app-source`, `logs`) talks to the running shell. Details: [shell](./docs/shell/README.md).

For a production bundle that sits beside the dev one, add `--config '{"identifier":"io.chatic.desktop.tauri.prod","productName":"DoU Tauri Prod"}'` and leave `DOU_WEB_URL` and `DOU_STAGE` unset: it opens `https://dou.chatic.io`, uses the production relay, and keeps its app data, agent profile and keychain entry under the `.prod` identifier, apart from the dev app. Without them a debug build opens `https://dou-dev.chatic.io` and a release build `https://dou.chatic.io`.

## CI

`.github/workflows/desktop-tauri.yml` runs on `macos-latest` and `windows-latest`: the contract check, fmt, clippy, tests, a debug build, then the app is started against `scripts/smoke/page.html` served on `http://localhost:4173`. The page performs the bridge handshake and a vault save and read; the run passes when the page reports back. Run it by hand: `DOU_WEB_URL=http://localhost:4173 DOU_STAGE=dev DOU_VAULT_KEY_FILE=1 cargo build`, `node scripts/smoke/server.mjs`, then `target/debug/dou-tauri`.

## Updater, local run

`scripts/update-check` serves a page and a feed. Build version 0.0.2 and copy its `.app.tar.gz` and `.sig` into a feed directory with a `latest.json` (`version`, `platforms.darwin-aarch64.signature` and `.url`), build 0.0.1 and copy it to a real path (not under a symlink such as `/tmp`; the updater refuses those), then run `node scripts/update-check/server.mjs 4174 <feed dir> 0.0.2` and start the 0.0.1 app. Both builds use `TAURI_SIGNING_PRIVATE_KEY=<key file>`, `DOU_WEB_URL=http://localhost:4174`, `DOU_UPDATE_FEED=http://localhost:4174/latest.json` and `cargo tauri build --bundles app --config '{"version":"<v>","plugins":{"updater":{"dangerousInsecureTransportProtocol":true}},"bundle":{"createUpdaterArtifacts":true}}'`. The server exits 0 when the page loads again as 0.0.2.
