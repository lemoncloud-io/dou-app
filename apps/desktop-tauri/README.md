# desktop-tauri

The Tauri shell that shows `apps/web` on macOS and Windows. Why it loads the deployed web and answers the bridge from Rust is in [ADR-0384](../../docs/adr/0384-the-tauri-shell-loads-the-deployed-web-and-answers-the-bridge-from-rust.md). The Electron desktop (`apps/desktop`, `apps/desktop-web`) and the Rust engine (`apps/desktop-native`) are separate and untouched.

## Layout

| Path                    | What it is                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/`            | the Tauri app crate (`dou-tauri`)                                                                                                        |
| `ui/`                   | local pages the app serves itself: the loader shown while the web address is checked                                                     |
| `crates/bridge-host`    | the bridge envelope in Rust, free of any UI toolkit                                                                                      |
| `crates/agent-settings` | validation of the MCP permission settings                                                                                                |
| `crates/connectors`     | registering the launcher with Claude Desktop and Claude Code                                                                             |
| `crates/vault`          | the encrypted `nativeSecure` store                                                                                                       |
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

`DOU_WEB_URL` and `DOU_STAGE` at build time pick the web address and the stage; `cargo build --release --bin dou-mcp` first, then `cargo tauri build --bundles app` bundles `dou-mcp` next to the app binary so Connectors finds it.

Without them a debug build opens `https://dou-dev.chatic.io` and a release build `https://dou.chatic.io`.

## CI

`.github/workflows/desktop-tauri.yml` runs on `macos-latest` and `windows-latest`: the contract check, fmt, clippy, tests, a debug build, then the app is started against `scripts/smoke/page.html` served on `http://localhost:4173`. The page performs the bridge handshake and a vault save and read; the run passes when the page reports back. Run it by hand: `DOU_WEB_URL=http://localhost:4173 DOU_STAGE=dev DOU_VAULT_KEY_FILE=1 cargo build`, `node scripts/smoke/server.mjs`, then `target/debug/dou-tauri`.
