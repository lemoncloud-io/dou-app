# Billing rules

Pure decisions live in `src/app/features/subscription/lib/`; screens draw their answers and never re-derive them.

## Which plan a reader may pick (`changeKindOf`)

- With no live subscription only the entry plan (tier 1) can be bought. A bigger allowance arrives with one cloud
  verification per cloud, and starting at the bottom keeps those one at a time.
- With a live subscription only the plan directly above or below is offered. A jump of two would ask for two
  verifications back to back on the way up, and on the way down there is no screen yet for releasing the clouds a
  multi-step drop would strand.
- An expired subscription counts as none: subscribing again starts at the entry plan.
- An account billed by a store changes plan in that store; every card is `blocked` here.
- The rule mirrors the one the app applies to its store plans, so a plan pickable in one is pickable in the other.

## Which cards may be removed (`canRemovePaymentMethod`)

A live subscription always needs a card to charge.

- The last card of the subscription's provider cannot go (`last`); among several, that provider's default cannot go
  either (`default`) until another card is made the default.
- A card of the other provider charges nothing, so it can go, except that its default waits for another card of that
  provider to take its place.
- With no live subscription (none, or an expired one) any card may be deleted, the last one included.

## What the detail screen shows (`sceneOf`)

One function decides the banner and the buttons, so the detail screen, the list, the sidebar and the cancel page cannot
disagree.

- A payment still being settled (`pending`) offers nothing, not even cancelling.
- A scheduled downgrade and a restored subscription are not statuses: both sit on an `active` subscription and take over
  its banner. A restored one keeps the ordinary buttons beneath its "started again" banner.
- An ended subscription that was replaced by the next one is history, not a lapse, and offers no "subscribe again".
- The cancel page's form appears only where `sceneOf` offers cancelling, and a subscription already cancelled shows the
  result, so a reload after cancelling lands on the result and a second cancel is never offered.
- A scheduled downgrade on the day it applies is no longer cancellable: the charge for the smaller plan is already under
  way, so the reader is told to wait instead of being asked.
- A subscription whose card was removed after cancelling names no card, and there is no fallback to another card: the
  server would not charge one. Resuming it sends the reader to add a card instead of asking to confirm.

## Calendar days, not instants

Billing happens on days, so dates are ISO calendar dates and the arithmetic (`lib/calendar.ts`) ignores time zones.
"Today" is the reader's local calendar day.

- A month added to the 31st is held to the last day of a shorter month: a subscription billed on the 31st renews on 30
  November, then 31 December.
- A trial "ending" on the 8th is charged on the 8th, so the last free day shown is the 7th; a downgrade applying on the
  20th leaves the current plan through the 19th.
- Code lifetimes and resend intervals are real minutes on the wall clock, not days (`useNow`, not the port's `today`).

## The payer (Korea only)

- The card company's holder-name limit is counted in bytes and the payment window does not say which encoding, so UTF-8
  is assumed, the stricter case for Korean: 3 bytes a syllable, so ten syllables fit and the eleventh is refused.
- The mobile number must be a Korean mobile number (`01` and 8 or 9 more digits), the only kind a domestic card is
  registered with; it is sent as digits only.

## Reading the plan from the address (`usePlanRoute`, W-01)

- A subscription list that failed to load is an error, never "no subscription": taking it for one would put an existing
  subscriber through a first checkout. The same holds on the plans page, which reads the list for its error as well.
- A visitor never asks for subscriptions: the call would answer that the session is gone, and that answer sends the
  reader to sign in, which is not what someone browsing plans asked for.
