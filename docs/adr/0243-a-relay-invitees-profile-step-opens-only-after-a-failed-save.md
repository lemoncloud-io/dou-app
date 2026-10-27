# ADR-0243: A relay invitee's profile step opens only after a failed save, and its X goes on into the accept

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/room-roles-and-removal`
> · Scope: `apps/web/src/app/features/invite/accept/components/RelayInviteAccept.tsx` ·
> `hooks/useRelayInviteFlow.ts`
> · Supersedes in part: [ADR-0041](./0041-place-profile-as-invite-precondition.md) — for the invitee only:
> decision 1's "no DM is accepted without a name" and decision 2's X back to the confirmation screen. The
> inviter's side of ADR-0041 is unchanged.
> · Related: [ADR-0161](./0161-a-place-profile-is-written-from-inside-its-place.md) — the cloud invite's
> "required until a save fails" rule, which this extends to the relay invite
> · The module doc is [apps/web relay invite accept](../../apps/web/docs/feature/invite/relay-invite-accept.md#the-profile-is-a-precondition-not-a-gate)

## Context

A person accepting a 1:1 invite by phone number is asked for a place profile right before the accept
(ADR-0041). Its X went back to the invite's confirmation screen with nothing accepted, so the step could
be left at any time — and an invitee whose save kept failing had no way into the room at all: every
accept led back into a form the server would not take.

The cloud invite already answered this the other way (ADR-0161): the step has no X until a save has
failed once, and after that X enters without a profile. The product definition gives the relay invite
the same rule.

## Decision

1. **No X until a save has failed.** The dialog is not dismissible before that, so the step is required.
2. **After a failed save, X skips the profile and continues the accept.** The flow records the skip and
   runs the accept chain again; the profile check lets it through. The skip outlives a later
   verification in the same flow — it records a decision, not a saved row the identity swap could orphan.
3. **The profile still comes before the accept.** Nothing moves after it; the force-quit case ADR-0041
   guards against stays closed.

## Alternatives

- **Keep X back to the confirmation screen.** Rejected: it leaves a person whose save the server refuses
  no way in, and it differs from the cloud invite for no reason the user can see.
- **X skips at any time.** Rejected: the name is what the inviter sees in the room; asking for it is
  worth one required attempt.

## Consequences

- An invitee can now end up in a 1:1 with no profile, but only after the server refused a save. The
  missing-profile prompts elsewhere (home's banner, the room-settings nudge) pick that up.
- The relay and cloud invites give the profile step the same exits.
