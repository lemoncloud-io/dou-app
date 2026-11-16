# ADR-0327: Landing opens dollar billing wherever the server lists dollar products

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/landing-production-dollars`
> · Scope: `apps/landing` (`README.md` § Billing outside Korea, § Plans before checkout opens, § Build and
> deploy; `src/app/features/subscription/lib/billingCountry.ts`, `hooks/foreignBilling.ts`,
> `lib/createPortSetup.ts`, `lib/port/PortProvider.tsx`, `pages/checkout/`, `pages/entry/PlansPage.tsx`)
> · Supersedes: decision 3 of [ADR-0311](./0311-landing-opens-the-account-surface-on-the-production-host-in-won-only.md)
> (a production build bills in won only, and lists won on W-01). Its other decisions stand — the
> production-host gate, no sandbox on the production host or in a production build, India left out of
> the country list, no tax note on a dollar price.
> · Amends: the "test mode only" consequence of
> [ADR-0262](./0262-landing-bills-outside-korea-in-dollars-through-its-own-card-dialog.md)
> · The module doc is [the landing README](../../apps/landing/README.md#billing-outside-korea)

## Context

ADR-0311 opened the account surface on `app.chatic.io` for a production build and kept dollars shut
there: the subscription server had dollar products on the dev stage only. It did that with a value fixed
when the build is made — `createPortSetup` set `foreignBilling` to `!productionBuild`, and the pages read
it through `useForeignBilling`. W-08 stopped any billing country but Korea at a notice, W-05 sent a
dollar checkout back to W-08, and W-01 listed won in every language, because a signed-in reader asking
the server for dollars got an empty catalog.

The server has now added its production dollar products. Opening dollars in production also needs the
payment server's live keys, a live webhook destination, and the dollar provider account's own readiness
— none of which this app can see. The server's product list is the one thing on that list the app can
read: it is what W-01 and the checkout already price from, through `GET /products/0/plans?platform=stripe`,
and the server answers it to a signed request only. The HTTP port already reads it once per provider per
page (`loadCatalog`).

## Decision

1. **Whether a checkout may be billed outside Korea is decided by the server's dollar catalog, and by
   nothing else.** With the reader's session, `GET /products/0/plans?platform=stripe` listing at least
   one product opens dollars; an empty list, a failed read and no session shut them. The build does not
   take part: a dev build follows the same rule (the dev server's dollar products keep it open, as it
   was). `foreignBillingOf` in `lib/billingCountry.ts` is the rule as a pure function, and
   `useForeignBilling` in `hooks/foreignBilling.ts` feeds it; `createPortSetup` and `PortProvider` no
   longer carry a billing flag.
2. **One answer for every page.** W-08's notice, W-05's refusal of a dollar checkout and a signed-in
   reader's W-01 currency all read the same `useForeignBilling`. Open: W-08 bills dollars, W-01 shows
   the language's currency. Shut: W-08 stops at the notice ADR-0311 introduced, W-05 sends a dollar
   checkout back, and W-01 lists won.
3. **Never open while being read; the pages wait instead of guessing.** The answer is `reading`,
   `open` or `shut`. While it is `reading`, W-08 shows nothing after a country outside Korea — no notice,
   no amount, no consents — and a dollar checkout handed back from W-05 (or handed to W-05) waits behind
   the page loader, because that state is read once and a guess of "shut" would empty it. W-01 waits
   too, for a signed-in reader whose language is not Korean, so the prices never switch from one
   currency to the other.
4. **No new server call.** The answer is asked for only where it changes what is shown — a signed-in
   W-01 in any language but Korean, and W-08 and W-05 once a country outside Korea is in play — so a
   checkout in Korea never asks. It is the dollar plans query itself, the same react-query key as
   `usePlans('USD')`, and the HTTP port keeps each provider's catalog for the page: a signed-in English
   reader's W-01 and the answer are one read, and W-08 after it reuses it.
5. **A visitor's W-01 is in the language's currency on every stage.** The server will not list products
   to a visitor, so there is nothing to judge by; the published catalog has dollars, and what is charged
   is decided after sign-in, on the checkout. This undoes the visitor half of ADR-0311's revision of
   decision 3.
6. **`VITE_ENV` keeps one job:** the sandbox guard of ADR-0311 decision 2. The landing `.env` gains
   nothing: the dollar provider's key still comes from the server's card registration answer.

## Alternatives

- **The build flag (`VITE_ENV`), as ADR-0311 had it, flipped in a release.** Simple, but it ties the
  opening to an app release that has to land after the server is ready, and the app cannot tell whether
  it is. A release ahead of the server would open a checkout that fails at the card.
- **A separate build-time switch** (a new `.env` value). The same ordering problem, plus a secret per
  stage for something the server already knows.
- **Judge the two pages separately** — W-01 by the published catalog, the checkout by the server. W-01
  could then show dollars that the checkout refuses, or won where it would take dollars. One answer
  cannot disagree with itself.
- **Treat `reading` as shut and render at once.** The rule says nothing is open while being read, but
  rendering the shut state first means a notice that disappears a moment later, a W-01 that switches
  from won to dollars, and a dollar checkout coming back from W-05 refused by a judgment made too early.
  Waiting keeps the same safety without showing a state that is about to be taken back.
- **Read the answer on every checkout page, up front.** Simpler — one loader before the form — but it
  adds a dollar catalog read to every checkout in Korea, which has no use for it, and holds the rest of
  the page behind it.
- **A port method of its own** (say, `canBillAbroad()`). It would read the same list; the existing
  `listPlans({ currency: 'USD' })` and its cache already answer it, and a second path to the same data
  is a second thing to keep in step.

## Consequences

- **In production, deploying this change is opening dollars**, because the server already lists
  production dollar products. The deploy is a person's decision, made after the payment server's live
  keys and live webhook are confirmed — not something this change can check.
- **The switch belongs to the server.** Should the production dollar products disappear (a server
  release that lacks them), dollars shut again on the next page load, with the notice back on W-08.
  Should they appear before the live keys or webhook, dollars open anyway and the card registration or
  the first charge fails — so the server adds them last.
- **A checkout outside Korea waits for one more read** — the dollar catalog, once per page load and
  cached after — that the HTTP port would make anyway to price it. A checkout in Korea does not.
- **The answer can come out differently on two pages after a failure.** A failed read is shut and is
  not kept, so the next page to ask reads again and may find dollars open. Each page still acts on one
  answer, and neither is ever open on a guess.
- **Dollar prices go live with no tax note.** ADR-0311 left the tax question open until dollars open;
  this change opens them in production while it is still open, so a dollar price stands without a VAT
  line, as it did on the dev stage. Settling it is a decision of its own.
- **A signed-in reader in a stage without dollars sees won on W-01** in every language, as before; a
  visitor there sees dollars and finds the notice at checkout. That is accepted: there is no session to
  ask the server with, and a visitor's prices are a price list, not a charge.
- **Real dollar payments are verified by people.** The tests cover the rule — open, shut on an empty
  list and on a failure, the wait while reading, W-01 and W-08 agreeing, and a visitor's currency — on
  the tests' fake server. A real card, the customer's statement, the webhook and a refund are checked by
  QA in production.
