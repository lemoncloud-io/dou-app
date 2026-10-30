# ADR-0250: Landing reopens card management on the payment service's cards

> Status: Accepted · Decided: 2026-10-29
> · Decision 1 amended by [ADR-0255](./0255-landing-bills-outside-korea-in-dollars-through-its-own-card-dialog.md) (one default card per payment provider)
> Scope: `apps/landing` (`README.md` § The account surface, `src/app/features/subscription/lib/screens.tsx`,
> `pages/billing/PaymentMethodsPage.tsx`, `pages/billing/useCardWindowReturn.ts`,
> `lib/port/http/createHttpPort.ts`); the card calls in `libs/http` (`gateways/subscriptions.ts`) and
> `libs/data` (`SubscriptionHttpDataSource`, `SubscriptionRepository`)
> Amends: decision 7 of [ADR-0248](./0248-landing-account-surface-reaches-the-server-through-one-http-port.md)
> (the card and billing-email screens hidden, with the card changed in place on W-18). Its other
> decisions stand.

## Context

ADR-0248 hid W-12, the card list, because the subscription server held one card per account and had
nothing to list, pick or remove; a card was changed in place from W-18, the server replacing the one it
held. The payment service now keeps several cards per account: adding one leaves the default as it
was, one call makes a card the default, and another removes a card by its id — refusing the default
card and the card a subscription in use is charged to. The subscription server passes all three on
(`POST /subscriptions/0/card`, `card-default`, `card-delete`, the last two with `{ billkeyId }`).

Changing the card in place no longer does what its name says: adding a card does not make it the one
charged.

## Decision

1. **W-12 opens, the billing-email screens stay shut.** The single hidden value becomes two —
   `{ cards, emails }` — and the cards are open by default. W-12 lists the cards with the default marked
   as the server marks it, offers [Make default] and [Remove] on every other card, and adds a card
   through the same payer dialog and provider window as before. It is reached from the account menu
   and from W-18's card tile, which leads there instead of changing the card in place; a failed
   payment's button leads there too.
2. **The payment service decides what may go.** The default card has no [Remove], since the service
   refuses it; any other refusal is read as the remaining one — the card a subscription in use is
   charged to — and says so. No client rule second-guesses the server.
3. **Changing the card in place on W-18 is removed.** It is the flow W-12 now owns, and it had become
   an add that leaves the default alone.
4. **A phone's card window comes back to W-12.** The payer waits in session storage as before, and W-12
   reads the return.
5. **What has no server stays out.** Retrying a failed payment has none, so choosing a card while a
   payment is overdue is an ordinary default change, not the charge W-12 offers against the mock.

## Alternatives

- **Keep changing the card in place, and make the added card the default after it.** It keeps W-18's
  one-step flow, but takes the choice the server now leaves to the reader, and duplicates W-12.
- **Keep the client's removal rules** (the last card of a live subscription, the default card). They
  would agree with the server only by accident, and refuse what the server may allow.

## Consequences

- **A subscriber can now hold several cards**, pick the one charged and remove the others; a newly
  added card is not charged until it is made the default.
- **The billing-email screens remain the one thing hidden**, behind `emails`.
- **A refusal is shown as the in-use case.** If the payment service gains another reason to refuse a
  removal, the message has to grow with it.
