# ADR-0329: A mini app link tapped in a chat opens in the sub WebView

> Status: Accepted · Decided: 2026-11-16 · Implemented: `fix/chat-mini-app-links-open-in-app`
> · Scope: `apps/web` (`bridge/subWebViewLink.ts`, `features/channels/utils/openExternalUrl.ts`,
> `bridge/navigation/usePushNavigate.ts`)
> · The behaviour is documented in [apps/web docs/feature/channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md)
> · Extends [ADR-0287](./0287-a-sub-webview-link-names-an-app-the-web-resolves-and-opens-only-in-the-app.md),
> which covered a link the shell hands the web, not one tapped inside it

## Context

ADR-0287 made a mini app's share link `https://app.chatic.io/apps/<appId>?<query>` and settled how it
opens when the OS hands it to the app: the shell passes the path to the web, which resolves the id and
opens the page in the sub WebView. It said nothing about a link tapped inside the app.

A link tapped in a chat message goes to `openExternalUrl`, which hands every address to the OS
browser — on purpose, because loading an arbitrary site in the main WebView would strand the user with
the session attached. A mini app link went the same way:

- **A page's own address** (`https://dou-raise.apps.chatic.io/`) is not a link the OS hands the app,
  so it opened in Safari, with no bridge and none of the player's saves. A mini app that posts to a
  room (ADR-0325) put exactly that address in a message, until it shared its app link again.
- **The app link itself** reached the OS from the app it would open. Whether iOS hands an app its own
  universal link back, or shows it in a browser, is the OS's call and was not checked; the landing
  page it would reach in a browser only offers the app again.

Either way a tap inside the app that should have stayed inside it left.

## Decision

**In an app whose handshake lists `OpenSubWebView`, `openExternalUrl` opens a mini app's app link, or a
page's own address, in the sub WebView instead of handing it to the OS. Every other address still goes
to the OS.**

- **Two shapes count.** An app link, on the production or the development app-link host, read with
  `@chatic/shared`'s `readSubWebViewAppLink`; and a page's own address — one DNS label under
  `apps.chatic.io` or `apps-dev.chatic.io`, over https — read with `subWebViewAppLinkOfOrigin`. The mini app
  hub (the bare page domain) is not a page and still goes to the OS.
- **An app link is resolved for this build's stage**, as one handed over by the shell is: a dev build
  opens the dev page whichever host the link was on. An id this build does not know goes to the OS,
  so a tap the user asked for opens something; a refusal from the shell is logged and opens nothing.
- **A page's own address counts only on this build's own page domain.** The shell's allowlist takes
  both domains in every build, so a development page tapped in a production build would run with the
  production session; the other stage's address goes to the OS like any other site. A page's address
  opens as it is — path included, with no app id.
- **One helper for both roads.** `bridge/subWebViewLink.ts` reads a URL into a target and opens it;
  `usePushNavigate` uses the same opening for the path the shell hands over, so an unknown id and a
  refusal are logged under the same keys on either road; what follows an unknown id is the caller's.
- **An app without the sub WebView hands the link to the OS, as before.** This differs from the path
  the shell hands over, which ADR-0287 drops in such an app: there the link already came from the OS,
  and handing it back would loop. A tap in a chat is the user asking for the link, and the OS is what
  that app has always done with one. An app link still reaches the landing page, which never sends a
  browser on to the page.

## Alternatives

- **Fix only the share text.** Rejected as the whole fix: the page now shares its app link again, but
  messages already sent carry its own address, and an app link handed to the OS from inside the app
  depends on the OS routing it back.
- **Route a page's own address to its app id** (the label read as the id) and open by id. Rejected for
  now: the label and the id agree for the one page there is, but ADR-0287 keeps the two apart so a page
  can move; opening the address the message carries needs no such guess.
- **Load mini app pages in the main WebView.** Rejected: it would give an outside page this app's
  session and bridge, which is what the sub WebView exists to avoid.

## Consequences

- An existing message with a page's own address opens in the app once the web ships; no app release
  is needed, since every app with the sub WebView already answers `OpenSubWebView`.
- A page's own address opens without an app id, so the shell builds the page's share link from its
  label, as it does for a page opened by URL. Where the label and the id agree that is the same link.
- The desktop app has its own chat and is not changed here.
- Not watched on a device: unit tests cover the reading and the opening, and the shell's side is
  unchanged.
