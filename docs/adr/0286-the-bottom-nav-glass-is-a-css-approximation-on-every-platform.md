# ADR-0286: The bottom nav's glass is a CSS approximation, the same on every platform

> Status: Accepted · Decided: 2026-11-05
> Scope: `libs/web-ui-kit/src/composites/navigation/FloatingTabBar.tsx` ·
> `apps/web/src/app/ui/components/BottomNavigation.tsx`
> Supersedes in part: [ADR-0011](./0011-web-layout-shell-and-floating-bottom-nav.md) (the nav's
> shape — the 166×62 pill, icon-and-label tabs, dark active pill) and
> [ADR-0096](./0096-feedback-page-replaces-issue-report-floating-widget.md) §7 (the active fill,
> the inactive fade and the label tracking). Mounting the nav once in the shell is unchanged.

## Context

The redesigned bottom nav (Figma 5780:17209) draws its surface with Figma's GLASS effect: an 8px
frost plus refraction (0.22), depth (20), dispersion and a light source at 133°. That is Apple's
Liquid Glass look, and Figma renders it natively; the bar in the app is HTML inside a WebView.

Of the effect's parts, only the frost has a CSS equivalent everywhere. Refraction on the web means
an SVG displacement filter referenced from `backdrop-filter: url(#…)`:

- **Chromium** — Chrome, and the Android System WebView the Android app runs in — paints it.
- **WebKit** — Safari, every iOS browser, and the WKWebView the iOS app runs in — accepts only
  filter functions in `backdrop-filter` and ignores a `url()`.

So the iOS app cannot show refraction from HTML at all. The system's own Liquid Glass
(`UIGlassEffect`, iOS 26) is a native API.

## Decision

1. **The bar is one web component, drawn the same way on both platforms.** The frost is
   `backdrop-filter: blur(8px) saturate(1.8)` over the design's 58% white fill and 0.5px hairline.
2. **What the effect reads as at this size is approximated, not simulated:** a bright inner rim
   on the top-left edge the light falls on, a fainter rim opposite, and the design's own
   `0 4px 12px` shadow. Refraction, depth and dispersion are not drawn.
3. **The bar stays stateless in `libs/web-ui-kit`** (items, active state and `onSelect` from the
   host), so that a native bar could later replace it on one platform by swapping the adapter in
   `apps/web` without touching the kit.

## Alternatives

- **Add refraction on Android only.** Chromium can draw it, so the Android app would get closer to
  the design than iOS. Rejected: the same app would look different on the two phones, with no way
  to bring iOS level, and a displacement backdrop is resampled on every scrolled frame under a bar
  that is always floating over a scrolling list — a risk on low-end Android for a 0.22 refraction
  on a 62px bar.
- **A native bar laid over the WebView on iOS** (`UIGlassEffect` on 26+, a blur below it). The only
  route to the real Liquid Glass on iOS. Rejected for now because the bar would sit above the
  WebView as a whole, so every web overlay — bottom sheets, dialogs, the snackbar, the attach
  panel — would draw underneath it unless each one told the shell to hide the bar. It also needs a
  bridge contract for the tab set and selection, a web fallback for older shells, the bar's height
  injected for the scroll clearance and snackbar lift, and a second copy of the icons and
  accessibility labels on the native side. Android would gain nothing from it, since the system
  has no equivalent material there and blurring the WebView from a native view means capturing it
  every frame.
- **Keep the old bar's look** (20px blur, 70% fill, no rims). Simplest, but it is the design being
  replaced.

## Consequences

- iOS and Android show the same bar. Neither shows refraction, so the bar is a frosted pill with
  lit edges, not a lens; side by side with the Figma frame the content behind looks straight
  rather than bent at the rim.
- Changing the look is a CSS change in one component. Moving iOS to a native bar remains open, and
  the web overlays' z-order is the problem that move has to solve first.
