# ADR-0290: A sub WebView page has no title bar unless its manifest asks for one

> Status: Accepted · Decided: 2026-11-05 · Implemented: `feat/sub-webview-no-title-bar`
> · Scope: `apps/mobile/src/app/services/subWebView/subWebViewManifest.ts`, `features/subWebView/`
> · `libs/bridge-messages` (`SubWebViewDisplay`) · `libs/chatic-apps-sdk` (guide and README)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> which made `standard` the default display and added `fullscreen`

## Context

ADR-0278 gave a page two displays: `standard`, the shell's bar with the page's title and a close
control, and `fullscreen`, a floating close control alone. A page with no manifest, or one that says
nothing about display, got `standard`.

The bar costs the top 48 points of every page, shows a title most pages already draw themselves, and
makes a page look like a document inside the app rather than an app. Pages written outside the team
come with their own header. What the bar gave that the page cannot give itself is small: a way out,
which the floating close control also gives.

## Decision

**`display` defaults to `fullscreen`: a page has no bar unless its manifest sets `"display": "standard"`.**

- A page with no manifest, an unreadable one, or one that leaves `display` out opens under the floating
  close control alone. A manifest value that is not one of the two is dropped, as every wrong value is,
  and the page gets the new default.
- **The close control stays, always.** It is what stops a page from leaving the user nowhere to go, so
  the new default cannot remove it.
- **`standard` is kept**, for a page that wants the app's bar. Nothing about the manifest, the bridge or
  `SetSubWebViewTitle` changes: a title the page sets is shown when the bar is, and ignored otherwise.
- **A page with screens of its own draws its own back control.** There is no bar to put one in, and none
  was ever there: the bar had a close control, not a back arrow. The SDK guide gives the pattern — a
  stack of screens, `apps.onBack` while it holds more than one, a back button in the page's header — and
  the rules for an AI assistant say so.

## Alternatives

- **Keep `standard` as the default.** Rejected: the bar is the thing most pages hide, and a default
  every page has to undo is the wrong default.
- **Remove `standard`.** Rejected: a manifest that says `standard` would become invalid for no reason,
  and a page that does want the app's bar would have no way to ask.
- **Put a back arrow in the bar.** Rejected: it would answer only the pages that keep their screens in
  the web history, and would give the shell a say in the page's navigation that it has never had.
- **Hide the close control as well.** Rejected: iOS has no back key, so a page that hangs would leave
  only the app switcher.

## Consequences

- **This needs an app release**, since the default is the app's. An app released before it shows the bar
  when the manifest says nothing. A page that needs the bar, or needs none, sets `display` explicitly
  instead of relying on the default.
- **A page's look changes with the app version** for any page that has no `display` in its manifest: the
  existing pages lose their bar once the app updates. They draw their own header, or set
  `"display": "standard"`.
- **A title the page sets, and the manifest's `name`, are invisible by default.** They show when the
  bar does.
- The top-right corner belongs to the close control on every page now, not only `fullscreen` ones; a page
  keeps it clear.
- Not checked on a device: how pages look under the floating control alone, and the back pattern on iOS
  and Android.
