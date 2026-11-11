# ADR-0287: A sub WebView link names an app, which the web resolves, and opens only in the app

> Status: Accepted · Decided: 2026-11-05 · Implemented: `feat/sub-webview-query-links`
> · Scope: `libs/shared` (`utils/subWebViewLink.ts`) · `libs/bridge-messages` (`OpenSubWebView.appId`)
> · `libs/bridges` (`BRIDGE_VERSION` 2.19.0) · `apps/web` (`bridge/subWebViewApps.ts`, `usePushNavigate.ts`)
> · `apps/mobile` (`deeplinkUtils.ts`, `SubWebViewService.ts`, `SubWebView.tsx`) · `apps/landing`
> (`/apps/*`) · `libs/chatic-apps-sdk` (`apps.link`)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Supersedes, in [ADR-0279](./0279-a-sub-webview-page-is-linked-through-the-app-link-host-and-opened-by-the-web.md),
> the link's shape, the shell mapping it to a page, and the landing site sending a browser to the page

## Context

ADR-0279 made a page's link `https://app.chatic.io/apps/<label>/<path>`, mapped it in the shell to
`https://<label>.apps.chatic.io/<path>`, and sent a visitor without the app on to the page itself.
Three things moved since:

- **A page will not always live at its label.** Pages may later be deployed somewhere other than a
  subdomain of the page domain, and which URL an app opens will come from the server, by id. A link
  that spells out the label ties every link ever shared to where the page was first hosted.
- **A page is meant to run in the app.** A page link opened in a browser gave the visitor a page with
  no bridge — no user key, no device storage, no way to finish — under DoU's name, and gave the page's
  author a second environment to support. The decision now is that a page link opens in the app or
  not at all.
- **A path after the label meant every page needed its static host to rewrite unknown paths to its
  entry file**, or a deep link 404'd. Pages are written outside the team, often for a plain bucket.

## Decision

**A page's link is `https://app.chatic.io/apps/<appId>?<query>`. The shell hands it to the web as its
own path; the web resolves the app id to a URL and opens it as `<page origin>/?<query>`, telling the
shell the id. Without the app, the landing site tries the app and offers the store, never the page.**

- **An id and a query, nothing else.** No path after the id and no fragment: a page is entered at its
  root and reads `location.search`. The id is one DNS label, lower case. A link that does not read this
  way is a broken page link, which the app shows as invalid.
- **The web resolves the id.** A list in `apps/web` (`bridge/subWebViewApps.ts`), by stage, maps each id
  to the page's origin. The Lab opens its pages through the same list, with their ids. It is asynchronous already so the server's list drops in behind the same call.
  An id it does not know is logged, and nothing opens.
- **The shell does not map.** `resolveDeepLink` checks the link's shape and hands `/apps/<appId>?…`
  to the web unchanged — the same path an app before ADR-0279 hands over, which the web already read.
  The custom-scheme form (`chatic://apps/<appId>?…`) is held to the same shape.
- **`OpenSubWebView` takes `appId`**, and the shell builds the page's `appLink` from it, on the link host
  of its own build. A page's share link therefore names the app, not the place it is hosted. Without an
  `appId` — a web before 2.19.0, or a page opened by URL from the debug screen — the page's label stands in, as
  before.
- **Without the app, the app or the store.** `/apps/*` on the landing site is the invite page in an
  app-only mode: it tries the app through the custom scheme (on Android at once, on iOS inside an
  in-app browser), and its only fallback is the store. It never sends the browser to the page.
- **The SDK's `apps.link(params)`** takes the query as an object and gives `appLink?<query>`. In a
  browser, or an app before `appLink`, it gives the page's own root with the same query.

## Alternatives

- **Keep the label in the link and map in the shell (ADR-0279).** Rejected: the link would break the
  day a page moves, and the server list could not be put behind it without an app release each time.
- **Resolve the id in the shell, from the server.** The shell is what grants a page its bridge, so it
  was the first candidate. Not now: the list is static and belongs to the product, which the web
  ships without an app release, and the shell's allowlist still decides what may load whatever the web
  resolves. Moving the list into the shell stays open for when it gates more than where a page lives.
- **Hand the page the link's query as `params`** (in the context, not the URL). Rejected: `params` is
  gone after a reload inside the page and reaches only the app, while a query is read by any router.
  `params` stays what the opening web passes.
- **Wrap the link the way a deferred-link service does** (`?deep_link_value=<scheme link>`). Rejected:
  that shape exists for an attribution service's redirect, which this app does not use; the path
  already carries the id and the OS already claims it.
- **Keep sending a browser to the page.** Rejected, as above: a page without the bridge is a second
  product nobody designed.

## Consequences

- An app before this change still works, by a different road. One built on ADR-0279 maps the link to
  the label's subdomain and hands the web `/sub-webview?url=…`, which the web still opens, without an
  id — right as long as an app's id and its page's label agree, as they do for `dou-raise`, the one page
  that exists.
  One built before ADR-0279 hands the bare path, which the web now resolves. One built before the sub
  WebView itself (bridge 2.10.0) opens nothing: the web drops a page link in an app whose handshake
  does not list `OpenSubWebView`, since the fallback there is the OS browser.
- The shell change — handing the link through, and `appLink` from the id — reaches users with an app
  release. The web, landing and the SDK do not wait for it.
- **Landing should deploy only once Android users have the app that claims `/apps/`** (0.31.1).
  Before that, an Android tap reaches the landing page even with the app installed; the page still
  tries the app first, but a browser that declines the custom scheme leaves them with only the store.
- A visitor who installs from the store lands on the app's home, not the page: nothing carries the
  link across the install.
- An id the web does not know opens nothing and says nothing to the user, only to the log.
- The shell's allowlist is still `*.apps.chatic.io`. A server list that points an id elsewhere needs
  the allowlist, the user key and the per-origin storage (both keyed by origin) decided again first.
- `BRIDGE_VERSION` is 2.19.0.
- None of it has been watched on a device: the custom-scheme launch from the landing page, and the web
  resolving a cold-start link, are covered by tests only.
