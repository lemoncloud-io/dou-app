# ADR-0265: A page on another origin opens in a sub WebView with a bridge of its own

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/sub-webview` (the view),
> `feat/sub-webview-bridge` (the page's bridge)
> · Scope: `libs/app-messages` (`model/sub-webview.ts`) · `libs/bridges` (`BRIDGE_VERSION` 2.10.0, then 2.11.0) ·
> `apps/mobile/src/app/subWebView/`, `features/subWebView/`, `services/subWebView/`,
> `webview/hooks/subWebViewHandlers.ts`, `useDeepLinkNavigation.ts`, `useAndroidBack.ts` ·
> `apps/web/src/app/bridge/subWebView.ts`
> · The module doc is [apps/mobile docs/webview/sub-webview.md](../../apps/mobile/docs/webview/sub-webview.md)
> · Related: [ADR-0186](./0186-the-handshake-lists-what-the-shell-answers.md), whose handshake the web
> reads before asking

## Context

The app has one way to show a page it does not own: `OpenURL`, which leaves the app for the OS
browser. The question that started this was whether the app could host other services the way some
messengers do — something the user taps inside the app that opens inside it, built and deployed
as its own client-rendered bundle. Every such design needs the same first piece: a second
WebView the shell can show over the main one, for a page on another origin.

The main WebView is the wrong place for such a page. It carries the bridge — 97 requests before this
change, reaching the cache, the push token, purchases, files — and the injected `window.CHATIC_APP_*`
globals, device and install identifiers among them. Its trust check already drops messages from
another origin, but the injected globals are there for any page it loads, and a navigation inside it
replaces the app itself.

The app's backends are spread out — each cloud has its own endpoints — so where pages are hosted
and where their data comes from are separate questions. This decision is about the first: how the
shell shows a page, and which pages it agrees to show.

## Decision

**The shell shows a page on another origin in a second WebView with a bridge of its own, which
answers only a subset of the vocabulary, none of the main WebView's injected script, and its own
screen.** The web asks with `OpenSubWebView { url, title?, params? }` and hears the close as
`OnSubWebViewClosed { viewId, reason, result? }`; `CloseSubWebView` closes it from the web.

- **"Sub WebView" is the term, in the bridge and everywhere else.** The messages say what the shell
  does, as `OpenURL` and `StartFileTransfer` do, and the pages it shows are "sub WebView pages" — not
  "mini apps", a word that promises a platform the app does not have. What users read on screen is
  product copy, decided where pages are registered.
- **Only `*.apps.chatic.io` (and `*.apps-dev.chatic.io`), which only the app's own review pipeline
  deploys to.** A subtree, so pages are added by deploying, not by releasing the app; not
  `*.chatic.io`, which would take in the web app itself, the deep-link domain the main bridge trusts,
  every internal tool and every subdomain created later. Pages are hosted centrally whichever cloud
  they serve; who may see which page is the registry's concern, not the shell's.
- **A URL parsers could read two ways is refused** — userinfo, a port, a backslash, whitespace.
- **Device features stay open; content review is the safeguard.** Camera, microphone, pickers and
  downloads behave as the WebView and the OS make them, under DoU's name. What may run is decided by
  what is allowed to be deployed, not by switching features off per view.
- **Inside the page, every navigation is decided by the shell**: allowlisted pages load, other web
  links and mail, phone, SMS and store links go to the OS, and the app's own links — its schemes and
  its universal-link paths — are dropped, because the web that opened the view owns the app's routing.
- **One view at a time**, full screen, closed only by its bar's control or Android back. A deep link
  or a tapped push closes it first (`system`); a web reload under it closes it without an event. The
  four close reasons (`user`, `host`, `system`, `page`) were declared with the first messages, so a web
  build switching on them was ready for `page` before any app sent it.
- **The two sides never import each other.** The main WebView's code and the sub WebView's meet in
  `services/subWebView` only, enforced by `no-restricted-imports`.
- **The page talks to a second `AppBridgeHost` that registers only `SubWebViewRequestType`**, a
  compile-checked subset of the same vocabulary the main WebView speaks — not a vocabulary of its own:
  the handshake, `FinishSubWebView` (close as `page`, with a `result`), `SetSubWebViewTitle`,
  `CopyToClipboard`, `TriggerHaptic`, and an `OpenURL` that opens only what the view would hand to
  the OS. Its handlers are written for that host, never borrowed from the main WebView's. It answers
  only the origin the view was opened on.
- **A frozen `window.ChaticSubWebView` carries what the page needs to start** — the view's id, the
  platform, the app version, the user's language, the app's theme and the web's `params` — defined
  before the page's scripts and only on the opened origin. Nothing that identifies the device, the
  install or the user. `params` and `result` are JSON of at most 16 KiB.
- **The web asks only when the handshake lists `OpenSubWebView`**, and otherwise falls back to
  `OpenURL` (an older app) or a new tab (a browser). A refusal from an app that has it rejects instead
  of falling back.

> **Addendum (2026-11-02) — `OpenShareSheet` joins the subset** (`BRIDGE_VERSION` 2.12.0). A page may
> open the OS share sheet with a title, a message and a link. It gets a handler of its own on the sub
> WebView's host, as the rule above asks: the link must be `http:` or `https:`, because on iOS the share
> sheet treats a `file:` URL as the file itself and a page could otherwise hand another app a file from
> the app's container. Unlike `OpenURL`, the app's own links are not refused — a shared link is text
> the user sends on, not a navigation, and the message is free text that could carry the same link
> anyway. The rest of this decision is unchanged.

## Alternatives

- **Load the page in the main WebView.** Rejected: it would hand the page the injected identifiers,
  and navigating away replaces the app.
- **A vocabulary of the sub page's own**, with `AppBridgeHost` and `WebBridgeClient` made generic over
  it. Rejected: the bridge classes are bound to the one vocabulary, so it needs a refactor of both
  before the first message, and it duplicates versioning and the contract suites. A subset of the one
  vocabulary, registered on a host of its own and pinned by a test against the handshake, keeps the
  page away from everything else at the cost of the page's types naming messages it cannot use.
- **Switch features off in the view** (deny camera on iOS, patch the Android WebView to refuse it).
  Rejected: pages are reviewed before they can be deployed, and per-feature denial would block the
  reviewed pages that need them while protecting against nothing the review lets through.
- **Allow any origin we deploy, listed one by one in the app.** Rejected: every new page would need an
  app release.
- **Pages served from each cloud's own endpoints.** Rejected: origins would differ per cloud, the
  allowlist could not name them, and pages would reach users without passing the central review.
- **An OS in-app browser (`SFSafariViewController`, Custom Tabs).** Not for these pages: no allowlist,
  no close event to the web, and no way to add a bridge later. It remains the right tool for
  arbitrary external sites, which the sub WebView deliberately does not show.
- **"Mini app" as the term, and `MiniApp*` as the message names.** Rejected: it names a platform the
  app does not have, and borrows other products' meaning for it.

## Consequences

- Four requests and two pushes join the vocabulary (101 requests, 112 app messages); `BRIDGE_VERSION`
  is 2.10.0 for the view and 2.11.0 for the page's bridge. Two of the requests are the page's: the
  main shell lists them as unsupported, so its handshake never offers them, and the new push goes only
  to a sub WebView page. The desktop shell leaves all four requests unsupported; `apps/desktop-web`
  never sends them.
- The subset is a type, and `apps/mobile` is not type checked in CI; what CI holds it to is the sub
  WebView host's handshake test, which lists exactly the subset.
- On an Android System WebView too old for web message listeners, react-native-webview reports a
  frame's message under the top-level URL, so a cross-origin frame inside the opened page would pass
  the origin check. Current WebViews report the frame's own origin.
- Nothing can be opened until a page is deployed under `apps.chatic.io`; the DNS, certificate and
  hosting for that subtree, and the review pipeline that is the only way onto it, are prerequisites.
- Because features are open, the review has to cover every deploy, not only a page's first one; the
  web's registry of pages is where a page is withdrawn without an app release.
- The microphone and location need a purpose string or permission the app does not declare today;
  they arrive with the first reviewed page that needs them, in an app release.
- A popup login that answers through `window.opener` does not work in a sub page, since new windows
  load in the same view.
- Nothing in the web opens one yet; the debug panel's Bridge screen has a preset for trying it.
