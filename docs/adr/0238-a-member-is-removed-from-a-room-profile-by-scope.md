# ADR-0238: A member is removed from a room profile by scope — this room, or the room's place

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/room-roles-and-removal`
> · Scope: `apps/web/src/app/features/channels/components/MemberProfileDialog.tsx`,
> `components/RemoveMemberScopeSheet.tsx`, `pages/ChannelSettingsPage.tsx`
> · Supersedes in part: [ADR-0197](./0197-leaving-a-place-and-removing-a-member-run-on-place-leave.md) —
> decision 5's "This screen is the only removal entry point". The rest of ADR-0197 stands.
> · Related: [ADR-0237](./0237-a-room-owner-is-the-member-whose-join-role-is-owner.md) — the room-owner
> rule the room scope reads
> · The module doc is [apps/web channel settings](../../apps/web/docs/feature/channels/channel-settings.md#memberprofiledialog--who-is-viewing-whom)

## Context

A member's profile inside a room's settings offered "remove" to the room's owner, and it removed the
member from that room at once after a confirm titled "delete friend". Removing someone from a place
lived only on the place's member screen (ADR-0197 decision 5). The product's own definition of the
flow is one entry with a choice: from a member's profile, pick how far — this room, or the place —
then confirm in words that say what that scope does.

## Decision

1. **"Remove" on a room profile asks for a scope first.** A sheet offers "remove from <room>" and
   "remove from <place>", each with one line on how far it reaches; a confirm worded for the picked
   scope follows; then the call runs. The room scope is the existing kick (`channel.leave` with the
   member's id); the place scope is the existing `place.leave` with the member's id
   (`PlaceRepository.removeMember`). No new server call.
2. **Only the scopes the viewer holds are offered, and a single one is still a choice.** The room scope
   goes to the room's owner, the place scope to the place's owner (the place row's `isOwner`). The
   sheet is shown even with one scope, because it is where the reader learns how far the removal
   reaches.
3. **The row's absence rules stay.** No remove in a 1:1, none on me or on the room's owner; the place
   scope is also withheld from the place's owner. The room screen's and a thread's profiles keep no
   removal.
4. **The place scope's copy says "every group room".** `place.leave` takes the member out of the
   place's group rooms and leaves their 1:1s; the app cannot end another person's 1:1, so the copy
   does not promise it.

## Alternatives

- **Keep the place member screen as the only place removal.** Rejected: the product defines the
  profile entry, and a room owner who is also the place owner had to leave the room to do it.
- **Skip the sheet when only one scope is available.** Rejected: the one-scope case is most often the
  place owner who is not the room owner, and there the only option is the wide one — the case where
  saying how far it reaches matters most.

## Consequences

- Two screens send a place removal. They share the repository call and its cache work, so the
  room's member list drops the member the same way after either.
- The old "delete friend" confirm and its strings are gone; completion and failure toasts read
  "remove".
- When the server starts ending 1:1s on a place removal, the place scope's copy can drop "group".
