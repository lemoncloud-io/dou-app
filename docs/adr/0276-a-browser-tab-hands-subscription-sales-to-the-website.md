# ADR-0276: A browser tab hands subscription sales to the website

> Status: Accepted · Decided: 2026-11-03 · Implemented: `feat/web-subscription-web-checkout`
> · Scope: `apps/web` (`features/subscription`), `apps/web-e2e` (browser mode)
> · Related: [ADR-0173](./0173-subscription-changes-are-confirmed-before-the-store-opens.md) (a
> subscription changes only on the store that bills it) ·
> [ADR-0227](./0227-landing-serves-a-public-surface-and-a-signed-in-subscription-surface.md) (the
> website's signed-in subscription surface) ·
> [ADR-0235](./0235-landing-lists-the-plans-on-every-host-before-checkout-opens.md) (the plans page is
> open on every host)
> · The module docs are [apps/web subscription](../../apps/web/docs/feature/subscription/README.md)
> § 6 and [apps/web-e2e](../../apps/web-e2e/README.md#a-browser-tab)

## Context

The web app sells DoU Pro through the native shell's store bridge. Opened in a plain browser tab it has
no bridge and no store, so its subscription screens said "Subscriptions are only available in the
app" and offered nothing to tap — the list's empty state had no button at all.

The landing website now sells the same tiers itself, by card, and the relay writes a subscription
bought there into the same membership the web app reads, with `platform` set to the website's payment
provider (`portone` or `stripe`). The membership screens can therefore show a website subscription as
they show a store's, and a browser tab has somewhere to send a buyer.

## Decision

**Outside the app the web app sells nothing itself: it hands the reader to the website's checkout.
Inside the app it never mentions the website.**

1. **A gate in front of the selling screens.** `WebCheckoutHandoff` wraps `plans` and `confirm`. In a
   browser it replaces the history entry with the website's plans page, so every way into those
   screens is covered without each entry deciding, and back from the website returns to the screen
   that led there.
2. **Only someone no store is billing goes.** No receipt, a lapsed one, an admin grant without one, or
   a subscription the website bills (`canCheckoutOnWeb`). A running App Store or Google Play
   subscription stays with its store — ADR-0173's rule, extended to the website — and so does a live
   receipt that names no platform, since every receipt before the website was a store's. The decision
   waits for a membership that was read; a failed read keeps the screen as it was.
3. **No sign-in here first.** A browser guest is handed over like anyone else. The website signs the
   buyer in, and the purchase attaches to that account.
4. **Inside the app, the website is a note.** A website subscription opened in the app shows that it
   was bought on the website and that it cannot be changed here, with no link and no "manage it at"
   line. The picker refuses every tier as another store's, even when the catalog does not list the
   website's plan, so a store sale on top of it cannot start.
5. **The address is the policy host's.** `WEB_SUBSCRIPTION_URL` is built on the host the policy
   pages already come from. On production that lands on the plans page, which lists the plans with
   the stores' links until the website opens checkout there (ADR-0235); no web app change is needed
   when it does.

## Consequences

- **A buyer can pay on one account and look on another.** The website's sign-in is its own. Someone
  who picks another account there, or a guest who stays a guest here, sees no subscription in this
  tab. Handing the session over is not attempted.
- **On production the hand-off shows plans, not checkout,** until the website opens checkout there.
  That is what a browser reader saw least of before ("app only"), and it is the one website page
  allowed to be linked before checkout opens.
- **The e2e suite gained a browser mode** (`test.use({ inApp: false })`): no shell, the relay faked as
  before, the website answered with a canned page. It proves the page leaves for the right address,
  not what the website shows.
- **The client types lag the relay.** The membership's `platform` type still lists only the stores,
  so the website's providers are compared as strings in one place (`isWebBilled`).

## Alternatives considered

- **Keep "app only" in the browser.** Rejected: the website now sells the same tiers into the same
  membership, and a browser reader would keep being told to install the app to do what a click away
  already does.
- **Build a card checkout into the web app.** Rejected for the reason ADR-0227 put checkout on the
  website: one payment surface to review, secure and keep in step with the payment server, not two.
- **Ask a browser guest to sign in first, as the app does.** Rejected: in the app a store receipt
  attaches to the account signed in here, which is why the app asks. On the website the purchase
  attaches to the website's own sign-in, so signing in here first would add a step without deciding
  the account.
- **Push the website's address instead of replacing the entry.** Rejected: back from the website
  would land on the gate, which would send the reader straight out again.
- **Gate the hand-off to dev hosts until the website sells on production.** Rejected: production's
  plans page is meant to be linked, and gating would need a second switch to remove when checkout
  opens.
