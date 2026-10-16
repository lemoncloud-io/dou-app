# ADR-0169: An owned cloud is never held as its invitee

> Status: Accepted · Decided: 2026-10-06 · Implemented: `fix/self-invited-cloud-token`
> · Scope: `libs/app-runtime/src/session/auth/cloudTokens.ts` (`isInviteLoginEntry`, `reissueCloudTokens`) ·
> `libs/app-runtime/src/socket/auth/reclaimOwnedClouds.ts` ·
> `libs/app-runtime/src/connection/hooks/useReclaimOwnedClouds.ts` ·
> `apps/web/src/app/runtime/BackgroundCloudsRunner.tsx` ·
> `apps/web/src/app/features/invite/accept/hooks/useInviteAccept.ts`
> · Amends: [ADR-0156](./0156-an-invited-cloud-is-entered-with-the-invite-login-answer.md) decision 1 —
> an invite into a cloud the account owns is not entered with the invite login's answer
> · The module docs are [libs/app-runtime auth](../../libs/app-runtime/docs/auth/README.md#an-owned-cloud-held-as-its-invitee)
> and [apps/web invite](../../apps/web/docs/feature/invite/README.md#accepting-a-cloud-invite)

## Context

On production, an owner who had accepted their own cloud invite link on their device then tapped the
cloud under "My Cloud" in the switcher, and the session came up with `userRole: 'member'`.

The backend explains the role on its own. Its delegation rules make `delegate-cloud` answer the
cloud's owner as `owner`, and anything else it delegates (a guest, or the guest a social session
started from) as `user` — never `member`. The `member` role belongs to the user an invite creates,
and the invite login is what returns that user's token. So the session was holding the invite login's
answer, not a delegate-cloud issue.

The client explains why. ADR-0156 enters an invited cloud with the invite login's answer and writes it
into the per-cloud token cache, replacing whatever the cloud held. That cache — like the cloud
identity map and the background slots — is keyed by cloud id alone. An owned cloud and the same cloud
reached through an invite share the id, so the owner's token was replaced by the member's, and every
later entry replayed it: a switch from the owned row serves the cache while it is in date, and a
background slot signs from it. The switcher already hides an invited row whose cloud is owned; the
token underneath was never reconciled the same way.

A second path reaches the same state without the owner's own link: a guest accepts an invite, then
signs in to the account that owns the cloud.

## Decision

1. **An invite into a cloud the account owns is entered as the owner.** The accept pipeline checks the
   owned catalog and, for an owned cloud, enters through the ordinary `delegate-cloud` switch instead
   of the invite login's answer. The invite login itself still runs — the server has already bound the
   device's guest as a member by then — and the invited row is still cached, hidden by the switcher.
2. **An owned cloud held as an invitee is re-issued as the owner.** The app hands its owned catalog to
   `runtime.connection.useReclaimOwnedClouds`; for every owned cloud whose held delegation half (the
   store's while committed, the cache's otherwise) is an invite entry, the runtime renews it through
   `renewCloudSession`, which replaces the cache, the store when committed, and a live slot's socket
   registration. It runs when the owned list changes and when a cloud token is committed, because
   either can come second. This repairs devices that already hold the invitee, the
   guest-then-sign-in path, and an accept whose catalog had not resolved by the time it entered.
   Over the committed cloud the re-issue **replaces** the stored view instead of merging into it, and
   drops the selected place: both belonged to the invitee.
3. **An invite entry is recognised by the empty delegation JWT it is assembled with.** Nothing else
   writes one; every delegate-cloud issue returns a signed token.

## Alternatives

- **Show both rows and let each enter as its own identity.** The cache, the identity map, the
  selection, the background slots and the uid-scoped local caches would all have to key on cloud id
  plus entry kind — the whole session layer, for a state with no product use. In one's own cloud the
  invitee is a second person: what it sends reads to the owner as someone else's message.
- **Detect by the token's role or the cloud's `ownerId`.** It would tie the repair to how the server
  spells roles and which id space `ownerId` uses, neither of which the client contracts on. The empty
  JWT is the client's own write.
- **Re-run the reclaim only when the owned list changes.** An invite entry committed after the
  catalog resolved is never followed by a list change, so it would stay held for the session.
- **Drop the cached entry instead of renewing.** A drop repairs the next entry but not the committed
  cloud's store or a live slot's socket, both of which keep the invitee until the user leaves.
- **Prevent at accept only.** Leaves every device that already holds the invitee broken until its
  token lapses or the user signs out, and misses the guest-then-sign-in path entirely.

## Consequences

- **A device that held an owned cloud as an invitee costs one re-issue** the first time the catalog
  resolves; any other device costs a storage read per owned cloud on each catalog change.
- **The device's guest stays a member of the owner's cloud on the server.** The client stops using
  that identity; it cannot remove it, and the switcher's hidden invited row is what keeps it reachable
  if the account signs out and the guest carries on alone.
- **The renewal can fail** (offline, a stale relay credential). The invitee stays held until the next
  owned-list change or cloud token commit runs the reclaim again.
- **The reclaim trusts the owned catalog to be owned-only.** It is the relay's `view: 'mine'` list,
  which the rest of the app already reads as ownership. If it ever carried a cloud the account is
  only invited into, the reclaim would re-issue that cloud through `delegate-cloud` — the entry
  ADR-0156 exists to avoid.
