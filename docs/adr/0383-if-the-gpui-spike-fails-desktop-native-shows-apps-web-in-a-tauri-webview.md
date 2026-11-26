# ADR-0383: If the GPUI spike fails, desktop native shows apps/web in a Tauri webview

> Status: Accepted · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

ADR-0381 puts the screens in GPUI behind a spike gate. A failed gate must not cost the engine and the MCP server, which are useful on their own and are built first (ADR-0382).

## Decision

If the spike fails any item of its gate, desktop native shows `apps/web` in a Tauri webview. The Rust engine and the local MCP server are unchanged: the webview talks to the engine through the same control interface the command line uses, and the web screens run against it in place of the TS engine, or keep the TS engine in the page for the first release.

## Alternatives

- **Retry with another native toolkit.** Restarts the verification with no better evidence than the first attempt.
- **Drop desktop native.** Loses the local MCP server, which does not need the screens.
- **Fall back to the Electron desktop alone.** Keeps one client but leaves the MCP server without a home that runs headless.

## Consequences

- The engine crates and the control interface stay free of any screen toolkit, so this fallback is a change of the top crate only.
- Which of the two engines the webview uses is decided when the fallback is taken, not now.
