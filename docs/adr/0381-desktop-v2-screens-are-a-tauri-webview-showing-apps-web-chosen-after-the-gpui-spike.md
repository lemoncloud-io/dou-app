# ADR-0381: Desktop v2 screens are a Tauri webview showing apps/web, chosen after the GPUI spike

> Status: Accepted · Decided: 2026-11-26 · Implemented: `feat/desktop-native-engine` (the headless engine and local MCP)
> · Scope: `apps/desktop-native/`

## Context

Desktop v2 must run its engine without a window so a local MCP client can use the account, and it must show all the mobile screens in one set, as one column on a narrow window and as a list beside a room on a wide one. The first plan drew the screens natively with GPUI in the engine's process and gated that choice on a spike: Korean input composition, a long message list, text selection, screen readers, and a Windows build.

The spike built a GPUI window on macOS and Windows (both green in CI) and found:

- **Accessibility.** GPUI 0.2.2 has no accessibility tree: no accesskit, NSAccessibility or UI Automation in its source or dependencies. VoiceOver and Narrator would very likely read nothing, which fails the screen-reader requirement. This is from the source, not from a person using a screen reader.
- **Text selection.** There is no selectable static text element, so selecting and copying message text would be built by hand on every screen.
- **Emoji on Windows.** The Korean flag rendered as the letters "KR" (a Windows font limit), and family emoji sequences split into pieces.
- **Not proven.** Korean IME composition on both systems, selection and copy inside the composer, trackpad scroll feel, memory use, and real chat data.
- **Toolchain.** GPUI needs the Xcode Metal toolchain (about 840 MB) on macOS, and the published crate lags the upstream repository.
- **Performance was not the problem.** A 10,000-row list was traversed in 225 ms (local macOS release build), 999 ms (CI macOS) and 634 ms (CI Windows), with only 300 to 740 rows rendered.

## Decision

The engine is Rust and runs headless. The screens are a Tauri webview that shows `apps/web`. The command line and the local MCP server run the engine alone; the webview is added on top and reaches the engine through the same control interface (ADR-0383).

## Alternatives

- **GPUI screens in the engine's process.** The original choice. Rejected by the spike: no accessibility tree, no text selection, and an unproven input method, with a rewrite of every web screen on top.
- **Electron with a Rust sidecar.** Keeps the screens in a web view and moves only the engine; the process split and the second renderer remain, and a webview needs no bundled browser.
- **A cross-platform UI toolkit in another language.** Gives up the single-language engine for a toolkit with no better evidence on Windows text input.

## Consequences

- No screen rewrite: the web screens, their accessibility and text selection come with the webview.
- The engine's crates must not depend on any screen toolkit, so the headless path stays alive whatever happens to the screens.
- Push notifications (FCM) still need a receive test on real credentials; the listener crate builds on both systems but needs `protoc` and OpenSSL, which on Windows come from vcpkg.
