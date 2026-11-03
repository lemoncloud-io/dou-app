# ADR-0279: A sub WebView page is linked through the app-link host and opened by the web

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/sub-webview-app-link`
> · Scope: `libs/shared` (`utils/subWebViewLink.ts`) · `libs/bridge-messages` (`SubWebViewContext.appLink`)
> · `libs/bridges` (`BRIDGE_VERSION` 2.17.0) · `apps/mobile` (`deeplinkUtils.ts`, `SubWebView.tsx`,
> `AndroidManifest.xml`) · `apps/web` (`useHandlePushNavigation.ts`) · `apps/landing` (`/apps/*`, the
> association file)
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> which made the main web the only opener

## Context

A sub WebView page can share a link (`OpenShareSheet`), but the only link it has is its own URL,
`https://<label>.apps.chatic.io/…`. Tapped by someone else, that opens in their browser: no bridge, no
user key, and nothing that tells them the page lives in DoU. A game that wants players to invite
players loses everyone at the first tap.

The app already receives `https` links on its own link host (`app.chatic.io`, `app-dev.chatic.io`) for
invites, and every inbound link reaches the web as an `OnNavigate` path, held through a cold start
until the web has mounted the screen that handles it.

## Decision

**A page's link is `https://app.chatic.io/apps/<label>/<path>`, and it opens
`https://<label>.apps.chatic.io/<path>`; the app hands it to the web as the `OnNavigate` path
`/sub-webview?url=…`, and the web opens the page in a sub WebView.**

- **The link host is the app-link host**, under a prefix of its own, `/apps/`. The app claims
  `/apps/*` on iOS and `/apps/.*` on Android, so no other page of the landing site is taken over.
  `app-dev.chatic.io` maps to `apps-dev.chatic.io`, so a dev link never opens a production page.
- **One mapping, in `@chatic/shared`**, used by landing, mobile and the web: from a link to its page,
  from a page's origin to its link, and the `OnNavigate` path between them.
- **The web opens the page, as it opens every other**, because ADR-0265 made the main web the only
  opener. Reusing `OnNavigate` gives the link the cold-start buffering, boot-cover hold and "close a
  showing view first" every link already has. The web recognises the one path and opens the page
  over whatever it shows instead of routing, so closing the page returns the user to where they were.
- **Without the app, the landing site sends the browser to the page.** `/apps/*` redirects with the
  link's path, query and fragment. The page works without the bridge; a bounce page asking to install
  the app first would stand between a visitor and a page that would have worked.
- **The page learns its link from the context** (`appLink`), derived from the opened origin. A page
  never writes the host itself.
- **The web also reads the link's bare path, `/apps/<label>/…`**, mapped with its own build's stage.
  The association file is read by every installed app the moment the landing site deploys it, and an
  app built before this passes the link's path through unchanged; without this, such an app would
  take the link from Safari, where it worked, and land the user on home. The web always ships before
  the app, so the older app finds a web that reads it.
- **The web opens only a page on a sub WebView origin.** `/sub-webview?url=…` can also arrive through
  the app's custom scheme from any website, and an app without `OpenSubWebView` would hand any other
  URL to the OS browser.
- **A claimed `/apps/` link that names no page** is an invalid link in the app, not a route.

## Alternatives

- **A push of its own (`OnSubWebViewLinkOpened`).** Considered first, and rejected: the web drops an
  event with no listener, so a cold-start link would need a second early-capture store beside the one
  `OnNavigate` already has.
- **Let the shell open the view itself.** Rejected: the main web would not be the opener, would not
  hear the close, and could not decide what to do around it (a sign-in first, say), against ADR-0265.
- **Share the page's own URL.** Rejected: it never opens the app.
- **A path the web routes to (`/apps/<label>` as a screen).** Rejected: a routed screen replaces what
  the user was looking at, and leaves an empty screen behind once the page closes.
- **A bounce page that tries the app first, as invites do.** Deferred: the page works in a browser,
  unlike an invite. It can be added for pages that do not.
- **The custom scheme (`chatic://apps/…`).** Not added: no page shares one, and the `https` link
  already reaches the app or the page.

## Consequences

- `AndroidManifest.xml` changes, so Android opens these links in the app only after an app release;
  iOS follows the landing deploy of the association file, once Apple's CDN has refreshed it — older
  apps included, which is why the web reads the bare path.
- Deploy order: the web first, then the landing site, then the app.
- A link waits for the screen that handles every link, which mounts only once a session is up: a
  visitor who is not signed in does not get the page from a link, as with every other link.
- None of it has been watched on a device yet: the OS handing `/apps/` links to the app, a cold-start
  link, the landing redirect.
- A web build before this routes `/sub-webview` to its catch-all. The web ships before the app, so an
  app that sends the path finds a web that reads it.
- A link opens any allowlisted page, whatever debug mode or the Lab shows: the allowlist and the review
  are the gate.
- `BRIDGE_VERSION` is 2.17.0 for `appLink`; nothing in the vocabulary changed shape.
