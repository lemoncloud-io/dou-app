# ADR-0207: An owned cloud is reclaimed by whom its token was issued for

> Status: Accepted · Decided: 2026-10-16 · Implemented: `fix/owned-cloud-reclaim-after-sign-in`
> · Scope: `libs/app-runtime/src/session/store/cloudStore.ts` (`CachedCloudTokens.issuedFor`) ·
> `libs/app-runtime/src/session/auth/cloudTokens.ts` · `libs/app-runtime/src/session/auth/cloudSession.ts` ·
> `libs/app-runtime/src/socket/auth/reclaimOwnedClouds.ts` ·
> `libs/app-runtime/src/connection/hooks/useReclaimOwnedClouds.ts`
> · Amends: [ADR-0169](./0169-an-owned-cloud-is-never-held-as-its-invitee.md) decisions 2 and 3 — the
> reclaim no longer depends on the invite entry still being held
> · The module doc is [libs/app-runtime auth](../../libs/app-runtime/docs/auth/README.md#an-owned-cloud-held-as-its-invitee)

## Context

ADR-0169 re-issues an owned cloud that the device holds as an invitee, and recognises the invitee by
the empty delegation JWT the invite entry is assembled with. It names the guest-then-sign-in path —
a guest accepts an invite, then signs in to the account that owns the cloud — as one the reclaim
repairs.

It repairs it only while the invite entry is still held, and an invite entry does not stay one. The
background-slot preparer re-issues a cloud's tokens once its cache entry lapses, and the credential
guard renews them before they do. Each re-issue goes through `delegate-cloud` as the relay user of
the moment — the guest — and the server answers the guest as the invitee. From then on the cache holds
an ordinary issue for the invitee: a signed JWT, the same shape as the owner's. A guest who used the
invited cloud for a while and then signed in to the owning account was left as a member in their own
cloud, and the reclaim had nothing to find. On a device the owner's places did not show at all.

Clearing the per-cloud cache whenever the relay account changes was considered first and rejected:
it fixes the owner, but it also drops the token of every cloud the account is only invited into, and
a re-issue after the sign-in does not always lead back to the invitee. The server links the new
session to the guest it started from for social and phone sign-in, but not for every login, and a
re-issue without that link answers for the account — a user with no rooms in that cloud. The invited
list itself cannot be fetched again either; it lives only in the device's cache.

## Decision

1. **Every cached cloud token records the relay user it was issued under** (`issuedFor`). A
   `delegate-cloud` issue stamps the user read when the exchange **starts**, so an answer that lands
   after a sign-in is stamped as the previous user's, which is what it is. An invite login's answer is
   stamped with the relay user that entered with it. A refresh writeback keeps the stamp the entry
   already had; it renews a credential, not an identity.
2. **An owned cloud is re-issued when its held token was not issued to the relay user signed in
   now** — an invite entry, as before, or an entry stamped with another user. An entry written before
   the stamp existed counts as another user's and is re-issued once, which stamps it. With no relay
   user signed in, nothing is reclaimed. The renewal is ADR-0169's — cache, store when committed, and
   a live slot's socket — and over the committed cloud it **replaces** the stored view and drops the
   selected place whenever the re-issue names another user: an invite entry, as before, or a stored
   token whose uid differs from the re-issued one's. A same-user renewal still merges.
3. **Only owned clouds are reclaimed.** A cloud the account is invited into keeps the invitee's token
   through a sign-in; nothing in this decision touches it, and the invited list is not cleared.
4. **An exchange in flight is joined only by a caller asking for the same relay user.** An exchange
   the guest started is still the guest's when it lands after a sign-in, so a caller asking for the
   account starts its own, and only the latest exchange started for a cloud writes the cache — an
   older answer landing last would otherwise put the previous user back.
5. **The reclaim also runs when the relay token changes and whenever the background-cloud store
   announces**, besides an owned-list change and a cloud-token commit — the first for a sign-in whose
   owned list reads the same, the second for an issue answered after a sign-in, which announces
   nothing else (the store also announces holds, joined-list changes and expiries; each costs a
   storage read). A cloud whose renewal is in flight is not renewed a second time.

## Alternatives

- **Clear the per-cloud cache and identities on every relay account change.** Rejected above: it
  breaks invited clouds whenever the sign-in is not linked to the guest, and the invited list cannot
  be rebuilt from the server.
- **Clear on account change, but only for clouds the new account owns.** The owned catalog is not
  known when the login commits — it arrives from the relay afterwards — so this needs the same
  "owned list resolved" trigger the reclaim already has, plus a way to tell which cached entries
  belong to the previous user. The stamp is that way, and the reclaim is that trigger.
- **Detect by the token's role or the cloud's owner id.** ADR-0169 rejected it for good reasons that
  still hold: the client does not contract on how the server spells either.
- **Key the cache by relay user and cloud.** Every reader of the cache — the switch, the preparer,
  the slots, the renewer, the uid-scoped partitions — would change, to serve a case the stamp
  answers with one field.

## Consequences

- **The first release with the stamp re-issues every owned cloud once** on each device, because
  every existing entry is unstamped. That is one `delegate-cloud` exchange and one socket
  re-registration per owned cloud, after which only real mismatches cost anything.
- **An invite-era token keeps working for invited clouds after a sign-in**, as it did before. Whether
  the server would re-issue the invitee for a given sign-in no longer matters to the client.
- **The stamp is only as good as the relay user it reads.** A login that commits a relay token with
  no `uid` or `id` leaves the comparison with nothing to compare, and the reclaim does nothing until a
  token that names its user arrives.
