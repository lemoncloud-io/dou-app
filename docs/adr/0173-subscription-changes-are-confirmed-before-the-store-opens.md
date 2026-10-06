# ADR-0173: Subscription changes are confirmed before the store opens, and the user chooses the clouds a downgrade keeps

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/subscription-screens`
> · Scope: apps/web `features/subscription` (list, detail, picker, confirm, keep screens; `lib/scene.ts`,
> `lib/keepClouds.ts`, `stores/useRestoredSignal`), `features/mypage` (`MyPage` entry), `libs/http` +
> `libs/data` (`markDrops`), `libs/web-ui-kit` `composites/subscription` (`StatusBanner`, `ProductCard`,
> `KeyValueRows`, `SelectableCard`)
> · The module doc is [apps/web subscription](../../apps/web/docs/feature/subscription/README.md)
> · Narrows [ADR-0091](./0091-relay-home-cloud-sheet-and-cloud-guide-redesign.md) §4 (MyPage entry)

## Context

The subscription screens were correct and hard to read. One screen listed the five membership states
as a coloured border and nine label rows, so a scheduled cancellation, an expiry and a queued
downgrade differed by one line in a table. Tapping a tier on the picker opened the store sheet at
once: nothing said, before paying, that an upgrade is charged now and a downgrade waits for the next
renewal, or what either would cost.

A downgrade also left the user with no say in what remained. The relay holds the clouds past the new
allowance when the downgrade lands, and since 2026-08 it has accepted the user's choice of which to
give up (`POST /memberships/0/drops`, `state$.plan = 'drop'`); the app never called it. What it did
instead was guess — `findExcessClouds` named the newest clouds as the excess, and a banner said the
guess might be wrong.

A redesign drew the flow as a list, a detail with one status banner, a slimmer picker, a confirmation
step before the store, a completion screen, and a keep-clouds screen. Three of its scenes show values
the relay does not provide: a payment-failure banner with a countdown (the membership state has
`period` and `cancel` axes only, no grace signal), past subscriptions in the list (the membership
list is admin-only), and a refunded amount (a membership carries no amounts).

## Decision

### 1. The flow is six screens and only one of them opens the store

`/subscription` (list) → `detail` → `guide` → `plans` (choose) → `confirm` (what the change does, then
the store) → `keep` (after a downgrade). The picker only chooses; `confirm` is the only screen that
mounts `useTierPurchase`, so the store's answer has one listener. `purchaseTier` resolves to the
membership the relay validated and the completion dialog draws from it. Leaving the dialog replaces
the flow in history.

### 2. One banner, chosen by priority; one name for `validUntil` per state

`deriveBanner` picks block › expiry › scheduled ending › restored › renewal reminder, and
`deriveInfoRows` names `validUntil` as the next payment, the end date or the expiry date by state.
Tapping the banner opens the store's subscription management. "Restored" is shown only when the app
saw an ending turn into a running plan within the session; the relay keeps no such flag. The expired
banner promises the old clouds back only within the relay's 30-day hold.

### 3. The user chooses the clouds to keep; the app sends the rest as drops

`KeepCloudsPage` asks which clouds stay — the choice a person makes — and sends every other candidate
to `drops`, whose list is the final state. Marks are read from `state$.plan` only. Held clouds are
reported from `state$.hold`, and the app-side excess guess (`findExcessClouds`, `ExcessCloudBanner`,
`useExcessClouds`) is removed.

### 4. MyPage always opens the list

The list has a state for everyone, including an empty one that leads to the guide, so the row no
longer branches on `isValid` (see ADR-0091, revision 3).

### 5. Scenes without data are not drawn

The payment-failure banner, past subscriptions and the refunded amount are left out, not stubbed. They
return when the relay exposes the data.

### 6. A subscription is changed only on the store that bills it

Opened on the other store's device (bought on Google Play, opened on iOS, or the reverse), the
picker recognises the plan in force by its tier and refuses every other tier with the `otherStore`
refusal. The detail screen drops "Change plan" and "Manage in store" for a note that names the
billing store, and its banners stop opening this device's store management. The other store has no
record of the subscription, so a "change" there would be a second subscription, billed by both
stores. An expired subscription has no live receipt and may be bought again on either store.

### Out of scope

- Tier adjacency is unchanged: one step either way (ADR-0060 §2). The keep screen is the release UI
  ADR-0060 waited for before allowing multi-step downgrades; lifting that lock is a separate decision.
- Cloud management is unchanged; releasing a cloud stays there.
- No purchase logic changes: `purchaseAndValidate`, `buildPurchaseProduct` and the native bridge are
  as they were, apart from the return value.

## Alternatives

- **Keep the store sheet on the picker and add the notice above the button.** The asymmetry was
  already in a notice block at the bottom of the picker; people read the price on the card and tap.
  A separate step with current against new and the date is what makes the consequence the thing on
  screen. Rejected.
- **Ask the relay for history, a grace signal and amounts first, then build every scene.** The rest
  of the flow does not depend on those three, and the relay's subscription lifecycle work is still
  settling its grace periods. Waiting would hold the confirmation step and the keep screen hostage to
  three cosmetic scenes. Rejected for now; they come back with the data.
- **Keep the app-side excess guess and add the keep screen next to it.** Two answers to "which clouds
  are past the line" — one guessed, one the relay's — would disagree exactly when a user had chosen.
  Rejected.
- **Send the clouds to keep, not to drop.** The relay's contract names drops, and its list-is-final
  semantics already make the inversion safe. Translating in one place (`lib/keepClouds.ts`) is cheaper
  than a second endpoint.
- **Persist the "restored" signal.** A restore seen on another day or another device is not news, and a
  stored flag would need a rule for when to forget it. Session memory is the honest scope.

## Consequences

- The store sheet is one tap further away, on purpose.
- A downgrade now leads somewhere: the completion dialog and the detail's pending card both open the
  keep screen when the clouds will not fit.
- `EXPIRED_HOLD_MS` copies a relay constant. If the relay changes its hold, the expired banner's
  promise is wrong until this changes too.
- Four presentational composites join `web-ui-kit`. The `scheduled`/`warning` tone uses a fallback
  colour because the kit has no `warning` token yet.
- About fifty retired copy keys are removed with the screens that read them.
- Someone who moved from Android to iPhone (or back) has to cancel on the old store and subscribe again
  once it ends, rather than change tier where they are. That is the store's limit, now said out loud.
