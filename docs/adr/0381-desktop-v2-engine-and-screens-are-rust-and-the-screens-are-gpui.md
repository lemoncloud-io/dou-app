# ADR-0381: Desktop v2 engine and screens are Rust, and the screens are GPUI

> Status: Accepted · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

Desktop v2 must run its engine without a window so a local MCP client can use the account, and it must show all the mobile screens in one set, as one column on a narrow window and as a list beside a room on a wide one. An engine written once in Rust runs headless and in the window from the same code.

## Decision

The engine and the screens are Rust. The screens are drawn natively with GPUI, in the same process as the engine. The engine is usable without the screens (a command line and the local MCP server run it alone), and the screens are added once a spike passes the gate in the handover: Korean input composition, a long message list, text selection, screen readers, and a Windows build.

## Alternatives

- **Tauri showing `apps/web`.** Reuses all screens and the TS engine, but the engine stays in a web page and the native app adds nothing the Electron desktop does not have. It is kept as the fallback if the spike fails (ADR-0383).
- **Electron with a Rust sidecar.** Keeps the screens in a web view and moves only the engine; the process split and the second renderer remain.
- **A cross-platform UI toolkit in another language.** Gives up the single-language engine and screens for a toolkit with no better evidence on Windows text input.

## Consequences

- The screens are a rewrite of the web screens (a table maps every page to its screen; a check fails on a page that is missing from it).
- GPUI is young: its Windows stability and accessibility are verified by the spike, not assumed.
- The engine's crates must not depend on the screen crates, so the headless path stays alive whatever happens to the screens.
