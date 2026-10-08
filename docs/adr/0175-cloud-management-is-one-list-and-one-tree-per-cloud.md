# ADR-0175: Cloud management is one list and one tree per cloud, and a cloud's own screens enter it first

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/cloud-management-screens`
> · Scope: `apps/web/src/app/features/mypage` (`CloudManagePage`, `CloudHubPage`, `CloudEditPage`,
> `CloudDetailPage`, `CloudPlacesPage`, `useEnsureCloudSession`) · `apps/web/src/app/utils/cloudRowState.ts`
> · `apps/web/src/app/features/subscription` (`CloudManageBanner`, `CurrentPlanCard`, `useCloudManageScene`,
> `AddCloudLimitDialog`) · `apps/web/src/app/features/home` (`CloudItem`, `CloudSessionSheet`)
> · `libs/web-ui-kit` (`CloudStatusBadge`, `StatusBanner.action`, `CloudAvatar` xl)
> · Amends [ADR-0091](./0091-relay-home-cloud-sheet-and-cloud-guide-redesign.md) §3: the single rename
> path moves from `/mypage/cloud-profile` to `/mypage/cloud-manage/:id/edit`
> · The module docs are [apps/web mypage/README.md](../../apps/web/docs/feature/mypage/README.md),
> [home/README.md](../../apps/web/docs/feature/home/README.md) and
> [subscription/README.md](../../apps/web/docs/feature/subscription/README.md)

## Context

The design for cloud management (Figma 4472-75743 through 4992-49725, sixteen frames) gives each
owned cloud its own screens — a menu, a profile editor, a read-only information screen with the
release action, and the list of places it holds — and gives the list and the switcher one shared
vocabulary of four cloud states: being created, needs a look, ending at the next renewal, and
restricted.

What existed was one flat list at `/mypage/cloud-manage` with a delete button on every row, a
rename page at `/mypage/cloud-profile` that could only rename the ACTIVE cloud, a switcher whose
badges used a different set of words (slot being assigned, inactive, expired, error), and a toast
where the design draws a dialog with a plan-change offer when the allowance is used up.

Three things in the backend bound what could be built:

- **A cloud's name is written over its own socket** (`cloud.update`), and **its places are its own
  cache**, filled by its own sync. The relay holds the catalog row and nothing below it: no listing
  of another cloud's sites, and the relay's generic `PUT /clouds/:id` is a framework default that
  was not confirmed to be owner-gated.
- **The cloud model has no image field**, though the design draws a photo slot on the profile.
- **There is no grace-period or payment-failure signal**, though the design draws a payment-failure
  banner — the same gap the subscription screens already record.

## Decision

1. **One list, one tree per cloud.** `/mypage/cloud-manage` lists the owned clouds; a row opens
   `/mypage/cloud-manage/:id`, a menu into `edit` (writes), `detail` (reads, and releases) and
   `places` (lists). The route words follow the `place` feature's: `edit` and `detail`, never
   `info`. `/mypage/cloud-profile` is retired; the rename path moves into the tree.
2. **A screen that needs the cloud's own session switches into it first.** `CloudEditPage` and
   `CloudPlacesPage` call `useEnsureCloudSession`, which performs the app's ordinary cloud switch on
   entry — once per cloud id, with a retry on failure — and the user stays in that cloud afterwards.
   The hub disables those two rows for a cloud with no session to switch to (provisioning, failed,
   held) and keeps the information screen, where the state is explained and the cloud is released.
3. **One state mapping for every cloud row.** `resolveCloudRowState` in `app/utils` folds the
   relay's `status` and `state$.plan` into six row states; both the switcher and the management
   list draw their badge from it, with `CloudStatusBadge` in the kit as the one visual. "Needs a
   look" is a failed provisioning (`status === 'error'`), as product confirmed; "restricted" is a
   relay hold (`suspended`); "ending" is the user's own drop mark (`state$.plan === 'drop'`), which
   still enters because the cloud is usable until the renewal. A switcher row either enters its
   cloud or opens the cloud's hub — never both.
4. **Releasing lives on the information screen only.** It is irreversible and cascades; it sits
   at the foot of the read-only facts behind a confirm, not on a list row.
5. **The subscription's say is composed, not re-derived.** The management list shows the
   subscription's standing through four exports of `features/subscription` — the scene (is there a
   subscription, and which banner), the banner, the plan card and the quota — so no second feature
   judges the membership. The add button is away while a banner is up: that is the state in which
   the server would refuse the cloud, and the banner is what explains it.
6. **A used-up allowance gets a dialog.** `AddCloudFlowHost` opens `AddCloudLimitDialog` for both
   entry points: with a higher tier on sale it offers the plan picker, at the top tier it says so.
7. **Two designed things are not drawn.** The photo slot waits for an image field on the cloud
   model; the payment-failure banner waits for a grace-period signal. Both are recorded in the
   module docs rather than approximated.
8. **The cloud row on MY shows for every signed-in account**, not only for owners: the list has an
   empty state that starts a subscription, which the ownership gate hid.

## Alternatives

- **Ask the backend for a cross-cloud site listing and an HTTP rename, and keep the screens
  session-free.** Cleaner for the user (no switch on entry), but it blocks the screens on backend
  work the web cannot schedule, and the relay would be learning about sites it has deliberately
  kept out of. Rejected for now; the switch-first path is the same one an invite already takes, and
  a listing can replace it later without changing the routes.
- **Show the profile and places rows only for the active cloud.** No switch, but it makes the hub
  read differently depending on where the user happens to be, and the design draws the three rows
  for every cloud.
- **Draw the photo slot and refuse the save.** A control that cannot deliver is worse than none —
  the same rule `SOCIAL_UNLINK_ENABLED` already follows in this feature.
- **Keep the switcher's own badge words and map them to the design's on the management list
  only.** Two vocabularies for one record is how a cloud reads "inactive" in the sheet and
  "restricted" a tap later. Rejected.

## Consequences

- Entering `/mypage/cloud-manage/:id/edit` or `/places` changes the app's active cloud, and leaving
  does not change it back. The hub says so only through the switch itself; a user who came from
  another cloud lands on this one's home afterwards.
- `useHomePlaces` moved to `app/hooks/useActiveCloudPlaces`: the places screen in `features/mypage`
  reads it, and one feature may not import another's hooks.
- The management list and the switcher cannot drift on a cloud's state, but a new relay state has
  to be added to `resolveCloudRowState` before either screen can show it.
- The product's "DoU Cloud N" names in the frames are placeholders; the card shows the catalog's
  own names (`planDisplayName`), as every subscription screen does.
