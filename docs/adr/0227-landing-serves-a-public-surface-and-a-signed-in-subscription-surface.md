# ADR-0227: Landing serves a public surface and a signed-in subscription surface

> Status: Accepted · Decided: 2026-10-23 · Implemented: `feat/dou-subscription-web`
> · Decision 5 amended by [ADR-0235](./0235-landing-lists-the-plans-on-every-host-before-checkout-opens.md) (the plans page opens on every host)
> · Decision 3 amended by [ADR-0248](./0248-landing-account-surface-reaches-the-server-through-one-http-port.md) (the HTTP port, composed with the mock)
> · Scope: `apps/landing` (`README.md` design principles, `src/app/routes/`, `src/app/config/stage.ts`,
> `src/app/features/subscription/`)
> · Builds on [ADR-0225](./0225-landing-follows-the-web-apps-layering-and-routes-from-routes.md) (layering, `ROUTES`)
> · The module doc is [the landing README](../../apps/landing/README.md#two-surfaces)

## Context

DoU sells its subscription through the App Store and Google Play. People should also be able to buy
and manage the same subscription from a desktop browser: pick a plan, pay with a Korean card, change
the plan, cancel, keep their cards and billing addresses, read their invoices.

`apps/landing` (`app.chatic.io`) was defined by one question — what does a stranger with no account
see — and its design principles defended that definition: no session, ever; no call to our own
backend; and, among the reasons it is a separate app, that it loads with no session. Signed-in
billing pages break all three.

The obvious home looks like `apps/web`, the product app, which already has a session. It is the wrong
one for three reasons:

- **A purchase starts on a public price page**, and the buyer may never have used the web app. The
  path from the marketing page's pricing to a checkout should not cross into the product's sign-in,
  socket and cloud selection.
- **A payment provider's review asks for the refund policy and the business details on the same site
  as the sales pages.** `app.chatic.io` already carries the policy pages that store listings cite.
- **The payment provider's script and the billing pages are kept out of the product app's bundle and
  its permissions.** A billing bug or a third-party script should not share an origin with chats.

Adding the pages to landing with an exception line ("no session — except under `/subscription`")
would narrow the principles without saying why, and the next reader would cite the principle to undo
the exception.

## Decision

1. **Landing has two surfaces, and each has its own rules.** The **public surface** — `/`, `/policy/*`,
   `/s/*`, `/i` — is unchanged: it knows nothing of who is reading, calls no backend of ours, and its
   URLs are public. The **account surface** — `/subscription/*` — is for a signed-in DoU account
   holder buying or managing a subscription bought outside the stores. The principles are rewritten
   per surface rather than given an exception; the old principles 1 and 2 keep their numbers, scoped
   to the public surface.
2. **The account surface only does subscription.** Plans, checkout, payment methods, invoices,
   billing addresses, cancelling. Anything that uses the product — clouds, chats, friends — belongs in
   `apps/web`. This is what keeps landing from becoming a second web app.
3. **The account surface talks to a server through one port.** Its pages and hooks call a
   `SubscriptionPort` interface and nothing else: no `fetch`, no HTTP client. There is no web
   subscription server yet, so the only implementation is an in-memory mock with scenarios; the real
   one will be a second implementation of the same interface, chosen in
   `features/subscription/lib/createPortSetup.ts`; swapping it in touches nothing under `pages/`.
4. **One boundary between the surfaces.** The public surface reaches the account surface only through
   the lazy import of `SubscriptionRoutes` in the route table. The session, the query client and the
   subscription copy all live in that chunk and are provided at its root, so a visitor to the public
   pages downloads none of them. The account surface may use app-level code (`app/ui`, `app/hooks`,
   `app/config`); the public surface imports nothing from the account surface.
5. **The account surface is shut where it is not ready.** `isSubscriptionWebEnabled` (in
   `app/config/stage.ts`) is true on `localhost`, `127.0.0.1` and `-dev` hosts only. Elsewhere the
   `/subscription/*` routes are not registered — the path falls to the catch-all like any unknown URL
   — and a link a public page adds into it (a sign-in entry, the refund policy) renders only where
   the gate is open. Nothing outside points at these pages until they open: not the sitemap, not an
   email.
6. **The boundaries are checked by grep**, like the layering rules ADR-0225 set: one command for the
   public surface importing the account surface or a session module, one for an account-surface page,
   hook or component reaching the network. The closed gate is a row in the route table test.

## Alternatives

- **Build the pages in `apps/web`.** It already has sign-in. But a buyer from the price page would be
  routed through the product's own sign-in and its socket, the provider's script would share an
  origin with the product, and the policy and business pages a payment review asks for live here.
- **A third app for billing.** A clean origin, but a third deploy pipeline, a third copy of the policy
  pages or a cross-site link to them, and a hop from the price page to another domain at the moment
  someone decides to buy.
- **Keep one surface and add exceptions to principles 1 and 2.** The smallest edit, and the one most
  likely to be reverted by the next reader who takes the principle at its word.
- **Enforce the boundary with an ESLint rule.** Landing already checks its layering by grep (as the
  web app does); a lint rule for one boundary would make the checks differ in kind for no gain in
  what they catch.

## Consequences

- **Landing now has a session and a data layer — in one lazy chunk.** `@tanstack/react-query` and
  `@radix-ui/react-dialog` (root dependencies) are imported under `features/subscription/` only. The
  public-surface reason the app exists separately now reads "its public surface loads with no
  session", and its check excludes the account surface.
- **The mock is the contract until a server exists.** Screens are built and reviewed against
  scenarios (`?mock=`), and the state machine moves the way the server is expected to. When the server
  arrives, a field it cannot supply is a change to the view types, not a workaround in a screen.
- **Opening the surface in production is its own decision**: it needs a real port, the real payment
  provider and sign-in, and the policy and business text — and then a change to
  `isSubscriptionWebEnabled`.
- **`/policy/refund` exists on every host**, showing proposal text until the policy is written, because a
  policy URL is public the day it is linked. Only the links to it follow the gate.
