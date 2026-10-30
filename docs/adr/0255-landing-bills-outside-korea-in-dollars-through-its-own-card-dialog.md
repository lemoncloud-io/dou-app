# ADR-0255: Landing bills outside Korea in dollars, through a card field in its own dialog

> Status: Accepted · Decided: 2026-10-30
> Scope: `apps/landing` (`README.md` § The server, `src/app/features/subscription/lib/billingCountry.ts`,
> `lib/paymentMethods.ts`, `lib/port/cardEntry.ts`, `lib/port/http/`, `components/CardEntryWindow.tsx`,
> `pages/checkout/CheckoutPage.tsx`, `pages/billing/PaymentMethodsPage.tsx`); the root `package.json`
> (`@stripe/stripe-js`)
> Builds on: [ADR-0248](./0248-landing-account-surface-reaches-the-server-through-one-http-port.md) (one HTTP
> port, the payment SDK inside it)
> Amends: decision 1 of [ADR-0250](./0250-landing-reopens-card-management-on-the-payment-services-cards.md)
> (one default card, as the server marks it): each provider now has a default of its own. Its other
> decisions stand.

## Context

The web subscription was billed through one payment provider, in won, with a Korean card company behind
it. DoU is sold internationally, and the subscription server now has a second provider, Stripe, selling
the same five tiers as products of its own (`platform=stripe`), priced in US dollars. Its card
registration answer (`issue`) is a union by `provider`: the won provider still opens its own window with
a store and a channel, while Stripe hands over a publishable key and a setup intent's client secret for a
card field that goes inside the merchant's page. The payment service lists every provider's cards in one
list, with one default per provider, and reports a card's expiry where the provider gives one.

Three things the account surface took for granted stopped being true at once: that an account has one
default card, that every amount is in won (the dollar prices arrive in cents — `600` is $6), and that a
card is always typed into the provider's own window.

## Decision

1. **The billing country decides the provider, and the screens never name one.** W-08 asks for the
   billing country first, and starts with none chosen. Korea is billed in won through the won provider;
   every other country in US dollars through Stripe. The page says the country and the currency ("You
   pay in US dollars ($)") and nothing else: no provider name and no "domestic / overseas card" anywhere
   in the copy. The port maps the country to the provider (`providerOfCountry`); a plan is the same
   `PlanId` either way, and the HTTP port pairs each provider's products by tier.
2. **The payer is asked for in Korea only.** The won provider's card company needs the holder's name,
   mobile number and email when the card is registered and again with every charge on it, so W-08 and
   W-12's add-card dialog ask for them there and require them. Stripe needs none of them — its field
   asks for the country and postal code itself — so outside Korea there are no payer fields. The port
   checks the `issue` answer's `required` list and refuses (`invalid`) rather than open a window that would
   fail behind it.
3. **Stripe's card field sits in a dialog of ours.** The Payment Element is mounted inside
   `CardEntryWindow`, under our own consent line — the recurring charge, when it first falls and how often,
   the amount, and how to cancel — and the card is registered with `confirmSetup` only once that is
   ticked. The port reaches the dialog through a small channel (`lib/port/cardEntry.ts`) that names no
   provider, so `@stripe/` is imported in `lib/port/http/` alone, beside the won provider's SDK, and the
   boundary check covers it. The keys come from the `issue` answer and are never configured, stored or
   logged. The dialog is not modal, because the card's 3-D Secure check opens over the page outside it;
   the dialog cannot be closed while a confirmation runs.
4. **Cards are grouped by provider, and "the card" means the subscription's provider's default.** A
   subscription is charged by one provider and only that provider's cards can pay it. W-12 lists the
   provider in use first and the other under a heading named by currency; W-18, W-14 and W-09 show the
   default of the subscription's own provider; the removal rule counts only that provider's cards. A card
   added later goes to the subscription's provider, and the dialog shows the billing country as fixed.
5. **Amounts are in the currency's minor unit.** `Money.amount` is carried as the server sends it, and
   `formatMoney` divides by the currency's fraction digits. Nothing else converts.
6. **W-01 prices the plans in the page language's currency.** Korean readers see won, everyone else
   dollars, from a published catalog that now holds both (the dollar price is the app stores' price
   outside Korea). A subscriber sees their own subscription's currency. What a checkout charges is the
   billing country's, shown on W-08.

## Alternatives

- **Split by the kind of card (domestic / overseas) and let the reader pick.** It names the providers'
  split on screen and asks a question most readers cannot answer; the billing country is one they can, and
  it also settles the currency.
- **Stripe's hosted Checkout page instead of a field in our dialog.** It would take the card off our
  page, but leaves the site for a page of Stripe's, puts its own consent and look in place of ours, and
  needs a return route the won provider's flow does not share.
- **Stripe Subscriptions instead of a saved card the server charges.** It would cover Indian
  e-mandates, but moves the billing schedule, proration and the trial out of the subscription server,
  which keeps them for both providers today.

## Consequences

- **A running subscription cannot change currency.** Plan changes and new cards stay with its provider.
  Moving between the two is out of scope; the server keeps one subscription per account anyway.
- **W-08 never shows a fixed country.** It only opens for a first subscription — a subscriber is sent to
  the plan change — so the "held to its country" display lives in W-12's add-card dialog.
- **Consent is shown and required, not recorded.** Keeping a record of the agreement is a decision for
  before taking live payments.
- **India-issued cards register but will be refused monthly.** Indian rules require an e-mandate for
  charges made without the customer present, and Stripe creates one only for its own Subscriptions
  product, which this design does not use. Whether to keep India out of the country list is a decision
  for before going live.
- **A dollar price carries no VAT note.** Won prices include VAT and say so; how tax applies outside
  Korea is not settled, so the dollar price stands alone until it is.
- **Test mode only.** The dollar products exist on the dev stage alone, and the account surface's
  production gate is unchanged.
- **The mock keeps one stand-in window for both providers.** Against the mock, a non-Korean checkout runs
  through the same stand-in dialog; the Stripe field itself is exercised only against the dev server.
