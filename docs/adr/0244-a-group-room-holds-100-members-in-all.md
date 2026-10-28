# ADR-0244: A group room holds 100 members in all, so one invite picks only the seats left

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/room-roles-and-removal`
> · Scope: `apps/web/src/app/features/channels/pages/InvitePage.tsx` ·
> `components/PlaceInviteTab.tsx` · `components/ContactInviteTab.tsx`
> · Supersedes in part: [ADR-0022](./0022-channel-invite-page-web-ui-kit.md) — "a plain selection cap of
> 100, unrelated to the current member count", and its toast
> · The module doc is [apps/web channel invite](../../apps/web/docs/feature/channels/invite.md#the-tab-shell)

## Context

Adding people to a group room capped one selection at 100, whatever the room already held (ADR-0022). A
room of 90 could take 100 more. The product definition caps the room: 100 members in all, and a pick
past that is refused with the room-limit notice — a string the app already carried and never showed.

## Decision

1. **The cap is the room's.** The channel invite page caps a selection at `100 − memberCount`, both tabs
   alike. A new group with no members counted offers all 100; a full room offers none.
2. **A pick past it is explained, not toasted.** The page shows the room-limit alert
   (`chat.settings.memberLimit`); the tabs report the refused pick through `onLimitReached`. Without that
   prop a tab keeps its own batch-cap toast, which the place invite page still uses.
3. **People invited by contact who have not joined are not counted.** Nothing on the client can see them;
   the server is where that count belongs.

## Alternatives

- **Keep the selection cap and add a room check on send.** Rejected: it lets a person pick people the
  room cannot take and only says so after the work is done.

## Consequences

- The counter beside the tabs reads against the seats left (`2/2` in a room of 98), not against 100.
- Pending contact invites can still push a room past 100 once they are accepted, until the server refuses
  them.
