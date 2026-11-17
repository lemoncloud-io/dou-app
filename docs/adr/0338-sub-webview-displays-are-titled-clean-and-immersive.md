# ADR-0338: Sub WebView displays are titled, clean and immersive, and immersive draws under the system bars

> Status: Accepted · Decided: 2026-11-17 · Implemented: `feat/sub-webview-edge-to-edge-display`
> · Scope: `apps/mobile/src/app/services/subWebView/subWebViewManifest.ts`, `features/subWebView/`,
> `subWebView/` (`SubWebView.tsx`, `subWebViewInsetScript.ts`) · `apps/desktop` (manifest read)
> · `libs/shared` (`subWebViewDisplayOf`) · `libs/bridge-messages` (`SubWebViewDisplay`)
> · `libs/bridges` (`BRIDGE_VERSION` 2.29.0) · `libs/chatic-apps-sdk` (guide and README)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md)
> (the manifest and its first two displays), [ADR-0290](./0290-a-sub-webview-page-has-no-title-bar-unless-its-manifest-asks-for-one.md)
> (the barless display as the default)

## Context

The sub WebView screen pads its view by the safe-area insets on every edge, on every display, and
fills the padding with the app's theme background: white in light theme, near-black in dark. A page
therefore never has to think about the notch, the status bar or the home indicator — the reason the
padding was put there.

A page that draws its own full-screen scenery pays for that. A game with a sky that runs to the top of
its canvas and a floating tab bar at the bottom shows, in light theme, a white band above the sky and
another under the tab bar: the app's padding, not the page. The page cannot reach that strip. Nothing
in the protocol lets it colour the padding or remove it, and the page side has already done what it
can — painting its own background to the edge of its viewport changes nothing outside the viewport.
The protocol said so outright: "a full-bleed mode is not part of this protocol".

Adding a third display also exposed the names of the first two. `standard` says nothing about what
the user sees, and `fullscreen` was never the full screen: it is the page inside the safe area without
the bar. A third display that really does fill the screen could not be named next to them without
confusing the two. The names are read by page authors, most of whom are not mobile developers, and the
platform's own terms (Android's "edge-to-edge") mean nothing to them.

## Decision

**The displays are named by what the user sees — `titled`, `clean` and `immersive` — and `immersive`,
the new one, has no bar and no safe-area padding on any edge.**

1. **`titled`** is what `standard` was: the shell's bar above the page, with its title and a close
   control. **`clean`** is what `fullscreen` was, and stays the phone's default: the page alone under a
   floating close control, inside the safe area. **`immersive`** is `clean` drawn to the screen's
   edges: the page runs under the status bar, the home indicator and, in landscape, the notch. The
   system bars stay visible; `immersive` here is the page's word for a full-screen scene, not Android's
   immersive mode, which hides the bars, and the docs say so where the name is introduced.
2. **The earlier names are still read.** `standard` means `titled` and `fullscreen` means `clean`, in
   one function both shells call (`subWebViewDisplayOf` in `libs/shared`), so a page deployed with an
   earlier name keeps its look and the phone and the desktop cannot read a name differently. The guides
   show only the new names.
3. **The floating close control on an `immersive` page stays exactly where `clean` puts it**,
   `insets.top + 8` from the top and `insets.right + 8` from the right: below the status bar and clear
   of a landscape notch. It still cannot be removed; that rule from ADR-0290 does not change.
4. **The page is told where the system bars reach, two ways.** `env(safe-area-inset-*)` reports it where
   the WebView supports it, and the shell also sets `--chatic-safe-area-inset-top`, `-right`, `-bottom`
   and `-left` on the page's `<html>` (in `px`) before the page's scripts — on Android, as soon as the
   document has a root element — again at load end, and again whenever the insets change. A page reads
   `var(--chatic-safe-area-inset-top, env(safe-area-inset-top, 0px))`, and its viewport meta must say
   `viewport-fit=cover`: without it WebKit keeps the layout out of a landscape notch by itself, and a
   page that also pads by the properties would pad that side twice. The properties are set only for
   `immersive`; on the other displays the view lies inside the safe area and there is nothing to report.
5. **`env()` alone is not enough, which is why the properties exist.** On iOS, WKWebView reports the
   safe area to `env()` only while its scroll view leaves the content alone
   (`contentInsetAdjustmentBehavior` `never`, which react-native-webview defaults to and the view now
   pins) and only to a page whose viewport says `viewport-fit=cover`. On Android the WebView forwards the
   system bars to `env()` from Chromium M136, and then only for a WebView that fills the screen; M144
   drops that condition. An older WebView, or a view hierarchy that consumes the window insets before
   the WebView sees them, leaves `env()` at 0, and the page's controls would sit under the status bar.
   The main WebView has always been told its insets as custom properties for the same reason.
6. **`titled` and `clean` behave exactly as `standard` and `fullscreen` did.** Same padding, same bar,
   same close control, and their pages are told nothing new.
7. **The desktop shows `immersive` as `clean`.** A window has no system bars to draw under.
8. **`BRIDGE_VERSION` goes to 2.29.0.** The handshake does not report the display, as it did not report
   the default change in ADR-0290; the version dates the change in the protocol document.

## Alternatives

- **A manifest colour for the padding** (`"safeAreaColor": "#8ED1FF"`, say). Rejected. It fixes one
  flat colour, and the page's own edge is rarely flat: a sky is a gradient, a scene scrolls, the colour
  under the tab bar differs from the one at the top, and light and dark themes would need a colour each
  — a second field, or a pair. It would also be read once, before the page loads, so a page that
  changes its scene could not follow it. Every page that wants full-bleed scenery would still show a
  seam where its own background meets the strip. Drawing under the bars removes the seam rather than
  painting it, and keeps the shell out of the page's appearance altogether.
- **Let the page set the padding colour at run time** through a bridge request. Rejected for the same
  reason as the manifest colour — one colour against an arbitrary edge — plus a frame or two of the
  theme colour before the request lands.
- **Make every barless page draw under the bars.** Rejected: every page written so far relies on the
  padding, as the protocol promised, and would lose its header under the status bar on the next app
  release. Drawing under the bars is something a page opts into because it is ready for it.
- **`env()` only, no custom properties.** Rejected for the reasons in decision 5: it would make the
  display depend on the WebView version and on how the view hierarchy passes insets down, neither of
  which the page can see or the shell can fully control.
- **Keep `standard` and `fullscreen`, and name only the new display.** Rejected. Platform terms for the
  new one (`edgeToEdge`) read as developer jargon to page authors, and any plain name for it sits badly
  next to a `fullscreen` that is not the full screen. Renaming costs little while the feature is new:
  the earlier names stay readable, so nothing deployed changes.
- **Reuse `fullscreen` for the new display.** Rejected: pages deployed with `fullscreen` would start
  drawing under the status bar the day the app updated, without their authors changing anything.
- **Other name sets** — `bar` / `plain` / `full`, `withBar` / `noBar` / `fullBleed`. Rejected: `plain`
  and `full` do not say how they differ, and "bleed" is print vocabulary only designers know.

## Consequences

- **This needs an app release.** A phone app from before it knows only `standard` and `fullscreen`, and
  shows any of the new names with its default — no bar, padded. For `immersive` that is harmless: the
  page's insets read 0 there and the shell's padding does the job, so a page can switch as soon as it
  pads its own controls. For `titled` it is not: an older app drops the bar. A page that needs the bar
  keeps saying `standard` until its users have updated. An older desktop shows any new name with the
  bar, its own default.
- **Two names mean each of the first two displays** for as long as earlier manifests are around. Only
  the reader in `libs/shared` knows both; nothing else in either shell sees an earlier name.
- **The page owns the safe area once it asks for `immersive`.** Its header, controls and anything
  tappable stay clear of the reported insets; its scenery runs under them. The top-right corner is
  still the close control's.
- **The status bar's icons stay the app's.** Their colour follows the app's theme, not the page's
  scenery, and the page has no way to change it. A light page under dark-theme icons, or the reverse,
  is the page author's to design around.
- **Not checked on a device:** that `env(safe-area-inset-*)` reads the bars' reach in an `immersive` view
  on iOS (with `viewport-fit=cover`) and on Android (WebView M136 and later); that the custom properties
  land before the page's first paint on Android; that a focused input near the bottom stays above the
  keyboard when the view is not padded on Android; and how the close control reads over a page's own
  scenery in both themes.
