# place-channel-create — opening a new place or group room

Two full-screen overlays, raised from the two `＋` entries on home: one creates a **place** (a site)
and one creates a **group room** (a channel with `stereo: 'private'`). They share a shape — title,
circular avatar with an optional photo, a 1–20 character name field, one floating submit — and
differ in three things: the copy, the API they call, and where they send you afterwards.

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
| `MAX_PLACES`             | 10    | places per owned cloud       |
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

The channel section's `＋` opens for `isDefaultCloud || isCloudOwner`, because the relay entry offers
a different action: `1:1 대화`, plus a `그룹 방 만들기` row that appears **only while unpaid**. A
group room lives in a cloud of one's own, so for a subscriber that relay row would lead nowhere and
is dropped.

### What each tap does

`handleCreatePlace`, in order:

1. Not `canAddPlace` → `homePage.cannotCreatePlace` toast.
2. At `MAX_PLACES` → `PlaceLimitDialog`.
3. Otherwise → `CreatePlaceDialog`.

`handleCreateGroup`, in order:

1. On the relay → the subscription upsell, immediately. **The cap is not checked first**, or the
   relay place's own channel count would turn an upsell into a cap toast.
2. At `MAX_CHANNELS_PER_PLACE` → `homePage.channelLimitReached` toast.
3. Free tier → `SubscriptionRequiredDialog`. Otherwise → `CreateChannelDialog`.

`PlaceLimitDialog` is a dialog rather than a toast because there are two ways out of the cap and
both are actions: free a slot (open the active place's settings hub) or get another cloud (raise the
subscribe flow). `onManagePlaces` is omitted when no place is active, and the action renders disabled
rather than navigating nowhere.

## The two overlays

Both live in `features/home/components/` and hold their own submit state. Shared behaviour: a
slide-up full-screen `Dialog` with `ModalTopBar`, a name `TextField` with `maxLength={20}` and
`enforceMaxLength={false}` so going over shows `21/20` and an error instead of silently truncating,
`resizeImageToBase64(file, 150)` behind a 10MB webp/png/jpeg check, an inline toast for success and
failure, and an `AlertDialog` on exit **only when something has been typed or picked**.

A failure leaves the overlay open with an error notice and the submit re-enabled. Nothing is closed
until the whole action, including the move, has succeeded.

The place overlay calls `createPlace` and, on success, switches to the new site before closing; the
room overlay calls `createChannel` with `stereo: 'private'` and navigates into the room. Rule 2 is
why the move happens before the close.

`useCreatePlace` and `useCreateChannel` are app-level hooks (`app/hooks` and
`features/channels/hooks`), not home's — the onboarding wizard creates a place through the same
`useCreatePlace`.

**Creating a place does not force a profile step.** The overlay closes on the switch. The creator
fills their place profile later, through the same nudge as everyone else — see
[place-profile](./place-profile.md).

## Notes for implementers and tests

- `PlaceProfileForm` exposes a `dismissible` flag that removes the X and blocks esc/overlay
  dismissal. No caller passes `false` today; the create flows above do not chain a mandatory profile
  step. Check for a consumer before writing anything that assumes one exists.
- The relay branch in `handleCreateGroup` must stay ahead of the cap check. Reordering them is a
  silent regression: the upsell becomes a cap toast for relay users only.
- Cap behaviour differs between build classes. A cap test has to pin `isDevBuild()`, or it passes
  locally and proves nothing.

## Further reading

- [README](./README.md) — the sections these entries hang off, and the popover copy per mode
- [place](../place/README.md) — what a place is once it exists, and its settings hub
- [channels](../channels/README.md) — the room you land in
- [subscription](../subscription/README.md) — the PRO gate and the upsell dialogs
