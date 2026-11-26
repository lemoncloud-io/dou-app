# desktop-tauri

The Tauri shell that shows `apps/web` on macOS and Windows. Why it loads the deployed web and answers the bridge from Rust is in [ADR-0384](../../docs/adr/0384-the-tauri-shell-loads-the-deployed-web-and-answers-the-bridge-from-rust.md). The Electron desktop (`apps/desktop`, `apps/desktop-web`) and the Rust engine (`apps/desktop-native`) are separate and untouched.

## Layout

| Path                 | What it is                                                                           |
| -------------------- | ------------------------------------------------------------------------------------ |
| `src-tauri/`         | the Tauri app crate (`dou-tauri`)                                                    |
| `ui/`                | local pages the app serves itself: the loader shown while the web address is checked |
| `crates/bridge-host` | the bridge envelope in Rust, free of any UI toolkit                                  |
| `scripts/`           | `check-bridge-contract.mjs`                                                          |
| `docs/`              | [bridge](./docs/bridge/README.md), [shell](./docs/shell/README.md)                   |

## Commands

The Rust targets are named `rust-build`, `rust-test` and `rust-lint` so the repo-wide `-t build`, `-t test` and `-t lint` gate does not run a Rust toolchain.

```sh
npx nx run desktop-tauri:rust-build
npx nx run desktop-tauri:rust-test
npx nx run desktop-tauri:rust-lint
npx nx run desktop-tauri:dev      # cargo tauri dev; needs: cargo install tauri-cli --locked --version '^2'
```

`DOU_WEB_URL` at build time overrides the web address; without it a debug build opens `https://dou-dev.chatic.io` and a release build `https://dou.chatic.io`.
