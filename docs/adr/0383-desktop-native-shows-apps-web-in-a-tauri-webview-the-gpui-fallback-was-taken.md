# ADR-0383: Desktop native shows apps/web in a Tauri webview; the GPUI fallback was taken

> Status: Accepted · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

The first plan put the screens in GPUI behind a spike gate and kept this fallback in reserve so that a failed gate would not cost the engine and the MCP server, which are useful on their own and are built first (ADR-0382). The spike failed the screen-reader and text-selection items (ADR-0381), and the fallback is now the plan.

## Decision

Desktop native shows `apps/web` in a Tauri webview. The Rust engine and the local MCP server are unchanged: the webview talks to the engine through the same control interface the command line uses, and the web screens run against it in place of the TS engine, or keep the TS engine in the page for the first release.

## Alternatives

- **Retry with another native toolkit.** Restarts the verification with no better evidence than the first attempt.
- **Drop desktop native.** Loses the local MCP server, which does not need the screens.
- **Fall back to the Electron desktop alone.** Keeps one client but leaves the MCP server without a home that runs headless.

## Consequences

- The engine crates and the control interface stay free of any screen toolkit, so the webview is a change of the top crate only.
- Which of the two engines the webview uses is decided when the webview is built, not now.
- The permission tier and the allow-list are changed on an app screen once it exists; until then only by the local command line or the settings file, never through MCP or the control interface.
