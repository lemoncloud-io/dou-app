# ADR-0232: The iOS shell tells the web where the device folds

> Status: Accepted · Decided: 2026-10-26
> · Scope: `apps/mobile/ios/Bridges/DisplayRegionModule.swift` · `apps/mobile/src/app/bridge/DisplayRegionBridge.ts` ·
> `apps/mobile/src/app/webview/{hooks/useDivision.ts,hooks/useFoldInjection.ts,utils/webViewGeometry.ts,utils/injectionScripts.ts}` ·
> `libs/ui-kit/src/components/ui/{dialog,alert-dialog}.tsx` · `libs/web-ui-kit/src/composites/navigation/FloatingTabBar.tsx`
> · The module docs are [apps/web/docs/shell/layout-shell.md](../../apps/web/docs/shell/layout-shell.md) § The device fold
> and [apps/mobile/docs/native/README.md](../../apps/mobile/docs/native/README.md)

## Context

iPhone Duo held half-open like a book has a fold down the middle of its inner display. Every
screen of the app is web content in one WKWebView, so whatever the page centres — a notice
dialog, the floating tab bar's pill — landed across that fold. Apple's Duo guidance asks apps to
keep content off the fold and, in the book pose, to put alerts on the trailing side.

The page cannot see the fold on its own: a probe found no viewport-segment support in WebKit on
the simulator, and the page has no other signal. iOS 27.1 reports the fold to native code as a
`.division` reserved region on a view (`UIView.reservedRegions(kind:)`), with no change
notification.

## Decision

1. **The native shell is the source, the page is told by attribute.** A window-sized observer view
   asks for the active division on every layout pass and a native module (`DisplayRegion`) sends
   only when the answer changes. The shell converts the rect into the WebView's coordinates and
   sets `data-fold="vertical"|"horizontal"` and `--fold-start` / `--fold-end` (px) on the page
   root, and removes all three when the region goes inactive. The value is also written into the
   boot script and replayed when a page finishes loading, because the first value often arrives
   while the page is still loading and a push into a loading page is lost.
2. **What sits in the middle moves to the trailing region on a vertical fold.** The `default`
   notice dialog and alert dialog centre in the region after the fold and narrow to fit it; the
   floating tab bar starts at `--fold-end`. Trailing, because that is where the system puts its own
   alerts in that pose, and the tab bar follows so related bottom controls stay together.
3. **A horizontal fold is left alone, and so is content that scrolls.** A short card a little above
   or below the middle reads fine, the pose is rare, and scrolling content passing over the fold is
   what the system's own apps do.
4. **A full-screen panel on the `default` dialog variant opts out** (`FOLD_STAYS_CENTRED`). The
   move is sized for a card; a column-wide panel moved by it runs off the trailing edge.

## Alternatives considered

- **Rely on scrolling alone.** Leaves centred cards and the pill on the fold, which is the case
  the guidance names.
- **CSS viewport segments.** The standard way for a page to see a fold, but WebKit did not expose
  it here; it can replace the native path once it does, with the same attribute contract.
- **Leading side for dialogs.** Contradicts where the system puts alerts in the book pose.

## Consequences

- Rules keyed on `[data-fold=vertical]` change nothing in a browser, on Android, on a flat display,
  or before iOS 27.1, because the attribute is absent there. Android foldables get no fold signal
  from this; they keep the flat layout.
- A new surface that is centred on the screen and should not straddle the fold has to opt in with
  the same attribute selector — nothing moves it automatically.
- A new full-screen panel built on the `default` dialog variant has to add `FOLD_STAYS_CENTRED`, or
  it runs off the trailing edge on a half-open device.
- The observer follows the app window, so a scene the system reconnects keeps reporting; that path
  cannot be triggered on the simulator and was checked by reading the code.
