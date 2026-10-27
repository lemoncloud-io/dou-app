# channel settings — one screen for three kinds of room

[`ChannelSettingsPage`](../../../src/app/features/channels/pages/ChannelSettingsPage.tsx) is the
room's settings screen and the four dialogs it opens. One page serves group rooms, 1:1 rooms and the
self chat: the sections it draws and the dialog a row opens are branches inside it, not separate
screens. Everything visual is `@chatic/web-ui-kit` — `ListRow`, `GroupLabel`, `BottomSheet` and
`SheetOption`, `StatusBadge`, `Divider`, the avatars and `ModalTopBar`.

What varies by stereo — the title chain, the avatar rule, the peer, the re-invite CTA — is decided
by shared derivations documented in [dm-and-self-chat.md](./dm-and-self-chat.md). This document is
the screen: its sections, its writes, and the dialogs.

## Layout

Six dialogs sit beside the page — the member row and its profile sheet, the room-name dialog
(a group's owner), the join-nick dialog (self and DM), a confirm, and my own place-profile editor — plus
`NotifyModeSheet`, the notification level picker.
`PlaceProfileCreateDialog` is the one that is not local: it lives in `ui/components`, because
creating a place profile is not a channel concern and this screen only opens it.

## The sections

| Section         | Group                                               | 1:1                             | Self chat                 |
| --------------- | --------------------------------------------------- | ------------------------------- | ------------------------- |
| Room name row   | owner: `UpdateChannelDialog` · member: not a button | `JoinNickDialog` (`dm`)         | `JoinNickDialog` (`self`) |
| Chat settings   | notification level: all · mention · off             | notification level: all · off   | —                         |
| Room members    | add-friend row (owner) + member list                | member list, departed peer kept | member list (me alone)    |
| Destructive row | owner: delete · member: leave                       | leave, for both sides           | —                         |

Five rules behind that table:

- **A DM has no delete and no add-friend.** Re-inviting needs the room to still exist, so letting
  the inviter erase it would take away the only way back; and a 1:1 is a fixed pairing, so there is
  nobody to add. The ownership branch used everywhere else does not apply here.
- **A self chat has nothing to notify, leave or delete.** Its only member is me.
- **A group member's room-name row opens nothing.** A group is titled by its shared name for everyone
  — the name its push carries — and only the owner sets it, so there is no name of the member's own
  to edit. The row stays as the title, without the chevron, as a cloud 1:1's does. (Until the server
  starts titling group pushes with the room name, a group push is still titled with the sender; the
  app does not wait for it.)
- **A 1:1 has no "Mentions only".** The server delivers every message of a 1:1 stored as `mention`,
  so the level would behave exactly like "All messages" — see
  [the notification level](#the-notification-level).
- **A departed member is dropped from a group and kept in a DM**, with a "left the room" subtitle.
  In a group a pile of departed members is noise; in a DM that person _is_ the room.

### Who owns the room

"Owner" everywhere on this screen — my delete-or-leave, the add-friend row, the member list's badge,
the profile's owner mark, who may remove a member — is one rule, `isRoomOwner(room, join, userId)` in
`lib/channelStereoPolicy.ts`, and the room screen's header and profile read it too:

- **The member's join role decides it.** The server writes a role on every join (`stereo`:
  `'' | 'owner' | 'admin' | 'member'`); only `owner` owns the room. My own comes from `channel.$join`,
  another member's from the room's join list (`useChannelJoins`).
- **Only a group has an owner.** The server writes `owner` on a 1:1 inviter's join too, but a 1:1 has
  no owner/member split and a self chat has one member, so both answer "no owner" — no badge, no owner
  mark, and "leave" for both sides of a 1:1.
- **A join with no role falls back to `channel.ownerId`** (the creator), so a row cached without the
  field cannot strip a group of its owner. An empty role is a role the server set, meaning "none".
- **A join that names someone else is ignored** and the creator check decides. A kick's response
  carries the removed member's join in `$join`, and the channel cache keeps it until the next sync;
  read as mine, it demoted the owner who had just removed someone to a member.

`channel.ownerId` alone used to decide it. That is the creator, which in a 1:1 is whoever sent the
invite — the inviter's row carried an owner badge in a room of two equals.

## Writes

The notification level and my private name write `join.update`; the room's shared name and photo
write `channel.update`; a kick and a leave are both `leaveChannel` (with and without a `userId`); a
delete is `deleteChannel`. Removing a member from the room's place is `place.leave` with their id,
through `PlaceRepository.removeMember` — the same call the place's member screen sends. Leaving or
deleting replaces the route with the root.

### The notification level

The level lives on **my join row** (`notify`), not on the channel. The server's values are
`'' | 'all' | 'mention' | 'none'`, with `''` and a missing value both meaning "all". The row shows
the level in effect as text with a chevron; tapping it opens `NotifyModeSheet`, a bottom sheet of
radio options, and picking one writes it and closes the sheet at once.

| Room  | Levels offered                     |
| ----- | ---------------------------------- |
| Group | All messages · Mentions only · Off |
| 1:1   | All messages · Off                 |

**Mentions only** pushes a message only when its mention record names me or calls everyone — what the
sender picked from their composer's `@` list ([chat-room.md § Mentions](./chat-room.md#mentions)),
never an `@name` read out of the text. The server decides it, so the phone needs nothing of its own.
A webhook message carries no record, so a room on Mentions only gets no webhook alarm; a room that
should ring for those is set to All messages. Off silences mentions too. Only a message carrying a
record can wake a room on Mentions only — today that is a phone's, once the socket service forwards
it; the desktop does not send one yet (see [chat-room.md § Mentions](./chat-room.md#mentions)).

A 1:1 drops "Mentions only" because the server treats `mention` there as `all`: offering it would
let the user pick a level that changes nothing. A 1:1 whose stored value is already `mention` is
**shown** as "All messages", which is how it is delivered, and the stored value is left as it is —
opening the screen writes nothing, and neither does re-picking the level already shown.

Reading it: `notifyLevelOf(notify, isDm)` in `utils/notifyLevel.ts` maps the stored value to a level —
`none` is Off, `mention` is Mentions only outside a 1:1, and everything else, an unknown value
included, is All messages (showing a room as silent when it still notifies would hide messages).
The input is `useChannelJoins().myJoin` — never `channel.$join`, which lags. The screen keeps a
local optimistic mirror for instant feedback. `updateJoin` is a state write: it lands on the join
cache at once and goes to the server through the outbox when the socket can carry it, so a socket
that is down or failing changes nothing on screen. Only two things undo the pick: a local write that
fails (the mirror is reverted with a toast), and a refusal from the server (`delivered` rejects with
a toast, and the outbox puts the last accepted level back in the join cache, which the mirror
follows). Either way the mirror and the stream reconcile from one source. The mirror re-syncs on the **derived level**, not the raw value, so a
channel that arrives after the join row still corrects a 1:1's `mention`.

There is no local preference store for this, deliberately: `apps/web` has no client-side notifier,
so the join row is the only truth there is. Its value can be ahead of the server while a pick waits
in the outbox.

The home list is unchanged by the levels: its swipe action still toggles between Off and All
messages, and its bell-off glyph marks Off only — a room on Mentions only is not drawn as muted.

### A kick is a leave with a target

`leaveChannel({ channelId, userId })` removes someone else. Nothing server-side pushes a join update
for the target, so the mutation hook also marks their join row locally — otherwise the member list
keeps rendering them. That detail belongs to the hook; see [data-layer.md](./data-layer.md).

A removal from the place needs nothing of its own here either: `place.leave` answers with the rooms
it took the member out of, and the repository drops them from those rooms' cached rosters — this
room's included, since it is in the place — which is the roster this screen's list reads.

## The member list

One list, shared by the group section and the self chat's, built from `useChannelMembers` and
decorated with `useChannelProfiles`. A row resolves its name as **place-profile nick → the user
row's name → "me" / "unknown user"**. The member id is deliberately not a rung: put it before the
label and an unresolved member shows a raw UUID, with the label unreachable.

Badges are `mine` and `owner`, at most one per row, and **my own row is always `mine`** — owning the
room does not turn it into an owner badge. "Me" is matched by the session's id and by my id in the
room's own cloud, which can differ. **There is no "invite pending" badge**, and its absence is a
decision: the join counter reads `0` both for "invited, never came in" and for "left", so badging on
it labelled departed members as pending invitees. A missing badge on a real invitee costs less than
a wrong one on someone who left. `MemberListItem` still accepts the prop, ready for a server that
can tell the two apart.

**My own row with no place profile** shows "profile setup required" and taps through to
`PlaceProfileCreateDialog` instead of the member sheet — that sheet's only self action is "profile
settings" anyway, so it would be a dead tap. "No profile" is the **server's** answer
(`usePlaceProfileAbsent`, which waits for `profile.get-mine`), never an empty profile map: a map
missing my row only says this device has not got it yet — a cold cache, a fetch in flight or one
that failed. Reading that as absence prompted people who do have a profile, into a blank create
form whose save would overwrite their real nick (reproduced with my row deleted from IndexedDB).
While the answer is out, or if the read fails, the row shows the generic label and no prompt. The
prompt is also limited to rooms in the active place, because a profile is saved to the place the
session is in. It is shared by all three stereos; the home feature owns the wider behaviour
([../home/README.md](../home/README.md)).

`PlaceProfileEditDialog` (reached from "profile settings") holds a loading screen until it has
something true to seed the form with — my row in the cache, or the server's "no profile" handed
down from this page. The form seeds once, on open, so opened any earlier it latched an empty name
and kept it after my profile arrived.
Its top bar reads "내 프로필", and the heading under it names the place the profile applies to
("{{place}}에 적용 중인 프로필 입니다."), since editing it changes nothing in any other place. The
loading screen shows the same top bar, so swapping to the form does not jump.

The screen reports **member divergence** on unmount: how many roster ids have no join row, and how
many active join rows the roster does not list. On unmount specifically, because the join cache
streams in and a mid-hydration snapshot would count every member as roster-only.

## The dialogs

### `UpdateChannelDialog` — the room's shared name

Owner-only: edit the room name and photo, write with `channel.update`. The avatar offers the picker;
images are resized to base64 and capped at 10MB.

It once had a second mode, for an invited member, whose name field saved **my `join.nick`** as a
personal name for the room, shown only to me. That mode is gone, because a group no longer reads that
name anywhere: the server builds one push per message for every recipient, so a group's push can only
carry the shared name, and a member who had named the room saw one title in the app and another on the
lock screen. Names already saved stay on the server, unread. The settings row no longer opens this
dialog for a member; were it opened anyway, the save button stays disabled.

The name is capped at 20 characters with a counter, and the confirm button activates only on a
non-empty, changed value. Transient state is seeded once per open: the observed channel can re-emit
from a background sync while the dialog is open, and re-seeding would discard edits in progress.

### `JoinNickDialog` — my private name for the room

One dialog, two variants, because self and DM need exactly the same write with different copy. It
writes `join.update` with a `nick`, capped at 20 characters, and **an empty value is a valid save**
— it clears the custom name and the title falls back down its chain. The placeholder is whatever the
room falls back to right now, so clearing the field visibly returns to it.

**'Done' is enabled only when something changed** from what the dialog opened with — the name, or in
the self variant the photo — in both variants. What it opened with is seeded once per open, so a
background sync of the channel does not throw away an edit in progress.

The self variant also sets the room's photo: a picked image is prepared as an avatar (10 MB ceiling,
the same as a group room's photo) and written to `channel.thumbnail` with `channel.update`. A save
that changes both writes the photo first and the name after it; a refused photo leaves the dialog
open and writes nothing else. A save that includes the photo says `selfChat.name.infoSuccess`.

The DM variant is also the friend-info sheet: the peer's avatar, a "left the room" line when they
are gone, and the re-invite CTA. The save button stays even though the design frame shows only the
CTA — following the frame literally would leave no way to record a name at all.

**Exactly one instance is mounted.** The dialog fetches my profile on mount, so two instances cost
two round trips and only one can ever be open.

### `MemberProfileDialog` — who is viewing whom

Rows depend on the viewer's role and on the target:

| Viewer / target                                | Rows                                                 |
| ---------------------------------------------- | ---------------------------------------------------- |
| me                                             | profile settings → `PlaceProfileEditDialog`          |
| room owner and/or place owner → another member | (`1:1 대화하기`) · friend settings · remove · report |
| anyone else → another member                   | (`1:1 대화하기`) · report                            |

`1:1 대화하기` leads the rows only where a cloud 1:1 can open from here: the host passes `onStartDm`
when `canStartDmFromProfile` holds — a cloud group room in the session's cloud and place, another
member — and the dialog drops it on my own profile regardless. The rule is
[dm-and-self-chat.md](./dm-and-self-chat.md)'s.

**Remove asks how far first.** `RemoveMemberScopeSheet` offers two scopes — "remove from
<room>" (this room only) and "remove from <place>" (the place and every group room in it) — then a
`ConfirmDialog` worded for the scope picked, then the call: the kick for the room, `place.leave` for
the place. Only the scopes the viewer holds are drawn: the room scope to the room's owner
(`canKick`), the place scope to the place's owner (the place row's `isOwner`, never the room rule).
Even one scope is shown as a choice — the step is where the reader learns how far the removal
reaches — and the bottom button waits for a pick.

The remove row is withheld entirely in a 1:1 and on me or the room's owner; the place scope is also
withheld from the place's owner (`place.ownerId`). The room screen and a thread open the same profile
with no removal at all: removing someone belongs where the roster it changes is in view.

The place scope's copy says "every group room", not "every room": `place.leave` takes the member out
of the place's group rooms and leaves their 1:1s, which the app cannot end for someone else.

**Friend settings and report are UI-only**: neither has a backend, so both acknowledge with a toast.
They are rows rather than hidden items because the design has them, and a toast manages the
expectation better than a dead tap does.

## What not to do

- **Do not read `channel.$join` for anything that must reflect a write.** The notification level and
  the title both read the join cache through `myJoin`.
- **Do not invent a title or an avatar rule here.** `useChannelTitle` and `resolveChannelAvatar` are
  shared with the room header, the home list and place channel management; a fourth answer is how
  the same room ends up with two names.
- **Do not branch the destructive row on ownership alone.** A DM leaves regardless of who owns it.
- **Do not gate the profile prompt on `isMembersLoading` or an empty profile map.** Use the server's
  answer, `usePlaceProfileAbsent`.

## Notes for implementers and tests

- Hooks that must run before the `isError` early return are called above it — the DM peer, the
  title, the invite state, the notification level's mirror and the sheet's open flag — with the
  plain stereo flags derived after it.
- `ChannelUpdateJoinInput` types only `channelId` and `notify`; the engine resolves the join row
  from `channelId + userId` at write time, which is why the level write passes `userId` through a
  cast.
- `ChannelSettingsPage.test.tsx` is the widest test in the feature: the three stereos' section sets,
  which dialog each name row opens, the owner badge, the remove scopes each viewer gets, the notification level (the label each stored
  value shows, the levels each room offers, the no-op re-pick and the failure path), and the
  profile-prompt row. The level mapping itself is tested in `notifyLevel.test.ts` and the sheet in
  `NotifyModeSheet.test.tsx`.

```bash
npx jest --config apps/web/jest.config.js --runInBand --watchman=false apps/web/src/app/features/channels
```

## Further reading

- [dm-and-self-chat.md](./dm-and-self-chat.md) — the title chain, the avatar rule and the re-invite state.
- [data-layer.md](./data-layer.md) — `useChannelJoins`, `useChannelMembers` and the write hooks.
- [invite.md](./invite.md) — where the add-friend row goes.
