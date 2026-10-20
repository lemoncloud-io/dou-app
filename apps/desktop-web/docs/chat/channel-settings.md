# Channel settings

The channel settings panel is the trailing panel opened from the room header, a sidebar row's menu
or the header's member chip (which lands it on the member list). The code is
`src/app/features/channels/components/ChannelSettingsPanel.tsx`; where it sits among the other
trailing panels is in [`../shell/trailing-panels.md`](../shell/trailing-panels.md).

## Sections

Top to bottom:

- **Channel name**, with Rename for the owner.
- **Members**, with a filter once the roster is longer than five, "Remove from channel" for the
  owner, and "Add members".
- **Notifications**: all messages, mentions only, or off. A 1:1 (`stereo: 'dm'`) offers no
  "mentions only", and one stored that way reads as all: the server sends every message of a 1:1.
  The choice is kept on this device first and handed to the join outbox, which resends it until it
  lands; a write the server refuses is announced.
  The level in the join cache is mirrored into this device's copy (`useDesktopNotifications`), which
  is how a change made on another device arrives, and how a refused write puts back the level the
  join had (the outbox restores the join). In the channel list a mentions-only channel wears an `@` glyph and one that is
  off a crossed bell.
- **Channel ID**, group channels only (below).
- **Leaving and deleting**: Leave for everyone, Delete for the owner. Either one closes the panel and
  clears the selected room.

## Add members

"Add members" opens `AddMembersDialog`, which adds the picked people at once with `channel.invite` —
no link, no accept step. The pool, from `useInviteCandidates`, is **the members of the active place,
minus the channel's current members and me**. The members come from the server's place member list
(`place.list-user`, read through `userRepository.listPlaceMembers` each time the dialog opens), so
someone with no channel at all — invited into the place only, accepted or not — and someone who
shares no channel with me are both offered. Pending invitees are not marked apart; the server has
nothing to tell them by.

- **Two exclusion sources** keep a current member out: the channel record's `memberIds` and the
  channel's roster, refreshed alongside the list. Either alone covers the happy path; both together
  survive a record without `memberIds` or a roster read that failed.
- **"Me" is my id in this cloud** (`useUidInCloud`) and the session's user id both.
- **The roster union is the fallback, never a supplement.** When the list fails — `403` to a
  non-member, or a cloud whose server does not have the action yet — the pool is the old one: the
  union of my channels' rosters, one request per channel. That only holds people I already share a
  room with. While the socket is unverified nothing is fetched and the cached rosters are served;
  the list is asked for on the false→true edge.
- **The second line** names the channels a person shares with me, read from the cached rosters. A
  member sharing none has an empty line.
- **Names** are the place profile's nick and picture over the user's own name and picture — the
  same merge the 1:1 picker and the message rows use. The list load fills the place profile cache
  for each page it reads, but only while the session is on the active place and no switch is in
  flight, since `profile.sync` answers for the session's place.

## Invite by phone

"Invite by phone" on a channel row opens `SendInviteDialog`, which issues a contact invite with
`invite.create` and copies its link. That request rides the relay slot, so the inviter is the relay
user, and the server issues invites to signed-in accounts only: a guest is refused with `403`, so
the row menu does not offer the entry to a relay guest (`isRelayGuest`). A place invite from the
same dialog goes through `user.invite` in the cloud instead.

A refused send keeps the dialog open with a sentence chosen by the status the rejection carries:
"sign in first" for a relay guest's contact invite, "not allowed" for any other `403`, "check the
number" for a `400`, the connection line for the client's own `408`/`499`/`503` (a timeout, a
dropped request, no socket), and the generic line otherwise. A rejection with no status falls back
to the wording (`classifyWireError`). The wire text
itself is shown under that sentence in the dialog, as the failure toast's description, and in the
log as `[INVITE] [SendInvite] failed` with `raw` — View › Toggle Developer Tools opens the console in
packaged builds too. The dialog stays open on a failure, and the error toast rises over its dim
(`docs/shell/layering.md`).

## Channel ID

A service that posts notifications into a channel (a webhook) is pointed at the channel by its id.
The web client shows that id in its address bar; the desktop app has none, so the panel shows it,
selectable as one piece, with a Copy button. Copy puts the id on the clipboard and the button reads
"Copied" for a moment, the same feedback as the User ID on the profile page (`useCopyToClipboard`).

A 1:1 and the self channel do not show it. Neither is somewhere a service posts to, and the panel
has no use for the id there.
