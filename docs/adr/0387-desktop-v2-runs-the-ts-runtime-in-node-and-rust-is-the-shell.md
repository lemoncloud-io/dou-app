# ADR-0387: Desktop v2 runs the TS runtime in Node and Rust is the shell and harness

> Status: Accepted · Decided: 2026-11-27 · Supersedes: ADR-0382 · Amends: ADR-0380 · Scope: `apps/desktop-native/`, `apps/desktop-tauri/`

## Context

ADR-0382 gave desktop v2 a second engine in Rust, held to the TS engine by vectors and scenarios. Since then the libraries were reorganised around `@chatic/runtime` (ADR-0376): one headless runtime with platform adapters, and `libs/runtime-node` as its Node adapter. That adapter already runs the pairing flow, the session, the sync and the data layer that desktop v2 needs, so the double cost ADR-0382 accepted is no longer forced. The Tauri shell (ADR-0383, ADR-0384) already shows `apps/web` and answers the bridge.

## Decision

1. **The Rust engine is parked.** The crates `dou-auth`, `dou-socket`, `dou-app`, `dou-engine` and `dou-store` stay in the tree, are not extended and are not depended on by the shell. Work in flight on them stops; their pull requests stay open as drafts.
2. **DoU logic runs in TypeScript, in Node.** A headless `apps/dou-cli` process on `@chatic/runtime` through `libs/runtime-node` owns the session, the pairing and the tools. The page does not run the logic, and no Rust copy of it exists.
3. **The screens are `apps/web`** in its mobile form factor, inside the Tauri webview. A desktop-specific web app is not built for this line.
4. **The shell starts one Node process per profile** and ships a single-file Node executable with the app. It does not rely on a Node installation and does not let an agent client start the process itself.
5. **A folder is an instance.** `--profile <folder>` holds the webview store, the Node storage, the logs, the settings and both sockets. Two folders are two independent instances; there are no named profiles.
6. **One MCP server, written in TypeScript.** It listens on `mcp.sock` inside the Node process. Tools for the harness and the mini apps go from there to the shell over `shell.sock`. The Rust `dou-mcp` binary shrinks to a pipe between stdio and `mcp.sock`.
7. **The permission gate lives where the tools run**, in `libs/agent-tools`, so a headless `dou-cli` enforces the same tier, room allow-list and rate limit as the app.

## Alternatives

- **Keep and finish the Rust engine (ADR-0382).** Two engines, vectors and scenarios to keep them equal, and a rewrite of every domain rule that changes in TS.
- **Run the logic in the page and mirror it to Node.** The agent would depend on a window that may be closed or hidden.
- **Use an installed Node, or let the agent client run `dou-cli` directly.** The user would need a toolchain, and each agent session would start its own session with the server.
- **Named profiles in a shared data directory.** Hides the state an instance owns and makes two copies of the same account harder to run side by side.
- **The shell hosts the MCP server, or the gate runs in the stdio pipe.** Tool logic would stay in Rust, and a headless `dou-cli` would have no gate.

## Consequences

- One engine serves web, mobile, Electron and desktop v2; a domain change in TS needs no Rust counterpart, and the contract vectors of ADR-0382 are no longer a gate for this line.
- The app carries a Node executable, and the shell must start, watch and stop it.
- ADR-0380 still holds for the separate app beside Electron; where it says the engine is Rust, ADR-0382 and this record replace that.
- The parked crates cost nothing in the build once the shell stops depending on them; deleting them is a separate decision.
