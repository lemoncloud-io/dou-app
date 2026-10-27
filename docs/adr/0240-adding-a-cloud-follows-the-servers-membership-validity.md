# ADR-0240: Adding a cloud follows the server's membership validity

> Status: Accepted · Decided: 2026-10-27
> · Scope: `apps/web/src/app/features/subscription` (`lib/quota.ts`, `hooks/useCloudQuota.ts`,
> `components/AddCloudFlowHost.tsx`, module `README.md` § 2 · § 3)
> · Amends: Context item 2 of [ADR-0060](./0060-subscription-tier-quota-from-server.md) (eligibility
> during a scheduled cancellation). Its other items and decisions stand unchanged.

## Context

ADR-0060 said new cloud creation would be blocked "by the same criterion the server's `guardQuota`
uses (`isValid`)". The app never read that flag for it. It refused on its own `cancelScheduled`
state instead, and that state merges two different endings:

- **Auto-renew turned off.** The user stopped the next renewal; the period they paid for runs on.
  The store reports `autoRenewing: false` and no cancellation time.
- **Cancelled outright.** A refund, a revocation, or a cancellation the store made. The store
  reports a cancellation time, the relay stores it as `canceledAt`, and the membership's `status`
  becomes `canceled`.

The server's `isValid` is false only for the second — it turns false on a set `canceledAt` or a
passed `validUntil`, and the receipt service sets `canceledAt` for a revocation or an involuntary
cancellation, never for a user turning renewal off. So someone who had only turned auto-renew off was
told "cancellation is scheduled" and refused a cloud the server would have created. The product's
definition of a subscriber includes that person until the period ends, and so does its rule for adding
a cloud.

## Decision

1. **The add-cloud gate reads `isValid` from the membership response** (`GET /memberships/0`) and
   refuses only on a definite `false`, with its own reason (`canceled`) and copy. `undefined` — the
   response has not been read — refuses nothing; the inputs-loading rule already holds the verdict
   until it lands.
2. **The five states and everything they drive are unchanged.** "Ending" is still shown for both
   endings, with its banner and status word; entitlement and the allowance still follow the paid
   window, never `isValid`. Only the provisioning gate moved.
3. **The app does not combine `autoRenewing`, `status` and `canceledAt` itself** to reach the same
   answer. The server already derives `isValid` from them, alongside the admin override, at query
   time; a second derivation in the client is a rule that drifts.

## Alternatives

- **Keep refusing every ending subscription.** Simple and never wrong in the direction of a 403, but
  it refuses a paying subscriber what the server and the product both allow.
- **Split `cancelScheduled` into two states.** The screens do not need the distinction — both read
  "ending" — and a sixth state would ripple through every switch on the five for the sake of one gate.
- **Derive the answer from `canceledAt` on the client.** The view carries it, but it is one of
  several inputs to the server's judgement (expiry and the admin override are the others); copying
  the derivation means keeping two copies in step.

## Consequences

- An ending subscription can add clouds up to its allowance; a refunded or revoked one sees
  "구독이 취소되어 클라우드를 추가할 수 없어요." instead of the old "해지 예약" line, which is gone.
- The gate now depends on `isValid` keeping its meaning. If the receipt service ever starts setting
  `canceledAt` when a user turns renewal off, ending subscribers are refused again — correctly by the
  server's own rule, but with copy that says "cancelled". The module README states what the flag means
  so that change is noticed rather than inherited.
- `useCloudQuota` reads the membership query directly. It is the same query `usePlanCatalog` runs, so
  no request is added.
