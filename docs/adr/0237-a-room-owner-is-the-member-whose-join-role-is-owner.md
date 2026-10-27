# ADR-0237: A room's owner is the member whose join role is `owner`, and only a group has one

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/room-roles-and-removal`
> · Scope: `apps/web/src/app/features/channels/lib/channelStereoPolicy.ts` (`isRoomOwner`,
> `roomOwnerIdOf`) and every reader of "who owns this room" in `apps/web` — `hooks/useChannel.ts`,
> `pages/ChannelSettingsPage.tsx`, `pages/ChannelRoomPage.tsx`, `pages/ThreadPage.tsx`,
> `features/home/components/ChannelList.tsx`, `features/place/pages/PlaceChannelManagePage.tsx`
> · Related: [ADR-0068](./0068-dm-peer-departure-and-reinvite.md) — decision 7 (a 1:1 is never
> deleted), which this makes structural rather than a special case
> · Supersedes in part: [ADR-0019](./0019-group-channel-settings-section-layout.md) — its note that owner
> detection reuses `channel.isOwner` as `ownerId === myUid`; `channel.isOwner` now reads this rule
> · The module doc is [apps/web channel settings](../../apps/web/docs/feature/channels/channel-settings.md#who-owns-the-room)

## Context

The web app decided "who owns this room" by comparing a user id with `channel.ownerId`. That field
is the room's creator. For a group the creator is normally the owner, but for a 1:1 it is whoever
sent the invite — so the inviter's row in a 1:1's member list carried a "room owner" badge, and the
inviter's profile carried the owner mark, in a room whose two members are equals. The same field put
the owner badge on my own row whenever I had created the room.

The server already records a role per membership: every join row carries `stereo`, one of
`'' | 'owner' | 'admin' | 'member'`. The creator of a group or a 1:1 is written `owner`, everyone else
`member`. The app never read it. Measured on dev before this change: the role arrives on my own join
(`channel.$join`) and on every row of a room's join list, for relay 1:1s and cloud groups alike.

## Decision

1. **Ownership is the member's join role.** A member owns a room when their join says `owner`. One
   function, `isRoomOwner(room, join, userId)`, answers it, and every surface reads it: my own
   delete-or-leave, the member list's badge, the profile's owner mark, who may remove a member, and the
   owner-first avatar stack in a group header.
2. **Only a group has an owner.** A 1:1 and a self chat answer "no owner" whatever their joins say.
   The server writes `owner` on a 1:1 inviter's join too; the app does not treat that as a role.
3. **A join without a role falls back to the creator.** When the role is absent (`undefined` or
   `null`) — a row cached before the field was read, or a response that leaves it out — the member is
   compared with `channel.ownerId`, so a group never loses its owner and with it the owner's delete and
   member removal. An empty role (`''`) is not absent: the server set it, and it means "no role".

## Alternatives

- **Keep `ownerId`, and special-case the 1:1.** Rejected: it fixes the 1:1 badge and leaves the app
  judging ownership by a field that does not record it. A group whose owner role moves (the server
  type already has `admin`) would keep the creator as owner on every screen.
- **Read the role with no fallback.** Rejected for now: an older cached row with no role would strip a
  group of its owner until the next sync, and the owner would briefly see "leave" where "delete" was.

## Consequences

- A 1:1 shows no owner badge and no owner mark on either member's profile, and its remove action is
  "leave" for both sides — the rule ADR-0068 decision 7 stated, now following from the rule rather
  than from a branch.
- My own row in any room's member list is badged "MY", not "owner" (the member list ranks MY above
  the owner badge, recorded in the module doc).
- Desktop (`apps/desktop-web`) still judges ownership by `ownerId`. It has the same 1:1 badge problem
  and is left for its own change.
