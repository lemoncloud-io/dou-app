# ADR-0060: Move subscription tier and cloud quota to the server product list, and open in-app adjacent-step tier changes

> Status: Accepted · Decided: 2026-08-13
> Related: [ADR-0042](./0042-account-linking-unified-path-migration.md) (social-linking eligibility) ·
> [ADR-0046](./0046-web-feature-ownership-and-barrel-hygiene.md) (feature ownership · barrel hygiene) ·
> [ADR-0034](./0034-relay-home-cloud-sheet-and-cloud-guide-redesign.md) (cloud sheet · cloud guide screens)
>
> Product canon: `plan/features/subscription/` (README · product-pricing · purchase-flow ·
> subscription-lifecycle) · `plan/features/cloud.md` · Backend canon:
> `chatic-backend-api/docs/spec/subscription/`

## Context

Product has settled on **a single DoU Pro product, tier 1–5 = 1 to 5 clouds held at once**. But the app is
stuck selling only tier1. Cross-checking code against the server shows the bottleneck sits entirely on the
app side.

### 1. The server already has tiers 1–5 ready

`chatic-backend-api`'s `data/product-config.json` has all **20 products registered** across apple ·
google × dev · prod × tier1–5. `maxClouds` runs 1–5, `sort` runs 1–5, and `trialDays` is 7 only for tier1
and 0 for every tier above it.

`GET /products/plans?platform=` filters on **both** `platform` and `stage` (the `.dev` suffix from
`application`) (`proxy.ts` `listPlans`). In other words, no server work is needed to sell tier2–5.

### 2. The app never reads that list — it narrows to one constant instead

- `ALLOWED_PRODUCT_ID_IOS/ANDROID` is **duplicated** across `features/subscription/consts/index.ts` and
  `features/home/components/subscription-select/helpers.ts`.
- The quota is hardcoded in two places: `MAX_CLOUDS = 1` (`features/home/hooks/useAddCloudFlow.tsx`) and
  `clouds.length >= 1` (`SubscriptionPlansPage.tsx`).
- The comment that justifies this narrowing — in `useAllowedProduct.ts`, "`GET /products/plans` does not
  filter by platform" — is **wrong**. The server does filter. One false premise has been blocking tier
  expansion.

### 3. Web is the only surface missing a tier-change path

The native `SubscriptionIapService` already tells upgrades from downgrades via `getReplacementMode()`, and
the bridge contract (`PurchasePayload`) is already defined to carry `oldPlanId`/`newPlanId`. But
`useSubscriptionIap.purchaseAndValidate` never passes `oldPlanId`. On Android, without this value the
purchase goes through as a new subscription instead of a plan swap.

### 4. Nothing enforces the adjacent-step constraint

`calcNeededClouds` only computes `maxClouds - cloudNo`; it never checks for a tier jump. Both stores also
allow rank jumps. So the **adjacent constraint is purely app policy**, and its practical reason is that
each cloud carries its own email verification — a tier1→tier3 jump would force two verifications back to
back.

### 5. Email reuse is not "undecided" — it is half-blocked in code already

The backend's `verifyEmail` `confirm` step records only **one** `verify$.cloudId` on the email-account
record, and `release` uses that pointer to clean up the cascade (`proxy.ts:190`, `:356`). Verifying a
second cloud with the same email throws no exception, but it overwrites the first cloud's pointer and
misaligns the release cascade. Neither allowed nor blocked. Product docs listed this as "a precondition for
selling tier 2+," and the code carries the same unfinished state.

### 6. Nothing cleans up clouds over quota

The app only has a release call (`useDeleteCloud`) — no post-downgrade selection or grace-period flow. The
server has no automatic cleanup either. Once a downgrade is confirmed, the quota shrinks but the
over-quota clouds stay `active`.

### Constraints

- **Screens are out of this scope.** API wiring and decision logic come first; screens will be a follow-up
  track that consumes these hooks and functions.
- `libs/subscriptions` is an empty barrel re-exporting web-core, but `apps/desktop-web/.../useRemoveCloud.ts`
  consumes it. desktop-web is reference-only, so the barrel cannot be deleted.
- The production product config has a **typo**: `pro-tier-04`'s `planId` is `prdou_pro_subscription`
  (every other tier is `dou_pro_subscription`). tier4 Android production purchases are broken. The app
  cannot work around this.
- Product and backend docs contradict each other on downgrade distance: `product-pricing.md` says "any
  number of steps at once," while `scenario.md` §3 says "only one step down."

## Decision

### 1. Make the server product list the single source for the tier list, quota, and rank

Retire the `ALLOWED_PRODUCT_ID_*` constants (both duplicated pairs), `MAX_CLOUDS = 1`, and
`clouds.length >= 1`.

| Value               | New source                                                        |
| ------------------- | ----------------------------------------------------------------- |
| Sellable tier list  | The full result of `GET /products/plans?platform=apple\|google`   |
| Cloud-holding quota | `membership.product$.maxClouds`                                   |
| Tier rank           | `product.sort`                                                    |
| Free-trial length   | `product.trialDays` (0 falls back to copy that omits a day count) |

Quota checking is consolidated into **a single hook**, and every "+ Add cloud" entry point uses only that
hook. Per product's policy, the button is not hidden — it explains why once the ceiling is hit.

This decision naturally resolves product's open question "who owns the product list" as **the server** —
changing tier composition, pricing, or trial copy no longer needs an app release.

### 2. Open tier changes in both directions from the app's own plan-selection screen

Both upgrade and downgrade start in the app. Neither is handed off to the store's own subscription
management.

- **This track allows only an adjacent one-step move, in either direction** (only products whose `sort`
  differs by 1 are selectable).
- Android plan swaps must **always include `oldPlanId`** in the purchase call. Without it, the purchase is
  treated as new.
- **Tier changes always use `androidOfferToken.base`.** The current `freeTrial ?? base` assumes a fresh
  subscription; the trial is a one-time thing for a first tier1 subscription only.
- Billing behavior differs by platform (iOS does a prorated refund then charges the full new price
  immediately and resets the renewal date; Android charges the difference immediately and keeps the
  billing cycle), so the notice copy branches by platform.

Locking downgrades to one adjacent step is **a narrowing of product's own policy (which allows multiple
steps), scoped to this track only**. It is a safeguard against creating more than one over-quota cloud
while there is no cancellation-execution UI; the lock lifts once that UI exists.

### 3. Cloud email requires a fresh email per cloud

This assumes the backend's account↔cloud 1:1 pointer structure as-is. The app cross-checks the entered
email against the list of emails already used by owned clouds and **rejects reuse at input time**, with an
explanation — rather than waiting for a 409 after the verification code has already been sent.

If the backend later changes account↔cloud to 1:N, this decision reverses.

### 4. Over-quota clouds are only detected and surfaced, not cleaned up

The "count held > maxClouds" check and identification of the over-quota clouds are pure functions exposed
through a hook. **Release execution still goes through the existing `useDeleteCloud` path**, and a
dedicated selection screen for over-quota cleanup is left to a follow-up screen track.

The reasoning is that irreversible deletion should not be pushed through by app logic on its own. But as
long as the server has no automatic cleanup, an invisible over-quota state becomes silent revenue leakage
— so **surfacing the detection result is not left out.**

### 5. Fix subscription-state classification into four pure-function states

Product's four states (unsubscribed / active / cancellation scheduled / expired) collapse into one
function computed on `MembershipView`.

- **A failed-payment grace period is not a separate state — it counts as "active,"** because the valid
  period has not yet ended. There is no app-side cutoff like "N days after a failed payment."
    - Along with the state, this computes days remaining for a trial, the end date for a scheduled
      cancellation, and — when there is a `pendingProductId` — "changes on next renewal."

`SubscriptionPage` currently branches on `isActive || isExpired`, so a scheduled-cancellation-only state
falls into the empty state. Splitting classification into a function keeps screens from re-implementing
this branch.

### 6. Pure domain logic lives only in `apps/web/features/subscription`

Tier rank, adjacency checks, over-quota checks, the four-way state classification, and trial-copy fallback
all live in this one feature. APIs and hooks stay as they are in `libs/web-core`. The `libs/subscriptions`
barrel has a desktop-web consumer, so it is **left untouched.**

Accordingly, `SubscriptionSelectDialog` and `subscription-select/helpers.ts` move from `features/home` to
`features/subscription`. ADR-0046 left that dialog under "home only" because it had no external references
at the time, and now that it has a tier-domain dependency, the same ADR's ownership rule (a domain
dependency belongs to that domain's feature) applies. This move also removes the constant duplication.

### 7. The validation path and DEV dryRun stay as they are

Keep the double call `POST /validate/{platform}` → `POST /memberships/0` as is. Keep DEV's `dryRun: 1` as
is.

### Out of scope

- Over-quota cleanup execution UI, grace-period length, automatic cleanup criteria — server-owned plus a
  follow-up screen track
- Server-side periodic re-check (CRON) — backend-owned. `GET /memberships/0/mine` defaults to `detail=1`,
  so **app-triggered re-checking already happens** and the app has nothing further to do
- Real-time refund clawback, admin forced-cancellation priority — undecided on the backend
- All screen work (subscription card, tier comparison, subscription management screen redesign)

## Alternatives

**Consolidate into a single `POST /memberships/0` path** — dropped. The backend's `doPost` already
synchronously calls iap-api validate internally and, with `auto=1` by default, enqueues the cloud make —
so the app's direct iap call is redundant, and the iap endpoint could in principle be removed from the
app's surface. But consolidating makes it harder for the app to explain the specific reason for a store
validation failure. Right after purchase is when a user is most on edge, so we chose to keep the failure
distinction over saving one call. What is accepted: two calls, and duplicate server-side validation.

**Materialize `libs/subscriptions` or merge it into `libs/web-core`** — dropped. Either way widens the
surface shared with desktop-web. desktop-web is reference-only and carries pre-existing type debt, so this
track's changes should not create a risk of shaking that build.

**Follow product's policy and allow multi-step downgrades** — dropped. tier5→tier1 creates four over-quota
clouds at once, and while there is no cancellation-execution UI, the user has no way to clean them up
themselves. A screen that demands several irreversible deletions at once opens only once that screen is
ready.

**Have the app poll instead of a server periodic re-check** — dropped. The problem case is a user who
never opens the app — app-side polling structurally cannot reach that user. This is the server's job.

**Replace the `ANDROID_PLAN_LIST` env-order dependency with server `sort`** — out of this scope. Native
`getReplacementMode` computes rank from the env list's order, so if that order drifts from tier order,
upgrade/downgrade flips. Fixing it needs a bridge-contract change that carries `replacementMode` directly.
For now we only make sure `oldPlanId` is passed correctly so the check holds, and record this as debt.

## Consequences

**What is gained**

- The tier1 hardcoding and constant duplication disappear, and tier2–5 sales open with no server work.
- Changing product composition, pricing, or trial copy no longer needs an app release.
- Quota checking and state classification each live in one place, so adding entry points does not
  fragment the rules.
- Tier changes move into the app, giving a home for downgrade pre-notices and over-quota warnings.

**Trade-offs accepted**

- **The adjacent one-step downgrade limit differs from product policy.** This must be recorded as an
  exception in product docs, and it remains unsettled which of backend `scenario.md` §3 ("only one step
  down") or product's "multiple steps" is canonical.
- **Reaching tier5 needs 5 emails.** This friction on upgrading is large and cuts conversion. Until the
  backend's account↔cloud 1:N fix lands, this friction is the practical ceiling on tier2+ sales.
- **Over-quota clouds are only detected and left as is.** Until server-side automatic cleanup ships, a
  window remains where "billed for tier1 but still using more clouds" persists. Surfacing the detection
  result is the entire mitigation for now.
- **Keeping DEV dryRun means the tier2–5 cloud-creation path is never verified in dev.** The first
  production purchase effectively becomes the first real test. A separate verification pass must be
  planned before the production release.
- The `ANDROID_PLAN_LIST` env-order dependency remains.
- Double validation remains, so store validation runs twice.

**Handed off to other teams**

- Backend: fix the production `pro-tier-04` `planId` typo (`prdou_pro_subscription`) — **tier4 Android
  production purchases are currently broken** and the app cannot work around it.
- Backend: align `scenario.md` §3's downgrade-distance wording with product docs.
- Backend: whether account↔cloud 1:N (email reuse) will be supported — this determines the ceiling on
  tier2+ conversion.
- Backend: periodic re-check CRON and automatic cloud cleanup on expiry.

## Correction found during implementation (2026-08-13)

The implementation track found three of this ADR's premises did not match the code. The decisions
themselves stand; only the mechanism changes. Detail is canonical in
[tier-and-quota.md](../../apps/web/docs/feature/subscription/tier-and-quota.md).

1. **Quota source.** Decision 1's table listed the cloud quota as `membership.product$.maxClouds`, but the
   backend only attaches the product as a head (`proxy.ts:1060` `asHead`). `ProductHead` has no
   `maxClouds`, and `MembershipView.product$` is typed as the broader `ProductView`, so **it type-checks
   and then silently becomes `undefined` at runtime.** The real source is `membership.productId` joined
   against the result of `GET /products/plans`.
2. **Eligibility during a scheduled cancellation.** The backend's `isValid` is false whenever
   `canceledAt > 0` (`proxy.ts:717`). Using this value to judge eligibility during the scheduled-
   cancellation window would flag held clouds as over-quota during a period that is still paid for.
   Eligibility is judged by remaining valid period instead, and **only new cloud creation** is blocked by
   the same criterion the server's `guardQuota` uses (`isValid`).
3. **One purchase = one cloud.** `POST /memberships/0` enqueues `clouds/{userId}/make` once, with the one
   email in the body, whenever `needed > 0`. So even after selling tier2–5, the app had no path to create a
   second or later cloud. `POST /clouds/0/make` (`makeCloud`/`useMakeCloud`) was added to `libs/web-core`
   for this. This is the precondition for decision 1's "tier2–5 sales open" to actually hold.

## Decision reversal: remove membership-validation DEV dryRun (2026-08-19)

Decision 7 ("keep DEV `dryRun: 1` as is") is reversed. `POST /memberships/0`'s `dryRun` made the server
skip actually granting the membership, so **on dev builds, an iOS sandbox purchase could succeed while the
subscription never reflected in the app.** Purchase restore goes through the same path, so it was disabled
too. The risk noted earlier — "production first purchase effectively becomes the first real test" — turned
into an actual cost.

`dryRun` is dropped from the `validateMembership` call in `apps/web/.../hooks/useSubscriptionIap.ts`. On
dev, the subscription is now actually granted, and the first cloud make it triggers is actually enqueued
too.

`useAddCloud`'s `dryRun` **stays.** This is the path for adding a cloud beyond the first on tier2+, and
decision 7's original intent — "dev does not provision real infrastructure" — still holds there. As a
result, dev now really verifies the subscription itself and the first cloud, while creating a second or
later cloud remains unverified.

## Next steps

Implementation is complete ([tier-and-quota.md](../../apps/web/docs/feature/subscription/tier-and-quota.md)).
Screen work is a separate track that will consume the hooks and pure functions this track exports.
