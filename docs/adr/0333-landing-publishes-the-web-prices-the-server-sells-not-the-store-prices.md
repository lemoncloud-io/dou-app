# ADR-0333: Landing publishes the web prices the server sells, not the app stores' prices

> Status: Accepted · Decided: 2026-11-17 · Implemented: `fix/landing-web-prices`
> · Scope: `apps/landing` (`README.md` § Plans before checkout opens; `src/app/features/subscription/lib/catalog.ts`;
> the W-01 copy in `src/i18n/locales/subscription/`)
> · Amends: decision 4 of [ADR-0235](./0235-landing-lists-the-plans-on-every-host-before-checkout-opens.md)
> (the published catalog changes together with the stores' prices) and the dollar price in decision 6 of
> [ADR-0262](./0262-landing-bills-outside-korea-in-dollars-through-its-own-card-dialog.md) (the app
> stores' price outside Korea). Their other decisions stand.
> · The module doc is [the landing README](../../apps/landing/README.md#plans-before-checkout-opens)

## Context

The plans page shows a visitor the published catalog in `lib/catalog.ts`; a signed-in reader is shown
the subscription server's own products, and those are what a checkout charges. ADR-0235 made the
catalog a published price list that moves with the app stores' prices, and ADR-0262 took the dollar
price from the stores as well — ₩8,600 and $6 a cloud — because the web and the stores sold at one price.

The subscription server has now set its own web prices: ₩8,900 and $6.80 a cloud, for won and dollar
products alike, in development and production, with the store prices left as they were. From then on
a visitor read ₩8,600 or $6.00 on W-01 and, once signed in, was charged ₩8,900 or $6.80; and W-01 still
said the web had the same prices as the app.

## Decision

1. **The published catalog follows the web products the server sells.** `PRICE_PER_TIER` is ₩8,900 and
   $6.80 (680 cents) a cloud — the server's production web prices — and a change to one is a change to
   the other. The app stores' prices no longer set it.
2. **W-01 no longer claims the app's prices.** The subtitle keeps the trial and the monthly renewal
   only, and the note beside the store links says the app is where one can subscribe for now, without
   "the same price".

## Alternatives

- **Keep the store prices on the published catalog.** A visitor would keep reading one price and paying
  another after sign-in.
- **Read the server's prices for visitors too.** The server lists its products to a signed request only,
  so a visitor has no server answer to read; the published catalog stays the visitor's price list.
- **Keep "same prices as in the app" and change the stores instead.** That is a pricing decision outside
  this app; the server has already decided the web prices differ.

## Consequences

- **The published catalog is a copy of the server's web prices** and goes stale whenever they change.
  Nothing checks the two against each other; whoever changes the server's web prices changes this file
  with them.
- **The web costs more than the stores** (₩8,900 against the stores' won price, $6.80 against $6). The
  plans page no longer says otherwise, and does not say how they compare either.
- **The tests' fake server sells the catalog**, so every screen test that reads a price now reads the
  web prices.
