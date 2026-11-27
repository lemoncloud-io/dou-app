# ADR-0380: Desktop v2 is a native app that sits beside the Electron desktop

> Status: Accepted · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

The Electron desktop (`apps/desktop` loading `apps/desktop-web`) is the shipped desktop client. A native desktop app that shows the mobile screens and exposes the account to local MCP clients is a large change whose outcome is not yet proven: the screen toolkit is unverified on Windows, Korean text input and accessibility, and the client is a rewrite of the web screens and the engine.

## Decision

Desktop v2 is a separate app in `apps/desktop-native/`. It does not change `apps/desktop` or `apps/desktop-web`, shares no build with them and ships under its own name. Whether it replaces the Electron desktop is decided later, after it has screens, and is not part of this decision.

## Alternatives

- **Replace the Electron desktop now.** Users would depend on an unproven client and the working one would be gone.
- **Grow the native app inside `apps/desktop`.** One package would carry two shells and two release processes, and a failure of the native work would block Electron releases.
- **Do nothing and add MCP to the Electron app.** The Electron shell has no engine of its own: the engine runs in the web page, which a local MCP client cannot reach while the window is closed or hidden.

## Consequences

- Two desktop clients exist for a while; fixes to account behaviour land in both engines (see ADR-0382).
- The native app has its own CI workflow and its own Nx project, so a Rust failure never blocks a web or Electron change.
