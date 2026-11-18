# ADR-0344: A mini app page speaks `MiniApp` names, not the shell's `SubWebView`

> Status: Accepted · Decided: 2026-11-18 · Implemented: `feat/mini-app-protocol-names`
> · Scope: `libs/bridge-messages` (the page-facing request and push names, the handshake's `miniApp`)
> · `libs/bridges` (`BRIDGE_VERSION` 2.30.0, `AppBridgeHost`) · `apps/mobile/src/app/subWebView/`
> · `apps/desktop` (page host, preload) · `libs/chatic-apps-sdk` (`SDK_BRIDGE_VERSION`, internals)
> · The specification is [apps/mobile docs/webview/mini-app-protocol.md](../../apps/mobile/docs/webview/mini-app-protocol.md)
> · Related: [ADR-0277](./0277-the-sub-webview-page-protocol-is-specified-and-versioned-apart-from-the-bridge.md)
> (the protocol and its compatibility rule), [ADR-0281](./0281-sub-webview-pages-talk-through-chatic-apps-sdk-kept-beside-the-app.md)
> (`chatic-apps-sdk`)

## Context

"Sub WebView" is the app's name for the native view a mini app is shown in: a second WebView over the
main one. It is the right name inside the app. It was also the name of everything a page sends and
reads — `FinishSubWebView`, `SetSubWebViewTitle`, `GetSubWebViewStorage`, `OnSubWebViewContextChanged`,
`window.ChaticSubWebView`, the handshake's `subWebView` — and of the protocol document `chatic-apps-sdk`
points its authors to.

A page author does not know there is a second WebView, and should not have to. To them the thing is a
mini app, the name the product, the SDK (`chatic-apps`) and the launch parameters
(`MiniAppLaunchParams`) already use. The SDK hides the message names behind `finish`, `setTitle` and
`storage`, but they still show up in the browser's developer tools, in the protocol document, and in the
SDK's own source that an author steps into.

The protocol's compatibility rule forbids renaming within a `protocolVersion`, so that a page built
against one app keeps working on the next. No mini app outside DoU has shipped yet: the pages that
speak these names are DoU's own, rebuilt with the SDK.

## Decision

1. **Every name a page sends or reads says `MiniApp`.** `FinishMiniApp`, `SetMiniAppTitle`,
   `GetMiniAppUserKey`, `SetMiniAppCloseGuard`, `ReportMiniAppError`, `GetMiniAppStorage`,
   `SetMiniAppStorage`, `RemoveMiniAppStorage`, `ClearMiniAppStorage`, `GetMiniAppStorageInfo`,
   `GetMiniAppPermission` and `RequestMiniAppPermission`; their replies `On<Request>`; the pushes
   `OnMiniAppContextChanged` and `OnMiniAppCloseRequested`; the global `window.ChaticMiniApp` and the
   handshake reply's `miniApp`. Their payload types follow.
2. **The old names are not answered.** This is the one exception to the compatibility rule, taken while
   nothing outside DoU depends on the names. `protocolVersion` stays 1; `BRIDGE_VERSION` and
   `SDK_BRIDGE_VERSION` go to 2.30.0 to date the change. An app or a page from before it speaks the old
   names, and the two do not understand each other.
3. **What only the app or the opener uses keeps `SubWebView`.** The main web's own messages
   (`OpenSubWebView`, `CloseSubWebView`, `OnSubWebViewClosed`), the app's type names
   (`SubWebViewContext`, `SubWebViewRequestType`), its modules and its view's own document are the
   app's vocabulary for its native view. A page never sends or reads them.
4. **The protocol document is `mini-app-protocol.md`**, titled for the mini app, with a note that a
   `SubWebView` left in an identifier is the app's.
5. **The runtime requests keep their names** (`RuntimeHello` and the rest). They are the main web's own
   four requests, answered on the page's host with handlers of its own; renaming them for the page
   is a separate decision, together with the SDK's `runtime`.

## Alternatives

- **Rename only in the SDK and the documents, keep the wire names.** The SDK's public surface already
  says nothing of a sub WebView. Rejected: the names still reach an author through the developer tools
  and the protocol document, and later the cost of renaming only grows.
- **Answer both names for a while.** Every page-facing handler registered twice, every push sent
  twice or chosen by the page's SDK version. Rejected while nothing outside DoU depends on the old
  names; it would be the right way once something does.
- **Raise `protocolVersion` to 2.** It would tell an old page why it fails, but every page today is
  DoU's own and is rebuilt, and a major version is the signal kept for a break that pages outside
  DoU have to act on.
- **Rename the opener's messages and the app's types too.** No page meets them, and they name the
  app's own view correctly. Left alone.

## Consequences

- An installed phone app before 2.30.0 and a page built with the new SDK do not understand each
  other: the handshake answers, and every other request is `NOT_FOUND`. The same holds for an old page
  on a new app. DoU's own pages are rebuilt with the new SDK; a page deployed earlier stops working on
  an updated app until it is.
- `chatic-apps-sdk`'s public API does not change; only the names it sends do.
- ADRs written before this keep the old names: they record what was decided then.
