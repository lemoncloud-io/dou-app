# purchase-and-restore — price, the store handshake, restore, and what the screens remember

This document collects the behaviour around a purchase that the [README](./README.md) contract does
not spell out: where the price on a card comes from, what the purchase path does and in what order,
how restore recovers a purchase that never attached, how the keep-clouds screen builds its choice, and
which facts are measured against the device clock. The tier rules, the five states and the allowance
are in the README.

## Price

- **The price is the store's, fetched when the screen mounts.** `useNativeCatalog` asks the host's
  store for its products as soon as a plan card is shown, not at purchase time, because a price has to
  be on screen before the user decides. Both stores require the displayed price to be theirs: it is
  already localized and tax-inclusive for the user's storefront. Where the host sells through no store
  the catalog stays empty.
- **No dollar sign is ever invented.** The subscription card and the completion notice once printed
  the server's USD reference value with a hard-coded `$`, so a subscriber billed in won read dollars.
  `usePlanPrice` returns `undefined` when the store has no entry for the plan — off-native, or a
  membership bought on the other store — and the caller drops the line instead of substituting a
  number.

## The purchase path

- **Refusals come before the store opens**, cheapest first, and each reads as guidance rather than a
  failure because the thrown message is shown to the user as is. A guest is refused ahead of the
  social-credential check: it is the same missing credential, but "log in" is the instruction a guest
  can act on, while the social-link message points at a MyPage screen a guest cannot use.
- **A failed `finish` is rethrown on purpose.** The store re-presents an unfinished transaction, so
  swallowing the failure would turn a purchase that already validated into a second charge.
- **A short pause precedes the cache refresh.** After `finish`, the native purchase state is asked to
  refresh without waiting, then the flow waits 1.5 s before invalidating the membership and cloud
  queries, so the native side has settled by the time the app reads again.
- **A missing store product is a configuration skew.** A plan the server sells but the store does not
  list blocks the purchase entirely and is invisible from outside, so `useTierPurchase` rejects with a
  user-facing message.
- **There is one purchase implementation.** Two screens once carried their own copy of "find the
  store product, build the payload", and the copies drifted (one matched Android against the shared
  parent SKU and never resolved a tier). `useTierPurchase` and `usePlanOptions` exist so the per-tier
  state and the payload are derived once.

## Restore

`useRestorePurchases` is the recovery path for a purchase the store took but this account never got —
a crash, a dropped connection or a reinstall between the charge and the validation. It re-validates
every receipt the store still holds.

- **Not gated.** Restore deliberately skips the guest and social checks that guard a purchase: a
  receipt that already exists belongs to someone, each one is validated server-side and skipped on
  failure, so the worst case is a count of 0, whereas refusing to try would strand a paying user. The
  control itself (`canRestore`) is shown only where this host sells through a store and the viewer is
  not a guest, since a guest has no account for a recovered receipt to attach to.
- **A count of 0 is an outcome, not a failure.** The store simply holds nothing for the account, and a
  destructive "failed" toast would send the user hunting for a problem that does not exist.
- **Re-entry is guarded in the hook.** A second concurrent run would re-validate the same receipts
  and toast twice, and not every caller disables its own control correctly.
- **A website subscription ends the run.** The relay's refusal covers the whole account, so restore
  stops at the first one, still refreshes the caches for what it had restored, and the caller explains
  the refusal instead of reporting a failed restore.
- **Two places offer it.** The status screen (a user arriving later, wondering where the plan went) and
  the plan picker's policy footer — the screen a user is still on when a purchase fails halfway, so the
  fix is not a navigation away from the failure. That footer also carries the auto-renewal disclosure
  and the terms and privacy links both stores require near a purchase, which is why it renders on the
  screen the purchase starts from.

## Keep-clouds choice

- **The screen asks which clouds to keep and sends the rest.** The first visit starts with nothing
  selected: pre-selecting would make "confirm" a choice the user never looked at. Once marks exist, the
  selection opens as the clouds the relay currently keeps, and the button reads "change" and stays off
  until the choice differs from that.
- **A pick past the allowance drops the oldest pick** rather than refusing the tap, so a limit of 1
  behaves as a radio group and a multi-choice list has no dead tap.
- **Candidates exclude clouds that have left the membership.** A released cloud, and an `expired` one
  the relay skips when it applies marks, would let the user pick something the request silently
  ignores. A cloud already on hold stays a candidate.
- **The target plan is the queued one**, but straight after a purchase the relay may not have read the
  new receipt yet, so the confirm screen passes the plan along as a `plan` query parameter and the
  screen falls back to it. The date the downgrade lands shows a dash until the membership carries it,
  rather than a guessed renewal date.
- **Nothing is applied on save.** The relay holds the unchosen clouds when the downgrade lands at
  renewal, and the choice can be changed until then and even afterwards, while they are on hold.

## What is measured against the device clock

- `daysUntil` (the countdown chip) rounds up and is a day off the relay's own verdict around
  midnight. It informs; it decides nothing.
- Whether the expired banner may still promise the old clouds back compares `validUntil` plus the
  30-day hold to the device's now, for the same reason.
- `autoRenewing` that is `undefined` reads as "on"; only an explicit `false` turns the renewal
  reminder off.
- The "restored" note is fed only by settled states. A half-loaded membership reads as `none` and would
  make every later `active` look like a comeback, so the subscription list observes the state only once
  loading has finished. The note is news once: leaving the detail screen spends it.
