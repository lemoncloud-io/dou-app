# place-channel-create — opening a new place or group room

Two full-screen overlays, raised from the two `＋` entries on home: one creates a **place** (a site)
and one creates a **group room** (a channel with `stereo: 'private'`). They share a shape — title,
circular avatar with an optional photo, a 1–20 character name field, one floating submit — and
differ in three things: the copy, the API they call, and where they send you afterwards. The name
field's done key closes the keyboard and does not create; the floating button does (see
[shell/return-key](../../shell/return-key.md)).

Creating a place profile is a different subject and lives in [place-profile](./place-profile.md);
this document is about creating the place or the room itself.

## The rules

1. **Creation is owner-only and cloud-only.** Both entries appear only on a cloud you own. The relay
   and an invited cloud never show them. The server is the real authority; this gating is UX, so a
   user is not walked into a refusal.
2. **Success means arrival.** Creating and staying on home is not finishing. A new place is switched
   to; a new room is navigated into. The move is part of the action, not a follow-up.
3. **A cap hides nothing.** The `＋` stays visible at the cap and the attempt explains itself. A
   missing button answers "why is it gone"; a refused tap answers "why can't I".
4. **The caps live in one file.** `apps/web/src/app/utils/consts.ts` is the single source, and no
   hook or component re-declares the numbers.

## The caps

| Constant                 | Value | Applies to                   |
| ------------------------ | ----- | ---------------------------- |
| `MAX_PLACES`             | 5     | places per owned cloud       |
| `MAX_CHANNELS_PER_PLACE` | 100   | group rooms in one place     |
| `GUEST_MAX_CHANNELS`     | 3     | channels for a guest account |

Dev-class builds (`isDevBuild()`, `VITE_ENV` of `DEV` or `LOCAL`) skip **both** cap checks so
testers can seed freely. The PRO gate is not skipped with them.

```bash
grep -rn "MAX_PLACES\|MAX_CHANNELS_PER_PLACE\|GUEST_MAX_CHANNELS" --include='*.ts' --include='*.tsx' apps/web/src
```

## Gating — who decides what, and where

Ownership is derived in `HomePage`, not in `useUserPermissions`. The permissions hook has no cloud
catalog and cannot see the relay exception, so the decision sits where the cloud context already is:

A cloud is mine when it is neither the relay nor an invited one, and the place entry additionally
requires `permissions.canCreatePlace`.

`cloudType` is only ever `'invited' | 'owner'` — the relay is a separate id, not a type — so a cloud
that is neither the relay nor invited is one I own.

Home's `＋` sits at the end of the tab row (`ChannelCreateMenu`). In a cloud it is a popover that
offers `1:1 대화` to any member of the place — to the member picker — and `그룹방 만들기` to the
owner, so an invited member's `＋` holds the 1:1 entry alone. The relay has no group rooms, so its
`＋` offers no group entry at all, not even as an upsell: it is one button straight to the
phone-number contact form for a 1:1. See [dm-and-self-chat.md](../channels/dm-and-self-chat.md) § Mobile lists
a cloud's 1:1s in a section of their own, and starts them too.

### What each tap does

`handleCreatePlace`, in order:

1. Not `canAddPlace` → `homePage.cannotCreatePlace` toast.
2. At `MAX_PLACES` → `PlaceLimitDialog`.
3. Otherwise → `CreatePlaceDialog`.

`handleCreateGroup`, in order:

1. No active place → `homePage.selectPlaceFirst` toast. A room belongs to the active place, and
   `useChannelMutations` falls back to an empty `sid` when there is none — so the write would
   succeed into a scope no list reads, rather than failing where anyone could see it. The Chat
   section does not render without a selected place, so nothing reaches this from the UI today; it
   is the fallback, not a reachable path, that makes the check worth having.
2. At `MAX_CHANNELS_PER_PLACE` → `homePage.channelLimitReached` toast.
3. Free tier → `SubscriptionRequiredDialog`. Otherwise → `CreateChannelDialog`.

**`CreateChannelDialog` outlives the section that opened it.** It is mounted unconditionally, so a
place disappearing mid-flow — a cloud switch, a deleted place, revoked access — would leave a filled
form pointed at the same empty `sid`. Home closes the dialog and raises the same toast when the
active place goes away while it is open.

`PlaceLimitDialog` is a dialog rather than a toast because there are two ways out of the cap and
both are actions: free a slot (open the active place's settings hub) or get another cloud (raise the
subscribe flow). `onManagePlaces` is omitted when no place is active, and the action renders disabled
rather than navigating nowhere. It is built on the shared `Dialog` rather than the kit's `AlertDialog`
composite: the design has a close (X) button, and an alert dialog deliberately has no dismiss
affordance. Both actions close it first, since each one leaves the screen or mounts its own dialogs
and an overlay left open would sit on top of them.

## The two overlays

Both live in `features/home/components/` and hold their own submit state. Shared behaviour: a
slide-up full-screen `Dialog` with `ModalTopBar`, a name `TextField` with `maxLength={20}` and
`enforceMaxLength={false}` so going over shows `21/20` and an error instead of silently truncating,
`prepareImage(file, AVATAR_IMAGE)` behind a 10MB webp/png/jpeg check, an inline toast for success and
failure, and an `AlertDialog` on exit **only when something has been typed or picked**.

A failure leaves the overlay open with an error notice and the submit re-enabled. Nothing is closed
until the whole action, including the move, has succeeded.

The place overlay calls `createPlace`, switches to the new site, and then asks for the creator's
profile there before closing; the room overlay calls `createChannel` with `stereo: 'private'` and
navigates into the room. Rule 2 is why the move happens before the close.

**While the name field has focus the overlay folds its title and subtitle away** (compact mode, a
`0fr`/`1fr` grid row faded alongside), and the avatar block tightens its spacing and drops its caption.
The keyboard rises over a WebView that is never resized, so the field can only be kept readable by
moving it up; folding the decorative header lands it just under the top bar, above any keyboard, and
does not depend on the keyboard height being reported or on the scroller having room to scroll — the
two things that fail on the devices where the field stayed buried. The avatar itself keeps its size,
because a photo that shrank on every focus read as the screen changing under the user. The folded
header stays mounted and is hidden with `aria-hidden`. A tap on the avatar cancels the mousedown
default so the input keeps focus: blurring would expand the layout between pointerdown and click,
and the tap would land on whatever moved into its place.

**The safe-area insets belong to the children, not the dialog.** The slide-up variant bakes in top
and bottom padding, and both are zeroed inline on the dialog. The top bar carries the status-bar inset
itself, so the whole band sits inside its translucent, blurred surface instead of an opaque strip above
it. At the bottom, `KeyboardSafeAreaSpacer` already reserves the larger of the home-indicator inset and
the keyboard height, so keeping the dialog's padding too would apply the inset twice and float the
button a full inset above the keyboard. The padding is zeroed inline rather than with `pt-0`/`pb-0`
classes because those safe-area keys are custom spacing that class merging does not recognise: both
classes would survive and utility order would pick the winner.

`useCreatePlace` and `useCreateChannel` are app-level hooks (`app/hooks` and
`features/channels/hooks`), not home's — the onboarding wizard creates a place through the same
`useCreatePlace`.

**Creating a place ends with the creator's profile in it.** Once the create and the switch have both
succeeded, the overlay turns into `PlaceProfileCreateDialog` for the new place, and closes when that
is saved. The order is fixed by the server, not chosen:

- A profile is stored on the site the session is on; the site a request names is ignored. So the
  profile can only be written after the switch — written before it, it lands on the place the owner
  was in before.
- `place.create` makes no profile row for its creator, and `profile.set` only updates, so the first
  save answers 404. The profile repository answers that by sending `profile.get-mine` (which creates
  the row) and saving again — measured end to end against the server. Without that recovery this step
  cannot work at all, which is why an earlier attempt at it was reverted.

The step is required, but it has a way out once a save has failed: holding the owner on a form the
server will not take is worse than a place without a profile, which the missing-profile prompts pick
up later ([place-profile](./place-profile.md)).

Create and switch are separate calls. If the create succeeds and the switch fails, the overlay stays
open with the error and remembers the new place; the retry repeats only the switch. Without that, a
second tap made a second place. An edit to the name between the two taps is therefore not applied.

## Notes for implementers and tests

- `PlaceProfileForm` exposes a `dismissible` flag that removes the X and blocks esc/overlay
  dismissal. The place overlay's profile step and the cloud invite's pass `false` until a save
  fails.
- Cap behaviour differs between build classes. A cap test has to pin `isDevBuild()`, or it passes
  locally and proves nothing.

## Further reading

- [README](./README.md) — the sections these entries hang off, and the popover copy per mode
- [place](../place/README.md) — what a place is once it exists, and its settings hub
- [channels](../channels/README.md) — the room you land in
- [subscription](../subscription/README.md) — the PRO gate and the upsell dialogs
