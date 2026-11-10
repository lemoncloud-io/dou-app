# ADR-0297: A sub WebView opens any https site, in one of three trust tiers

> Status: Accepted · Decided: 2026-11-09 · Implemented: `feat/mini-app-hub-link-desktop` (the desktop
> shell and the shared rule; the phone shell follows in a later change)
> · Scope: `libs/shared` (`utils/subWebViewTrust.ts`, `utils/miniAppLaunchParams.ts`) ·
> `libs/bridge-messages` (`model/sub-webview.ts` — `SubWebViewOpenScope`, `MiniAppLaunchParams`,
> `platform: 'desktop'`; `model/system.ts` — `subWebViewOpenScope`) · `libs/bridges` (`BRIDGE_VERSION`
> 2.22.0) · `libs/chatic-apps-sdk` · `apps/desktop/src/main/subWebView/`, `src/preload/subWebView.ts`
> · The specification is [apps/mobile docs/webview/sub-webview-protocol.md](../../apps/mobile/docs/webview/sub-webview-protocol.md);
> the desktop behaviour is in [apps/desktop](../../apps/desktop/README.md)
> · Related: [ADR-0265](./0265-a-page-on-another-origin-opens-in-a-sub-webview-with-a-bridge-of-its-own.md),
> whose "only `*.apps.chatic.io`" and "nothing that identifies the user" this amends;
> [ADR-0278](./0278-a-sub-webview-page-declares-what-it-reaches-in-a-manifest-on-its-own-origin.md),
> whose manifest an external site never gets to declare

## Context

A cloud's owner wants a mini app of their own in DoU: a page they built and host themselves, opened
from inside the app by everyone in the cloud. ADR-0265 limited the sub WebView to one label under
`apps.chatic.io`, because that subtree is deployed only by DoU's review pipeline and content review
was the safeguard for everything the view lets a page reach. An owner's site is not under it and was
never reviewed, so under that rule it could only leave the app for the OS browser — and the OS
browser cannot hand the page who is looking, or hand a result back.

Nothing in the app opened a sub WebView yet, and the desktop shell had none at all
(`OpenSubWebView` answered `NOT_FOUND`). The first place an owner's link appears is the desktop app's
settings; the phone follows with the same rule.

There is also no place yet for an owner to say "this cloud's mini app is here", and no server field
for it. Until there is, the first step needs a page DoU hosts that greets the user and tells an owner
where to register a link: the hub, at the root `https://apps.chatic.io` (and `apps-dev`).

## Decision

**A sub WebView opens any plain https site, and how far the shell trusts it is one of three tiers,
decided by one shared rule both shells and both webs call.**

- **The tiers** (`subWebViewTrustOf`, `libs/shared`, a file with no imports):
    - `firstParty` — the hub, `https://apps.chatic.io` and `https://apps-dev.chatic.io`, by exact origin.
      Built and deployed by DoU; the only page told whether the user owns the cloud.
    - `reviewed` — one label under those domains: ADR-0265's allowlist, case for case.
    - `external` — any other plain https host. The base set of requests only, no manifest fetched or
      applied — not even a request to its `/.well-known` — the bar always shown, titled with the host
      whatever the page or the web asks, so a third party under DoU's chrome cannot name itself DoU.
- **Not `*.chatic.io` as trusted**, for ADR-0265's reasons. The web app's own origin can still be
  opened as `external`: it then gets the external tier's limits and, on the desktop, a session of its
  own, so it shares nothing with the main window.
- **A URL a parser could read two ways is refused**, as before, and now IP literals too: Chromium
  rewrites `https://127.1` to `127.0.0.1`, so the origin the rule reads would not be the one loaded.
- **The shell says how far it opens** in the main window's handshake, `subWebViewOpenScope:
'reviewed' | 'anyHttps'`, an optional field (more fields, same major). The desktop says `anyHttps`.
  The web ships before the shell, so it offers an owner's link only where the handshake says
  `anyHttps`; a shell that says nothing opens the reviewed pages only.
- **Any https only for a link the owner saved, opened by the web.** A push or a deep link reaches the
  web from outside, so their gate (`subWebViewPageUrlOfNavigatePath`, `isSubWebViewPageUrl`) stays the
  reviewed pages alone.
- **DoU's web hands a mini app who is looking**: `MiniAppLaunchParams` — the cloud's id and name, the
  open place's id and name or `null`, and the user's id _in that cloud_ and display name (the place's
  nick, else the cloud profile's name). This amends ADR-0265's "nothing that identifies the user": the
  shell's own context still carries nothing of the kind, but the web's `params` now name the user
  within one cloud, which a page cannot link to another cloud or to the account.
    - No token of any kind, and no key named for one. A page that needs to act for the user waits for a
      scoped token, a later decision.
    - `user.isOwner` goes to the hub alone. No other page is told who owns the cloud.
    - The first time a user opens an external host, the web asks before it hands that host the names
      (the consent is the web's, per account and host, so one person's yes on a shared computer does
      not send another's names).
- **The desktop shows it as a modal over the main window**, with the shell's own bar and close
  control (Esc too), one page view per opening in a session per origin that refuses every permission
  request and every device chooser. Only the opened origin loads in the view; any other https URL goes to the OS browser. The
  page host answers `WebAppReady`, `Ping`, `FinishSubWebView`, `SetSubWebViewTitle` and
  `ReportSubWebViewError` on every tier — device access, storage, sharing, the clipboard and the user
  key come later. A trusted page's manifest gives the bar its name and the display; `standard` is the
  default on the desktop.
- **The page speaks to the desktop as it does to the phone** — `window.ReactNativeWebView.postMessage`
  and `message` events — so a page built with `chatic-apps-sdk` needs no change. The context says
  `platform: 'desktop'`.

## Alternatives

- **Keep the reviewed subtree only, and open an owner's site in the OS browser.** Rejected: the
  browser cannot carry `params` or bring back a `result`, so the owner's page could not know who is
  looking, and the hub could not hand the owner to the link settings.
- **Show the owner's site inside the hub, in an iframe.** Rejected: the hub's origin is not the site's,
  so the site would get its `params` only by a message protocol of the hub's own, and many sites refuse
  to be framed (`frame-ancestors`, `X-Frame-Options`).
- **Have the hub open the owner's site.** Rejected: a page reaches the shell only for its own view, and
  `params` are the web's to give; the hub would have to be handed the link and the names to pass on.
  The web opens the link directly.
- **Decide from the shell's version instead of a handshake field.** Rejected: versions differ per
  platform and per channel, and the handshake already carries what a shell answers. A field says the
  one thing the web needs.
- **One allow-list per shell.** Rejected: the security boundary would be drawn twice, and a link the
  web let an owner save could be one a shell refuses.
- **Apply an external site's manifest.** Rejected: its server is not reviewed, so its permissions
  would be the author's word alone; and a full-screen display without DoU's bar would let it draw
  what looks like DoU.
- **Send a token, so a page can call DoU for the user.** Deferred: it needs a token scoped to a page
  and an origin, which does not exist yet; an unscoped session token in a third party's hands would
  be the account.

## Consequences

- `BRIDGE_VERSION` is 2.22.0 (the handshake field, the desktop platform, the params type); the page
  SDK follows, and `SDK_BRIDGE_VERSION` with it.
- The desktop shell answers `OpenSubWebView` and `CloseSubWebView` and pushes `OnSubWebViewClosed`;
  the page-facing requests stay off the main window's host.
- The phone shell still opens the reviewed pages only and reports no `subWebViewOpenScope`, so on
  the phone the web keeps the owner's link hidden until the phone adopts the shared rule.
- The hub's root origins need DNS, a certificate and hosting of their own: the `*.apps.chatic.io`
  wildcard covers neither the root nor its certificate. Until they exist, opening the hub shows the
  load error in the card.
- An owner keeps a list of links per cloud (each a name and an address, up to ten), not a single one:
  a cloud runs more than one outside service, and a list costs the same rule per entry. The list lives
  on the device only (the web's storage, per cloud), so it shows only on the computer the owner saved
  it on. Members on their own devices get it when the list moves to the server, a later step.
- An external site the owner chose runs with fewer features than a reviewed page, on purpose; the
  review is still the way to more.
