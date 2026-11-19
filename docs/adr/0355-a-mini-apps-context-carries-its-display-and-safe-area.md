# ADR-0355: A mini app's context carries its display and safe area, pushed once the insets settle

> Status: Accepted · Decided: 2026-11-19 · Implemented: `feat/sub-webview-display-context`
> · Scope: `libs/bridge-messages` (`SubWebViewContext.display`, `.safeArea`, `SubWebViewSafeArea`,
> `OnSubWebViewContextChangedPayload`) · `libs/bridges` (`BRIDGE_VERSION` 2.30.0) ·
> `apps/mobile/src/app/subWebView/` (`SubWebView.tsx`, `subWebViewInsetScript.ts`) ·
> `apps/mobile/src/app/features/subWebView/SubWebViewScreen.tsx` (hands the view its display) ·
> `libs/chatic-apps-sdk` (`SDK_BRIDGE_VERSION`, the two context fields)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md#layout)
> · Related: [ADR-0338](./0338-sub-webview-displays-are-titled-clean-and-immersive.md)
> (the `immersive` display and its CSS properties)

## Context

A mini app chooses its display in its manifest, and an `immersive` one draws under the system bars and
keeps its controls clear with the `--chatic-safe-area-inset-*` CSS properties the shell sets on
`<html>`. Two things were missing for a page:

- **It could not ask which display it got.** The manifest says what it asked for, but an app released
  before `immersive` shows that name as `clean`, and the desktop shows everything with the bar. A page
  guessed from whether the CSS properties appeared.
- **It could read the insets only through CSS.** A page that lays out in script — a game drawing on a
  canvas — had to read computed styles, and learned of a rotation only by polling them or by a resize.
  On Android the first injection of the properties can also trail the page's first paint.

## Decision

1. **The context carries `display` and `safeArea`.** `display` is the display the shell actually shows
   the page in. `safeArea` is `{ top, right, bottom, left }` in CSS px: for `immersive` the very values
   the CSS properties carry, computed by one function (`subWebViewSafeAreaOf`) so the two cannot
   disagree; for a padded display 0 on every edge, since the shell keeps the page clear of the bars.
   Both are in the global and in the handshake reply, which reports them as they are when the page
   asks.
2. **The values are ready before the first paint.** They come from the app's own safe-area measurement,
   which the screen has from the window's initial metrics before the view mounts, so the context never
   answers 0 for an `immersive` page and corrects it later.
3. **A change is pushed once the insets settle.** `OnSubWebViewContextChanged` gains `safeArea` and keeps
   carrying the whole of what can change — `theme` and `locale` too — so an SDK that reads only those
   two reads them as before. A theme or language change is pushed at once; a safe-area change only after
   the insets have stayed put for 200 ms, since a rotation moves them several times on its way. Insets
   that come back to what was last pushed are no change. The CSS properties keep following every step.
4. **Adding is not breaking.** Two optional context fields and one push field leave `protocolVersion`
   at 1; `BRIDGE_VERSION` goes to 2.30.0 to date the change, and the SDK's constant and context type
   follow in the same change. A page detects the feature by the field's presence — it is not a request,
   so the handshake does not list it — and falls back to the CSS properties, then `env()`.

## Alternatives

- **A request for the insets** (`GetSubWebViewSafeArea`). Discoverable through the handshake, but a
  page would still need a push for a rotation, and the context already is the place for state the page
  starts with and hears changes of.
- **Push every inset change at once.** Exact, but a rotation would wake the page several times with
  values it then throws away; a canvas page relaying out on each is the cost. 200 ms is shorter than a
  rotation's own animation, so a page is told roughly when the animation ends.
- **Push only the changed field.** Smaller, and the SDK merges a push into its context copy, so it
  would cope. But a page that speaks the protocol without the SDK has always been able to read the push
  as the whole of what changes, `theme` and `locale` included; one that does would lose them.
- **Answer the handshake only after measuring.** Not needed: the measurement exists before the view.

## Consequences

- A canvas page reads its insets from `context.safeArea` and `onContextChange`, with no CSS reads.
- The desktop shell sets neither field; a page there falls back as on an older app. Setting `display`
  there is left to a desktop change.
- The SDK's typed accessors, the mock's two fields and the author documents are the SDK's own
  follow-up; this change carries its version constant, the mock's version, the compatibility row and
  the context type the app's type is held equal to.
- An app release is needed before any user sees the fields.
