# ADR-0384: The Tauri shell loads the deployed web and answers the bridge from Rust

> Status: Accepted, amended by ADR-0387 (the engine and the local MCP server run in the TS runtime in Node, not in Rust) · Decided: 2026-11-26 · Scope: `apps/desktop-tauri/`

## Context

ADR-0383 settled that the desktop native line shows `apps/web` in a Tauri webview. `apps/web` is host-declared: in a plain browser it is a tab session with device pairing only, and it becomes a device session when the host sets `window.ChaticMessageHandler.postMessage` and the `CHATIC_APP_*` globals (`libs/bridges/src/host/hostProfile.ts`). The Electron shell does this in its preload and answers the requests with the TypeScript `AppBridgeHost` in its main process. A Tauri shell has no node main process, so that host cannot run there.

## Decision

- The shell loads the deployed web (the build bakes the address per channel), as ADR-0001 and ADR-0003 do for Electron. No `apps/web` change is needed: the shell injects the globals the web already reads.
- The bridge envelope (`WebAppReady`, `Ping`, `NOT_FOUND`, error shape, event buffering) is implemented in Rust. A check script compares the set of handled requests with the Electron handler list and fails when they differ by anything other than the two documented additions (`OAuthLogin`, `OpenURL`).
- The remote page reaches Rust through two app commands only, scoped to the web origin by a capability. No plugin command is reachable from the page.
- Social sign-in reuses the desktop-web hand-off page and the existing `chatic` / `chatic-dev` deep-link scheme (ADR-0009, ADR-0178). Electron and Tauri therefore cannot both own the scheme on one machine; the one registered last receives the link. Accepted for internal testing.
- Updates use the Tauri updater with its own signing key pair, which does not depend on Apple or Windows code signing, so ADR-0003's unsigned distribution still holds.
- The engine and the local MCP server run inside this app (the Rust engine of ADR-0382 is superseded by ADR-0387) and are controlled from a native window of the app, not from the page.

## Alternatives

- **Bundle the web build into the shell.** Needs a shell release for every web change.
- **Run the TypeScript bridge host in the page.** Puts the host inside the untrusted page.
- **A dedicated URL scheme and hand-off page for Tauri.** Needs a change in `desktop-web` and a relay redirect that is not verified; kept for when the Electron shell is retired.
- **Loopback listener for the sign-in return.** The relay's redirect allow-list is unknown, and ADR-0178 records the loopback route as refused without a client secret.

## Consequences

- Web changes deploy to the Tauri shell without a shell release.
- The bridge contract has two implementations (TypeScript and Rust); the check script is what keeps them equal.
- A page that is not the configured web origin gets no bridge access.
