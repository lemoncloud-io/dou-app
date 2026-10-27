# ADR-0235: Landing lists the plans on every host before checkout opens

> Status: Accepted · Decided: 2026-10-27
> Scope: `apps/landing` (`README.md` principle 10 and § Plans before checkout opens,
> `src/app/routes/CommonRoutes.tsx`, `src/app/config/stage.ts`, `src/app/features/subscription/`)
> Amends: decision 5 of [ADR-0227](./0227-landing-serves-a-public-surface-and-a-signed-in-subscription-surface.md)
> (the account surface shut where it is not ready). Its other decisions stand unchanged.

## Context

ADR-0227 kept the whole account surface, `/subscription/*`, off the production host until it could
take a real payment: a real port behind it, the payment provider, sign-in, and the policy and business
text. Until then every link into it rendered only on local and `-dev` hosts.

That ordering cannot be followed as written. A payment provider and the card companies review the
merchant's live site **before** they let it take a payment: they look for what is sold and at what
price, the refund policy, the terms, and the business details. The business details are already in
the footer and the policies already on every host, but the prices were only on the plans page, which
did not exist on the production host. Checkout cannot open until the review passes, and the review
cannot pass while the prices are hidden.

The plans page is also the one page of that surface that needs nothing from a server to tell the
truth to a stranger: a visitor sees the same plans, prices and notes whoever they are.

## Decision

1. **`/subscription/plans` is registered on every host.** Where `isSubscriptionAccountEnabled` (the
   ADR-0227 gate, renamed from `isSubscriptionWebEnabled` so its name says which part it gates) is
   false, the route table mounts `SubscriptionRoutes` at that path alone, with `account={false}`.
   Every other `/subscription/*` path stays unregistered and falls to the catch-all, as before.
2. **There it runs on a catalog port, not the mock.** The catalog port answers no session, lists the
   plans from `lib/catalog.ts`, and rejects every other method as it would for a visitor. The mock is
   not created on that host, so `?mock=` and session storage are not read there.
3. **It offers nothing that does not exist on that host.** The plan cards are not pickable, the
   subscribe button is replaced by "web checkout is coming" and the two store links, the frame drops
   "Manage subscription" and "Sign in", and the phone notice drops "subscribe from a computer".
4. **The prices have one home, `lib/catalog.ts`, which both ports read.** It is a published price list,
   changed together with the stores' prices — not mock data that happens to be shown.
5. **The home header's "View plans" shows on every host**; "Sign in" still follows the gate.

## Alternatives

- **Open the whole account surface on the production host, on the mock.** A stranger would reach a
  stand-in sign-in and a checkout that "succeeds" without charging anything. It misleads real visitors
  and the reviewer alike.
- **A review-only door to the account surface** (a secret query, or an allow-listed address). Hiding
  is not protecting, the mock would still ship to strangers who find the door, and the reviewer would
  still be shown a checkout that is not real.
- **A separate static price page on the public surface** (`/plans`, outside `/subscription`). It
  keeps the account surface untouched, but it is a second page for the same plans that has to be kept
  in step with W-01, at a URL that changes when checkout opens — the reviewer would have approved a
  page that is then replaced.
- **Prices on the home page only.** The home page's pricing block describes a free and a paid plan,
  not the five tiers and their monthly prices, and adding them there duplicates W-01 the same way.

## Consequences

- **The account surface's lazy chunk now loads on the production host**, for the plans page only. It
  carries the mock's code, which is never run there; the session, data layer and copy still load
  only when that page is opened, never with the public pages.
- **The plans URL the reviewer sees is the one checkout will use.** Opening checkout later turns the
  gate on; the page, its URL and its prices stay as they were reviewed.
- **A price change is a published change**, made in `lib/catalog.ts` and in the stores together.
- **The boundary checks are unchanged.** The route table's lazy import is still the one crossing, and
  the route table test now holds the plans row on the shut side.
