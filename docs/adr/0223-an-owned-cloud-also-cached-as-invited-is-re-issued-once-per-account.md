# ADR-0223: An owned cloud also cached as invited is re-issued once per account

> Status: Accepted · Decided: 2026-10-21 · Implemented: `fix/owned-cloud-guest-token`
> · Scope: `libs/app-runtime/src/socket/auth/reclaimOwnedClouds.ts` ·
> `libs/app-runtime/src/connection/hooks/useReclaimOwnedClouds.ts` ·
> `libs/app-runtime/src/session/auth/cloudTokens.ts` (`reissueCloudTokens`, `lastIssuedForOf`) ·
> `libs/app-runtime/src/session/store/cloudStore.ts` (`chatic-reclaimed-clouds`) ·
> `apps/web/src/app/hooks/useInvitedClouds.ts` · `apps/web/src/app/runtime/BackgroundCloudsRunner.tsx` ·
> `apps/desktop-web/src/app/shared/hooks/useClouds.ts` · `apps/desktop-web/src/app/runtime/BackgroundCloudsRunner.tsx`
> · Amends: [ADR-0169](./0169-an-owned-cloud-is-never-held-as-its-invitee.md) decisions 2 and 3
> · Second attempt at what [ADR-0207](./0207-an-owned-cloud-is-reclaimed-by-whom-its-token-was-issued-for.md)
> tried and withdrew
> · The module docs are [libs/app-runtime auth](../../libs/app-runtime/docs/auth/README.md#an-owned-cloud-held-as-its-invitee)
> and [apps/web invite](../../apps/web/docs/feature/invite/README.md#accepting-a-cloud-invite), and for desktop-web
> [the cloud rail](../../apps/desktop-web/docs/shell/cloud-rail.md#an-owned-cloud-that-a-guest-entered-first)

## Context

On iOS, Android and the mobile web, an owner who had used one of their own clouds as an invited
guest on a device, then signed in to the owning account there, entered that cloud as a member.
desktop-web can reach the same state: invite login and then a sign-in. Its background runner never
mounted ADR-0169's reclaim, so desktop had no repair at all.

The server answers this correctly on its own. `delegate-cloud` picks who to issue for from the relay
session that signs the request: the cloud's owner is issued as the owner, a session linked to a
device guest is issued as that guest (the owner when the guest owns the cloud, the invitee
otherwise), a guest session as the invitee, and anyone else gets a 403. So once the account is
signed in, asking `delegate-cloud` for a cloud it owns answers with the owner. The device stopped
asking. It keeps one token per cloud id and replays it while it is in date. The cloud socket's own
refresh keeps it in date with the same identity, without going through `delegate-cloud` again.

ADR-0169 repairs this only while the held token is still the invite login's own answer, which it
recognises by the empty delegation JWT the device assembles for it. That mark does not last. Before
the sign-in, the credential guard and the background-slot preparer re-issue the cloud through
`delegate-cloud` as the guest, and the server answers the guest as the invitee with an ordinary
signed token. From then on the token looks exactly like the owner's would, and the reclaim finds
nothing.

ADR-0207 fixed this by stamping every cached token with the relay user it was issued for, and
re-issuing every owned cloud whose stamp named someone else. On the first release that meant every
owned cloud on every device, because no existing entry had a stamp. Production reported
`delegate-cloud` 403s that day and it was rolled back. The cause was never pinned down, but the
fan-out was the one thing in that release that could have made those calls.

## Decision

1. **The reclaim also covers an owned cloud this device has cached as an invited cloud.** The app
   hands the runtime the clouds that are both in the owned catalog and in the invited cache
   (`useInvitedClouds().ownedAlsoInvitedIds`, which ignores who accepted the row). For each one, the
   runtime re-issues through `renewCloudSession` once per relay user, whatever the held token looks
   like. The invited row is the trace the token no longer carries: a device without one never entered
   that cloud as a guest, so it cannot hold a guest's token for it.
2. **"Once per relay user" is a record in the cloud store.** `chatic-reclaimed-clouds` maps a cloud id
   to the relay uid it was last re-issued for. It is written only after a renewal succeeds, and only
   if that relay user is still signed in. It is cleared at logout together with the token cache and
   the identities. A guest who carries on after a sign-out and later signs in again is reclaimed
   again. An owned-and-invited cloud with no token held (not committed, no cache entry) and no
   exchange on the wire is recorded without an exchange, because its next entry asks `delegate-cloud`
   as the account anyway.
3. **A renewal counts only if its exchange was asked as the account.** A renewal joins an exchange
   already in flight for the cloud. One the guest started before the sign-in answers for the guest,
   even if it lands afterwards. `issueCloudTokens` therefore remembers, in memory only, which relay
   user each cloud's latest exchange was asked as, read when the exchange started. The reclaim records
   a renewal only when that matches the relay user signed in now. Otherwise the next trigger asks
   again with a fresh exchange.
4. **A failed renewal backs off for 30 minutes**, in memory. This applies to ADR-0169's invite-entry
   mark as well. The trigger fires on every committed cloud token, and the committed cloud's refresh
   commits one every few minutes, so without the backoff a renewal that cannot succeed would call
   `delegate-cloud` at that rate until logout. That is the kind of traffic that got ADR-0207 rolled
   back.
5. **A committed re-issue replaces the stored view when the uid changes.** `reissueCloudTokens` used
   to replace rather than merge only over an invite entry. It now also replaces when the stored and
   re-issued tokens name different uids, and drops the selected place in both cases. A re-issue that
   names the same uid still merges, as before.
6. **The invited row stays.** It is still hidden by `useInvitedClouds` for being owned. The device's
   guest is still a member of the cloud on the server, and the row is how that guest gets back in
   after the account signs out.

## Alternatives

- **ADR-0207 again: stamp every token, re-issue every owned cloud whose stamp differs.** It covers more
  cases, such as a guest's token for an owned cloud the device never cached as invited, which needs
  something other than this app's invite flow to get there. It also costs a `delegate-cloud` call for
  every owned cloud on every device on its first run. That fan-out was shipped and rolled back.
- **Delete the invited row once the cloud is reclaimed, and use the deletion as the "done" mark.** No
  new store key would be needed. But a guest who signs out could then no longer reach the cloud
  without a new invite, and the invited list cannot be fetched again from the server. A push from
  that cloud would also bring the row back through `recoverInvitedCloudIfMissing`, which would
  re-arm the reclaim.
- **Let the owned row and the invited row each enter as their own identity.** The cache, the identity
  map, the selection, the background slots and the uid-scoped partitions would all have to be keyed
  on cloud plus identity. It would not last either: once the account is signed in, `delegate-cloud`
  cannot issue the invitee for a cloud the account owns, so the invitee's token could not be renewed.
  ADR-0169 rejected this for the same reasons.
- **Clear the token cache on sign-in.** ADR-0207 already rejected this. It also drops the tokens of
  clouds the account is only invited into, and the re-issue after a sign-in does not always lead back
  to the invitee.

## Consequences

- **The cost is one `delegate-cloud` exchange per owned-and-invited cloud, per account, per device.**
  Every other owned cloud costs only a storage read, as it did under ADR-0169.
- **A cloud only reaches the guest's token through the invited cache.** If a guest's token for an
  owned cloud got onto the device some other way, with no invited row, it is not repaired. ADR-0207's
  stamp would have caught that case. Nothing in the app is known to produce it.
- **A joined guest exchange delays the repair but does not stop it.** The renewal that joined it
  still commits the guest's answer, and the owner stays a member until the next trigger (a list change,
  or the next committed cloud token, at most a few minutes). That trigger starts its own exchange as
  the account.
- **A transient failure leaves the owner as a member for up to 30 minutes**, for example being offline
  at the moment of sign-in. A reload clears the backoff.
- **The push recovery widens the overlap a little.** `recoverInvitedCloudIfMissing` caches a cloud a
  push names as invited when the cache has no row for it, and that can be a cloud the account owns.
  Such a cloud is re-issued once per account like any other in the overlap.
- **A renewal whose socket re-registration fails is still recorded.** `renewCloudSession` reports
  success once the tokens are re-issued. If that slot's socket then fails to re-register, it can keep
  refreshing as the guest and merge that back over the owner, and the record stops a second attempt.
  ADR-0169's invite-entry path has the same hole. Closing it needs `renewCloudSession` to report its
  two halves separately.
- **Both shells mount it.** desktop-web's runner now hands over its owned clouds and its own
  owned-and-invited overlap, from the same `invitecloud` rows its rail reads. That also gives desktop
  ADR-0169's invite-entry repair for the first time. The hook's second argument is required, so a
  shell cannot leave it out by accident.
- **The owned catalog is trusted to list only owned clouds**, as under ADR-0169. If it ever listed a
  cloud the account is only invited into, a session with no device-guest link would get a 403 for it.
  The renewal would then fail, nothing would be recorded, and it would be retried on each trigger.
