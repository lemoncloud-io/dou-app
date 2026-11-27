# desktop-native

The Rust side of DoU desktop v2: a headless engine and a local MCP server that run without a window. The Electron desktop (`apps/desktop`, `apps/desktop-web`) is untouched; why two engines exist is in [ADR-0382](../../docs/adr/0382-desktop-native-has-its-own-rust-engine-held-to-the-ts-engine-by-vectors-and-scenarios.md).

## Layout

| Path                 | What it is                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `crates/dou-core`    | shared types, errors, clock                                                                         |
| `crates/dou-signing` | the request and socket signature, matched to the TS formula by vectors                              |
| `crates/dou-http`    | SigV4 signing, request building and the HTTP client, matched by vectors                             |
| `crates/dou-auth`    | relay API, device pairing, relay refresh, the on-disk profile and session vault                     |
| `crates/dou-socket`  | the socket protocol, handshake, and a reconnecting link                                              |
| `crates/dou-store`   | SQLite cache of rooms, messages and the outbox                                                      |
| `crates/dou-engine`  | rooms, messages, send/reply/react, the outbox and event classification                              |
| `crates/dou-control` | permissions (tier, allow-list, rate limit), the event log and the local control IPC                 |
| `crates/dou-mcp`     | the stdio MCP server; a thin client of the control IPC                                              |
| `crates/dou-app`     | starts the engine for a profile and a cloud: link, relay renewal, store, control service           |
| `crates/dou-cli`     | the `dou` binary: pair, serve, mcp, local commands, `perm`                                         |
| `vectors/`           | JSON written by the TS code with fixed inputs; Rust must reproduce it byte for byte                 |
| `docs/`              | [engine](./docs/engine/README.md), [mcp](./docs/mcp/README.md), [vectors](./docs/vectors/README.md) |


## Commands

The Rust targets are named `rust-build`, `rust-test` and `rust-lint` so the repo-wide `-t build`, `-t test` and `-t lint` gate on ubuntu does not run a Rust toolchain; `.github/workflows/desktop-native.yml` is this project's own gate.

```sh
npx nx run desktop-native:rust-build
npx nx run desktop-native:rust-test
npx nx run desktop-native:rust-lint
```

The same checks run on macOS and Windows in `.github/workflows/desktop-native.yml` when a Rust path changes, or when a TS source the vectors or strings come from changes (`libs/auth`, `libs/transport`, `libs/data`, `libs/sync`, `libs/runtime-core`, the web locales).

## Running it

```sh
dou --profile DIR --env-file FILE pair              # prints a code; approve it from a signed-in device
dou --profile DIR --env-file FILE serve --cloud ID  # keeps the engine and the control IPC running
dou --profile DIR perm show                         # read only; permissions change in the app's Agent window
dou --profile DIR rooms | read ROOM | send ROOM TEXT | wait --timeout 30000
dou --profile DIR mcp                               # stdio MCP for an agent
```

Every text sent by an MCP tool or by `dou send|reply|mention` starts with `[AI] `; the engine adds it and no argument turns it off. The command line is an agent client: it is refused while the permission tier is off and follows the allow-list and the rate limit (see [mcp](./docs/mcp/README.md)).

## Embedding it (the Tauri shell)

Path dependencies, no binary needed:

- `dou_app::start(api, &profile, cloud_id, user_agent) -> Running` connects, renews the relay credential in the background and builds the control service. `Running { me, cloud, control_name, mcp_name, service }`; `running.serve().await` serves both control endpoints (the CLI uses `control_name`, `dou mcp` uses `mcp_name`), and `running.service` is the in-process handle: `service.handle(Client::App, method, params)` for the app's own screens (reads only).
- Permissions for an app screen: `service.current_settings()` and `service.set_settings(settings)`, which persists the file and swaps the in-memory copy. The service never rereads the file. This is not exposed through MCP or the control IPC.
- Sign-in: `dou_auth::{Profile, RelayApi, PairingRequest}` (see `dou-cli/src/commands.rs` `pair`).