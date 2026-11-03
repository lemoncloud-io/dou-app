# ADR-0278: A sub WebView page declares what it reaches in a manifest on its own origin

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/sub-webview-manifest`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts`, `model/haptic.ts`, `SubWebViewRequestType`) ·
> `libs/bridges` (`BRIDGE_VERSION` 2.16.0) · `apps/mobile/src/app/services/subWebView/subWebViewManifest.ts`,
> `subWebView/`, `features/subWebView/`, `bridge/hapticKinds.ts`, the native `Haptic` modules
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> which made content review the safeguard; [ADR-0277](./0277-the-sub-webview-page-protocol-is-specified-and-versioned-apart-from-the-bridge.md),
> the protocol this extends

## Context

ADR-0265 gave every sub WebView page the same subset and left the safeguard to review: only reviewed
pages are deployed to the allowlisted domains. That held while the app's own team wrote the two
pages that exist. The aim now is pages written by people outside the team, and then every page can
copy to the clipboard, open the browser, share and get a stable user key whether it uses them or not,
and a reviewer has to read a page's code to find out which it does.

Three smaller gaps came up alongside: a page that breaks on users' devices leaves no trace anyone can
see (`SendLog` is not in the subset); a game wants the screen to itself and a fixed orientation,
which only the shell can give; and the haptics stop at a tick and a tap, with nothing for an outcome.

## Decision

**A page declares what it needs in `/.well-known/chatic-app.json` on its own origin; the shell reads
it before loading the page, and without it the page gets the base set only.**

- **The author asks, an administrator grants.** Authors build with `chatic-apps-sdk` and submit a
  bundle whose manifest lists the permissions they want. An administrator approves them at review,
  and only the approved manifest is deployed; since nothing but the review deploys to the
  allowlisted origins, the file there is the grant, and the shell needs no other record of it.

- **Permissions name capabilities, not messages**: `clipboard`, `share`, `openUrl`, `userKey`, one
  request each. The base set — the handshake, `Ping`, finish, title, haptics, back, the close guard
  and the new error report — reaches nothing outside the view and needs no declaration.
- **An undeclared request is not registered.** The handshake does not list it and the host answers
  it `NOT_FOUND`, so a page tells a missing permission from an older app the same way it already
  must, from `supportedWebMessages`.
- **Strict by default.** No manifest, or one the shell cannot read (a redirect off the origin, not
  version 1, over 16 KiB, no answer in 3 seconds), means the base set and the standard display. Inside
  a readable manifest, each field is read on its own and a wrong value is dropped, not the manifest.
- **Read before the page loads**, so its display, orientation and bridge are settled before the
  page's first script; the screen shows a close control alone meanwhile. Kept per origin in memory
  for the run of the app and refreshed behind each later open.
- **`display: fullscreen`** drops the bar and keeps a floating close control; the safe-area padding
  stays. **`orientation`** holds the view `portrait` or `landscape`.
- **`ReportSubWebViewError`** writes a page's error to the app's own log under its origin, cut to
  1,000 and 4,000 characters and limited to 20 per page load.
- **`TriggerHaptic` takes `success`, `warning` and `error`**, for both WebViews, played by the native
  modules as the system's outcome feedback.

## Alternatives

- **Keep one subset for every page.** Rejected: review would have to establish from the code what a
  page reaches, page by page and deploy by deploy, and a page would hold every capability whether it
  needed it or not.
- **Default to the full subset when there is no manifest.** Rejected: the pages that most need the
  limit — a quick one, written outside the team — are the ones most likely to ship without a
  manifest. The two existing pages gain a manifest instead.
- **A central registry of pages and their permissions.** Deferred, as ADR-0265 left it: it needs a
  server and a way to keep its copy and the deployed page in step. A file on the page's own origin
  is deployed and reviewed with the page, and nothing can drift between them.
- **Permissions named after messages.** Rejected: an author thinks in what the page does, and a
  capability can later cover a renamed or additional message without every manifest changing.
- **Fetch the manifest alongside the page.** Rejected: the bridge, display and orientation would be
  settled after the page's first script had run, and a fullscreen page would flash the bar.
- **Keep manifests across launches.** Rejected: a permission withdrawn by a deploy would linger for
  as long as the copy did; one fetch per origin per launch is cheap from a CDN.
- **Hide the close control in fullscreen.** Rejected: iOS has no back button, so a page that hangs
  would leave the user only the app switcher.
- **Let pages forward their logs (`SendLog`).** Rejected: it is the main web's channel, unbounded and
  shaped for it. A narrow error report, counted and cut, is what finding a broken page needs.

## Consequences

- One request joins the vocabulary (`ReportSubWebViewError`) and `BRIDGE_VERSION` is 2.16.0. Neither
  main shell answers it.
- **The two existing pages need a manifest before this ships**, or they lose `share` and `userKey`
  and the raising game falls back to its own anonymous sign-in.
- The native `Haptic` modules change, so the outcome haptics need an app release; until then an app
  answers them `INVALID_KIND`.
- A page's first open in a run waits for one small fetch before it loads.
- That the orientation option holds a full-screen modal, and how the outcome haptics feel, have not
  been checked on a device.
