# ADR-0311: Landing opens the account surface on the production host, for a production build, in won only

> Status: Accepted · Decided: 2026-11-13 · Implemented: `feat/landing-production-account`
> · Scope: `apps/landing` (`README.md` principle 10, § Two surfaces, § Billing outside Korea, § Sandbox
> payments; `src/app/config/stage.ts`; `src/app/features/subscription/lib/createPortSetup.ts`,
> `lib/billingCountry.ts`, `lib/port/PortProvider.tsx`, `pages/checkout/`)
> · Amends: decision 5 of [ADR-0227](./0227-landing-serves-a-public-surface-and-a-signed-in-subscription-surface.md)
> (the account surface shut on the production host) and, with it,
> [ADR-0235](./0235-landing-lists-the-plans-on-every-host-before-checkout-opens.md)'s premise that the
> production host has the plans page alone; the "test mode only" consequence of
> [ADR-0262](./0262-landing-bills-outside-korea-in-dollars-through-its-own-card-dialog.md); decision 1 of
> [ADR-0263](./0263-landing-runs-sandbox-payments-on-the-payment-servers-mock-provider.md) (the sandbox's
> production guard). Their other decisions stand.
> · The module doc is [the landing README](../../apps/landing/README.md#two-surfaces)

## Context

ADR-0227 built the account surface — sign-in, checkout, plan changes, cancelling, cards — and kept it shut
on the production host, `app.chatic.io`, leaving the opening as a decision of its own: it needed a real
port, the payment provider, sign-in, and the policy and business text. ADR-0235 then opened the plans
page alone there, on a fixed catalog, so a payment provider could review the prices.

The gate, `isSubscriptionAccountEnabled` in `config/stage.ts`, reads the hostname only — `localhost`,
`127.0.0.1` and `-dev` hosts — and deliberately ignores the build: a dev build carries the dev server's
addresses, so served from the production host it would sign production's visitors in to the dev server
and take their payments there. A second condition, `isSubscriptionAccountOpen`, adds the build's four
server addresses.

The subscription server now runs its won payments on a live channel: registering a card, starting a
trial and cancelling have been confirmed there. The subscription state the pages read comes from the
membership read, which production already serves. Three things are not ready:

- **Dollars.** The server has dollar products on the dev stage only; there are none for production. The
  pages have no stage gate of their own for dollars and take the dollar provider's key from the server's
  answer, so a non-Korean checkout in production would fail when the card is registered.
- **The sandbox.** ADR-0263's sandbox payments are sent as `?sandbox` on the payer-scoped calls. The
  server accepts the query on production too. ADR-0263 relied on the production host having no account
  surface; opening it removes that guard.
- **A real charge.** No charge at the end of a trial, no immediate payment and no upgrade difference has
  been taken in production yet. The first one will be the first evidence.

## Decision

1. **The account surface may open on the production host, for a production build only.**
   `readSubscriptionAccountEnabled(hostname, productionBuild)` is true on `localhost`, `127.0.0.1` and
   `-dev` hosts as before, and on a hostname that is exactly `app.chatic.io` when the build's `VITE_ENV`
   is `PROD` (`readProductionBuild`). A dev build on the production host stays shut, and so does a
   production build under any other name (a CDN origin address, for one). `isSubscriptionAccountOpen`
   still also needs the four addresses. Both are pure functions of the hostname and the build's values,
   read once, in `config/stage.ts` and `config/subscriptionServer.ts`. The home header's "Sign in" and W-01's checkout button follow the same
   gate and are not changed.
2. **No sandbox on the production host, nor in a production build.** `createPortSetup` ignores
   `?sandbox` — no switch, no banner, no query on any call — when the page is served from
   `app.chatic.io`, whatever the build, or when the build is production's, whatever the host. The first
   is new; the second was ADR-0263's.
3. **A production build bills in won only.** `createPortSetup` sets `foreignBilling` false for a
   production build, and the pages read it through `useForeignBilling`. W-08 keeps the billing-country
   picker and stops any country other than Korea at a notice that names no provider — no currency line,
   no amount, no consents, no way on (`billableIn`, `canContinueCheckout`) — and W-05 sends a dollar
   checkout handed to it back to W-08 (`checkoutDetailsOf`). W-01 still shows dollar prices to a reader
   of any language but Korean: the page's language picks the currency shown, the billing country the
   currency charged. Every other build bills both, as before. Whether dollars open in production is a
   later decision.
4. **India stays out of the country list on every stage.** The list was already `KR`, `US`, `JP` and
   "another country"; this records that India is left out on purpose (its cards register, but its rules
   need a mandate this design cannot create, so every monthly charge would be refused) and pins it with
   a test, so dev and production keep one list.
5. **The dollar price keeps no tax note.** Unchanged; the question stays open until dollars open.

## Alternatives

- **Open on the hostname alone**, adding `app.chatic.io` to the list. The smallest edit, and the one
  ADR-0227's rule was written to prevent: any build placed on that host, a dev one included, would take
  production's visitors to whatever server its addresses name.
- **Open on the build alone** (any host, when `VITE_ENV=PROD`). It would also open on the CDN's own
  address and any other name that serves the same files, where nothing is meant to be reached.
- **Hide non-Korean countries from W-08 in production.** Simpler on screen, but the picker would then
  differ by stage and a reader abroad would be billed in won without being told why; the notice says
  what is not available instead, the way the first version said it.
- **Leave dollars open and let the server refuse them.** The reader would pick a country, see a dollar
  amount, accept the terms and only then fail at the card — for something known in advance.
- **Wait for the server to refuse `?sandbox` on production.** It is the right second guard, and it is the
  server's to add; not sending the query is the guard this app can hold today.

## Consequences

- **The home header shows "Sign in" on the production host**, so a visitor can reach checkout before
  any announcement. That is accepted: opening the surface is not the public launch. The account paths
  still go in no sitemap, email or outside link, and the launch — with the refund policy and business
  text, the seller, and a confirmed real charge — is decided on its own.
- **The production gate depends on `VITE_ENV`.** The production deploy writes it from the same secrets
  as the addresses, which is what makes a build with production's addresses a production build. A build
  made by hand with production's addresses and no `VITE_ENV=PROD` stays shut on the production host,
  but runs the sandbox and dollars on a development host — the trap ADR-0263 already names.
- **Real charges are verified by people, not by this change.** The tests cover the gate, the sandbox
  guard, the won-only rule and the country list; the first charge at the end of a production trial, an
  upgrade difference, card changes and failed payments are checked by QA in production.
- **Production subscriptions are all in won**, so the dollar paths of W-12 (adding a card) and W-14 are
  not reached there. Opening dollars later means production dollar products and live keys on the
  server, the dollar provider account's own readiness, and the tax note — and then setting
  `foreignBilling` from something other than the build.
- **A reader in India can still pick "another country"** and name India in the dollar card field on a
  development stage; only the won-only rule shuts that path in production.
- **The release carries the membership read.** The pages read the subscription from the membership
  read since the change before this one; that change must reach production with this one or before it,
  because the server retires the old subscription read once it has.
