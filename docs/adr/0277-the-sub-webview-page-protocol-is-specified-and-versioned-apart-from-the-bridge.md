# ADR-0277: The sub WebView page protocol is specified, and versioned apart from the bridge

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/sub-webview-protocol`
> · Scope: `libs/bridge-messages` (`model/sub-webview.ts`, `model/system.ts`, `SubWebViewRequestType`)
> · `libs/bridges` (`AppBridgeHost`, `BRIDGE_VERSION` 2.15.0) · `apps/mobile/src/app/subWebView/`,
> `features/subWebView/`, `services/subWebView/subWebViewData.ts`
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> which gave the page its bridge; [ADR-0271](./0271-a-sub-webview-page-gets-a-key-per-origin-derived-from-the-device-id.md),
> its key

## Context

Sub WebView pages are written outside this repository, and the aim is that people other than the
app's own developers write them, often with an AI assistant producing most of the code. What a page
had to go on was one section of the shell's module doc and the shell's source. The two pages that
exist each carried a hand-written copy of the same bridge client, and within two copies they had
drifted: one lacked `OpenShareSheet`, and one said the app checks the envelope's `version`, which it
does not.

The conversation itself had gaps a page author could not see from the doc:

- Three version values travel (the context's `protocolVersion`, the shared `BRIDGE_VERSION` in the
  envelope, the handshake's `appVersion`, which is the bridge version under another name), and
  nothing said which one decides anything. `protocolVersion` stayed 1 through four additions.
- A refusal comes in two shapes: `type: 'ERROR'` from the host, `type: 'On<Request>'` from a handler.
  The error codes were scattered over the handlers with no list.
- Some messages are never answered (another origin, unparseable), and on Android no reply reaches
  the page while the app is in the background. Nothing told a page to time out, or not to.
- On Android `window.ChaticSubWebView` can be defined after the page's first script, and there was no
  moment a page could rely on to read it.
- A page could not take Android back for its own dialogs, could not stop the user's close to save
  something first, and in landscape a notch could cover its side, since the screen padded only top
  and bottom.

## Decision

**The page side of the sub WebView is a protocol with its own specification, its own major
version, and rules for changing it.** The specification lives beside the shell that implements it
(`sub-webview-protocol.md`), in MUST/SHOULD terms; pages are expected to reach it through a
library, `chatic-apps-sdk`, which may hide it from authors but not disagree with it.

- **Capability comes from the handshake alone.** A page decides what to send from
  `supportedWebMessages`. `protocolVersion` is a major version that changes only on a breaking
  change; `BRIDGE_VERSION` dates a change and decides nothing at run time.
- **Additive within a major.** Requests, pushes, fields and error codes may be added; nothing is
  removed, renamed or given a new meaning without a new `protocolVersion`. A page ignores what it does
  not know.
- **A page reads only `refId`, `success` and `error.code`.** The two refusal shapes stay as they are
  and the specification states them; the codes a page can meet are one union,
  `SubWebViewPageErrorCode`, and a code is never renamed (`INVALID_KIND` stays beside `INVALID`).
- **Timeouts are the page's, and they pause while the page is hidden**; a request that waits on the
  user (`OpenShareSheet`) gets none.
- **The handshake reply carries the context** as `subWebView`, so a page has a known moment to read
  it.
- **A message over 64 KiB is refused** with `TOO_LARGE`, by the host, before any handler parses it.
- **A page may claim Android back** with the main web's own `SetCanGoBack`, and receives
  `OnBackPressed`; the order is the page's claim, then the view's history, then closing.
- **A page may guard the user's close** with `SetSubWebViewCloseGuard`: the close is pushed to it
  as `OnSubWebViewCloseRequested`, and it closes with `FinishSubWebView` or stays. A second close
  within three seconds closes anyway. Only the user's close is guarded.
- **The view is padded by the safe area on every edge**, so a page needs no insets (expected to read
  as 0; not yet checked on a device).
- **No background push.** A page uses `visibilitychange` (measured on Android; not yet on iOS).
- **No value that maps one to one to the device id ever reaches a page.** The device id is treated
  as a credential, not only as an identifier: DoU's own sign-in relies on it.

Every claim and guard belongs to one page load and is gone at the next; a page sets its claims again
after its handshake and on every `pageshow`, since it cannot always tell that a load started (a
back-forward cache restore, a navigation that turned into a download).

## Alternatives

- **Leave the module doc's wire-format section as the contract.** Rejected: it described what the
  shell did, not what a page must do, and the drift between two hand-written clients is what that
  produced.
- **Make the two refusal shapes one.** Rejected for now: `ERROR` comes from `AppBridgeHost`, which
  the main web shares, and its extra fields are what the main web's logs read. A rule that a page
  reads only `success` and `error.code` gives pages one shape without touching the main web.
- **Bump `protocolVersion` with every addition.** Rejected: a page would have to map versions to
  features, which the handshake already lists exactly, and an older page would refuse a newer app for
  no reason.
- **A background push (`OnBackgroundStatusChanged`) in the subset.** Rejected: on Android the shell
  delivers nothing to a page while the app is in the background, so the "going to background" push
  would arrive only once the user had come back. `visibilitychange` fires inside the page.
- **A notice before every close.** Rejected: the view unmounts as soon as it is closed, so a notice
  for a `host` or `system` close would not reliably arrive. Guarding only the user's close, and
  waiting for the page there, is what can be kept.
- **A close guard that waits for the page without limit, or that any second press overrides.** The
  first lets a hung page trap the user. The second makes a page's own "leave?" prompt useless if the
  user taps the bar again while reading it. Three seconds separates a deliberate double press from a
  second thought.
- **A message of the page's own for Android back.** Rejected: `SetCanGoBack` and `OnBackPressed`
  already mean exactly this for the main web, and the subset rule (ADR-0265) is to reuse the
  vocabulary where the meaning is the same.
- **Hand pages the insets and let them draw edge to edge.** Deferred: every page would then have to
  handle them, which is what an author is most likely to get wrong. A full-bleed mode can be added
  for a page that needs it.

## Consequences

- One request (`SetSubWebViewCloseGuard`) and one push (`OnSubWebViewCloseRequested`) join the
  vocabulary, and `SetCanGoBack` joins the subset; `BRIDGE_VERSION` is 2.15.0. The main shell and the
  desktop leave the new request unanswered and never send the new push.
- `AppBridgeHost` gained two options only the sub WebView's host uses: a context for the handshake,
  and a message size limit. The main web's messages stay unlimited.
- The external name of the page platform is "Chatic Apps", and the library `chatic-apps-sdk`; inside
  the app and its messages the term stays "sub WebView" (ADR-0265).
- `visibilitychange` on iOS, insets reading 0 in the padded view, and the Android keyboard in it have
  not been watched on a device; the specification says so.
