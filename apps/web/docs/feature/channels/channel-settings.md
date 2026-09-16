# channel settings — one screen for three kinds of room

[`ChannelSettingsPage`](../../../src/app/features/channels/pages/ChannelSettingsPage.tsx) is the
room's settings screen and the four dialogs it opens. One page serves group rooms, 1:1 rooms and the
self chat: the sections it draws and the dialog a row opens are branches inside it, not separate
screens. Everything visual is `@chatic/web-ui-kit` — `ListRow`, `GroupLabel`, `Switch`,
`StatusBadge`, `Divider`, the avatars and `ModalTopBar`.

What varies by stereo — the title chain, the avatar rule, the peer, the re-invite CTA — is decided
by shared derivations documented in [dm-and-self-chat.md](./dm-and-self-chat.md). This document is
the screen: its sections, its writes, and the dialogs.

## Layout

Six dialogs sit beside the page — the member row and its profile sheet, the room-name dialog
(groups), the join-nick dialog (self and DM), a confirm, and my own place-profile editor.
`PlaceProfileCreateDialog` is the one that is not local: it lives in `ui/components`, because
creating a place profile is not a channel concern and this screen only opens it.

## The sections

| Section         | Group                                | 1:1                             | Self chat                 |
| --------------- | ------------------------------------ | ------------------------------- | ------------------------- |
| Room name row   | `UpdateChannelDialog`                | `JoinNickDialog` (`dm`)         | `JoinNickDialog` (`self`) |
| Chat settings   | notification switch                  | notification switch             | —                         |
| Room members    | add-friend row (owner) + member list | member list, departed peer kept | member list (me alone)    |
| Destructive row | owner: delete · member: leave        | leave, for both sides           | —                         |

Three rules behind that table:

- **A DM has no delete and no add-friend.** Re-inviting needs the room to still exist, so letting
  the inviter erase it would take away the only way back; and a 1:1 is a fixed pairing, so there is
  nobody to add. The ownership branch used everywhere else does not apply here.
- **A self chat has nothing to notify, leave or delete.** Its only member is me.
- **A departed member is dropped from a group and kept in a DM**, with a "left the room" subtitle.
  In a group a pile of departed members is noise; in a DM that person _is_ the room.

## Writes

The notification toggle and my private name write `join.update`; the room's shared name and photo
write `channel.update`; a kick and a leave are both `leaveChannel` (with and without a `userId`); a
delete is `deleteChannel`. Leaving or deleting replaces the route with the root.

### The notification toggle

The mute state lives on **my join row** (`notify`), not on the channel. `'none'` is muted, anything
else is on. The screen reads it from `useChannelJoins().myJoin` — never `channel.$join`, which lags
— and keeps a local optimistic mirror for instant feedback, reverting it and toasting on failure.
The repository's own optimistic write lands on the same join cache, so the mirror and the stream
reconcile from one source.

There is no local preference store for this, deliberately: `apps/web` has no client-side notifier,
so the server value is the only truth there is. The toggle is binary — the contract's `mention`
tier is not exposed on mobile.

### A kick is a leave with a target

`leaveChannel({ channelId, userId })` removes someone else. Nothing server-side pushes a join update
for the target, so the mutation hook also marks their join row locally — otherwise the member list
keeps rendering them. That detail belongs to the hook; see [data-layer.md](./data-layer.md).

## The member list

One list, shared by the group section and the self chat's, built from `useChannelMembers` and
decorated with `useChannelProfiles`. A row resolves its name as **place-profile nick → the user
row's name → "me" / "unknown user"**. The member id is deliberately not a rung: put it before the
label and an unresolved member shows a raw UUID, with the label unreachable.

Badges are `owner` and `mine`. **There is no "invite pending" badge**, and its absence is a
decision: the join counter reads `0` both for "invited, never came in" and for "left", so badging on
it labelled departed members as pending invitees. A missing badge on a real invitee costs less than
a wrong one on someone who left. `MemberListItem` still accepts the prop, ready for a server that
can tell the two apart.

**My own row with no place profile** shows "profile setup required" and taps through to
`PlaceProfileCreateDialog` instead of the member sheet — that sheet's only self action is "profile
settings" anyway, so it would be a dead tap. The gate is `hasProfileSnapshot`, from
`useChannelProfiles`, and `isMembersLoading` cannot stand in for it: that flag flips on the user
cache's first emit and knows nothing about profiles, so members routinely arrive first and reading
absence from an empty profile map nudges people who do have a profile — into a blank create form
whose save would overwrite their real nick. The prompt is shared by all three stereos; the home
feature owns the wider behaviour ([../home/README.md](../home/README.md)).

The screen reports **member divergence** on unmount: how many roster ids have no join row, and how
many active join rows the roster does not list. On unmount specifically, because the join cache
streams in and a mid-hydration snapshot would count every member as roster-only.

## The dialogs

### `UpdateChannelDialog` — the room's shared name

Two modes, derived from the observed `channel.isOwner`, so the page passes no mode prop:

- **Owner** — edit the room name and photo, write with `channel.update`. The avatar offers the
  picker; images are resized to base64 and capped at 10MB.
- **Invited member** — the avatar is read-only (the owner's photo) with the owner's room name as a
  caption, and the name field writes **my `join.nick`**, labelled as shown only to me. This matches
  what the API allows: `join.update` takes `nick` and `notify`, and no thumbnail.

The name is capped at 20 characters with a counter, and the confirm button activates only on a
non-empty, changed value. Transient state is seeded once per open: the observed channel can re-emit
from a background sync while the dialog is open, and re-seeding would discard edits in progress.

### `JoinNickDialog` — my private name for the room

One dialog, two variants, because self and DM need exactly the same write with different copy. It
writes `join.update` with a `nick`, capped at 20 characters, and **an empty value is a valid save**
— it clears the custom name and the title falls back down its chain. The placeholder is whatever the
room falls back to right now, so clearing the field visibly returns to it.

The DM variant is also the friend-info sheet: the peer's avatar, a "left the room" line when they
are gone, and the re-invite CTA. The save button stays even though the design frame shows only the
CTA — following the frame literally would leave no way to record a name at all.

**Exactly one instance is mounted.** The dialog fetches my profile on mount, so two instances cost
two round trips and only one can ever be open.

### `MemberProfileDialog` — who is viewing whom

Rows depend on the viewer's role and on the target:

| Viewer / target              | Rows                                        |
| ---------------------------- | ------------------------------------------- |
| me                           | profile settings → `PlaceProfileEditDialog` |
| owner → another member       | friend settings · remove · report           |
| anyone else → another member | report                                      |

Remove re-confirms through `ConfirmDialog` before calling the kick. **Friend settings and report are
UI-only**: neither has a backend, so both acknowledge with a toast. They are rows rather than hidden
items because the design has them, and a toast manages the expectation better than a dead tap does.
`canKick` also requires a non-DM room.

## What not to do

- **Do not read `channel.$join` for anything that must reflect a write.** The notify toggle and the
  title both read the join cache through `myJoin`.
- **Do not invent a title or an avatar rule here.** `useChannelTitle` and `resolveChannelAvatar` are
  shared with the room header, the home list and place channel management; a fourth answer is how
  the same room ends up with two names.
- **Do not branch the destructive row on ownership alone.** A DM leaves regardless of who owns it.
- **Do not gate the profile prompt on `isMembersLoading`.** Use `hasProfileSnapshot`.

## Notes for implementers and tests

- Hooks that must run before the `isError` early return are called above it — the DM peer, the
  title, the invite state — with the plain stereo flags derived after it.
- `ChannelUpdateJoinInput` types only `channelId` and `notify`; the engine resolves the join row
  from `channelId + userId` at write time, which is why the toggle passes `userId` through a cast.
- `ChannelSettingsPage.test.tsx` is the widest test in the feature: the three stereos' section sets,
  which dialog each name row opens, the kick gating, the notify toggle's initial value and failure
  path, and the profile-prompt row.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [dm-and-self-chat.md](./dm-and-self-chat.md) — the title chain, the avatar rule and the re-invite state.
- [data-layer.md](./data-layer.md) — `useChannelJoins`, `useChannelMembers` and the write hooks.
- [invite.md](./invite.md) — where the add-friend row goes.
