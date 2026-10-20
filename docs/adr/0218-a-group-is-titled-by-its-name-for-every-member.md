# ADR-0218: A group is titled by its name for every member

> Status: Accepted · Decided: 2026-10-20 · Implemented: `feat/push-payload`
> · Scope: `apps/web/src/app/features/channels/lib/resolveChannelTitle.ts` ·
> `components/UpdateChannelDialog.tsx` · `pages/ChannelSettingsPage.tsx`
> · Supersedes in part: [ADR-0023](./0023-channel-detail-dialogs-figma-redesign.md) — decision 1's
> invitee mode, and decision 2's `join.nick` merge for groups
> · Related: [ADR-0217](./0217-a-chat-push-body-key-names-the-room-shape.md) — the group push this
> title now matches
> · The module doc is [apps/web channels](../../apps/web/docs/feature/channels/dm-and-self-chat.md#naming)

## Context

`join.nick` is a member's own name for a room, stored on their join row. ADR-0023 let an invited member
of a group set it from the room info dialog, and put it at the top of the group title chain for
members: the app showed `join.nick`, then `channel.name`. The owner's own `join.nick` was ignored, so
an owner always saw the shared name.

A group's push is now titled with the room's name (ADR-0217). The server builds one push payload per
message and fans the same payload out to every recipient, so the title cannot carry each recipient's
own `join.nick`; it carries `channel.name`. A member who had named the room therefore saw one title in
the app — on the home list, the room header, settings, search and the place lists — and another on
the lock screen and the in-app banner, for the same room.

Every surface that draws a group's title goes through `resolveChannelTitle`. Outside it, only the room
info dialog and the self/DM name dialog read `join.nick`.

## Decision

A group's title is `channel.name` for every member, owner or not; an empty name falls to the unnamed
label. The app no longer reads `join.nick` for a group.

A member can no longer set a name for a group:

- The room-name row in a group member's settings is not a button — no chevron, no tap — the same
  treatment a cloud 1:1 already gets, for the same reason: an editor that saves a name no screen will
  ever show is worse than no editor.
- `UpdateChannelDialog` is owner-only. Its invitee mode and the two strings only that mode used are
  removed. Were it opened for a member anyway, it saves nothing.

1:1 rooms (ADR-0039) and the self chat (ADR-0040) are unchanged: their title chains still start with
`join.nick`.

Nothing changes on the server. `join.nick` values already saved on group join rows are left as they
are, and the API that writes them is untouched; the app just stops reading them for a group.

## Alternatives

- **Keep the dialog open for members with the name field disabled.** It would open onto a screen
  with nothing to do: the photo was already read-only for a member, so the only thing left would be
  the room's name, which the row itself already shows.
- **Carry each recipient's `join.nick` in the push.** It would need one payload per recipient instead
  of one per message, changing the server's fan-out. Out of proportion to a name very few members
  set.

## Consequences

- **Members who named a group see its shared name instead**, on every surface, and have no way to
  name it again. A room without a name shows the unnamed label.
- **The app changes before the push does.** Until the server sends group pushes titled with the room
  name, a group push is still titled with the sender, so for that window the app header (room name)
  and the banner title (sender) differ for everyone, not only for members who had named the room.
- **Two title differences remain, both in 1:1 rooms**, and are out of this decision. A 1:1 with more
  than two people uses my `join.nick` in the app, but the push carries an alias only for a room of
  exactly two. A cloud 1:1 ignores the server-seeded `join.nick` in the app, while the push carries it
  as the alias.
- The desktop app already titles groups with `channel.name` only, and needs no change.
