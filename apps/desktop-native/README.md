# desktop-native

The Rust side of DoU desktop v2: a headless engine and a local MCP server that run without a window. The Electron desktop (`apps/desktop`, `apps/desktop-web`) is untouched; why two engines exist is in [ADR-0382](../../docs/adr/0382-desktop-native-has-its-own-rust-engine-held-to-the-ts-engine-by-vectors-and-scenarios.md).

## Layout

| Path                 | What it is                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `crates/dou-core`    | shared types and errors                                                                             |
| `crates/dou-signing` | the request and socket signature, matched to the TS formula by vectors                              |
| `vectors/`           | JSON written by the TS code with fixed inputs; Rust must reproduce it byte for byte                 |
| `docs/`              | [engine](./docs/engine/README.md), [mcp](./docs/mcp/README.md), [vectors](./docs/vectors/README.md) |

More crates (`dou-http`, `dou-auth`, `dou-socket`, `dou-store`, `dou-engine`, `dou-control`, `dou-mcp`, `dou-cli`) are added as the engine grows; each is listed here when it lands.

## Commands

The Rust targets are named `rust-build`, `rust-test` and `rust-lint` so the repo-wide `-t build`, `-t test` and `-t lint` gate on ubuntu does not run a Rust toolchain; `.github/workflows/desktop-native.yml` is this project's own gate.

```sh
npx nx run desktop-native:rust-build
npx nx run desktop-native:rust-test
npx nx run desktop-native:rust-lint
```

The same checks run on macOS and Windows in `.github/workflows/desktop-native.yml` when a Rust path changes, or when a TS source the vectors or strings come from changes (`libs/auth`, `libs/transport`, `libs/data`, `libs/sync`, `libs/runtime-core`, the web locales).
