# ADR-0350: Landing asks the payer for an address the account does not have

> Status: Accepted · Decided: 2026-11-19
> Scope: `apps/landing` (`README.md` § The account surface and the payer notes,
> `src/app/features/subscription/lib/payer.ts`, `components/PayerFields.tsx`,
> `pages/checkout/CheckoutPage.tsx`, `pages/billing/PaymentMethodsPage.tsx`)
> Amends: decision 7 of [ADR-0248](./0248-landing-account-surface-reaches-the-server-through-one-http-port.md)
> (with the billing-email screens hidden, the card company gets the signed-in account's own address).
> Its other decisions stand.

## Context

The won provider's card company will not register a card without the holder's name, mobile number and
email address. ADR-0248 hid the billing-email screens and handed the card company the signed-in
account's own address instead; an account with none was shown a warning and could not go on.

That was meant for the rare account without an address — an Apple sign-in that withheld it. It became
the common case once landing signed in the way the apps do, exchanging the provider's code with a
session (`verify-oauth-code`): that path finds the user by the provider's account id and keeps only a
masked hint of the provider's address on the social account, never the address on the user. An
account that first signed in from the app, or first reached landing after the switch, carries no
address, and checkout stopped dead for it in Korea — the only country billed today.

## Decision

1. **Where no address is known, the payer fields ask for one.** `PayerFields` takes `askEmail` and
   shows an email field under the name and number; W-08 and W-12's add-card dialog set it when neither
   a verified billing email nor the account's own address is there.
2. **A known address always wins.** `payerEmailOf` hands the card company the known address first and
   the typed one only when there is none, and only once it is shaped like an address (trimmed). An
   account that has an address sees no new field.
3. **The typed address is treated like the name and number.** It is not verified and not kept: it
   travels with that checkout or card — through the phone's card window and back from W-05 — and the
   next card asks again.

## Alternatives

- **Keep turning the account away.** Correct about what the card company needs, but it closed web
  checkout to most accounts, with no way on from the page.
- **Verify the typed address by code first.** That is W-24, which has no server while the billing-email
  screens are hidden; building half of it here would duplicate it.
- **Have the server keep the provider's address on the user again.** It undoes the server's choice to
  keep only a masked hint, and helps only after the next sign-in; it is a separate decision for the
  server.
- **Keep the typed address in the browser.** Saves typing, but it is personal data kept for a form the
  card company asks for again anyway — the reason ADR-0248 did not keep the payer either.

## Consequences

- **Checkout opens again for an account without an address**, at the cost of one more field for it.
- **An unverified address reaches the card company.** A typo is not caught beyond its shape; whatever
  the card company or the provider sends goes there. Where receipts go is the server's and the
  provider's business, and the page makes no promise about it for a typed address.
- **Opening the billing-email screens replaces this.** With them open, W-08 sends an account without a
  verified address to W-24 first, so the field never shows; the code path stays for the hidden case.
