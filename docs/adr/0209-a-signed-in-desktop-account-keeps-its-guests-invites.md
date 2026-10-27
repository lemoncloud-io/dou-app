# ADR-0209: A signed-in desktop account keeps its guest's invites

> Status: Accepted; decision 2's guest delete superseded by
> [ADR-0245](./0245-no-desktop-logout-takes-the-invited-clouds.md) · Decided: 2026-10-19 · Implemented: `fix/desktop-social-invite`
> · Scope: `apps/desktop-web/src/app/features/chat/components/PlaceRail.tsx` (the join entry) ·
> `apps/desktop-web/src/app/shared/hooks/useAccountResetOnLogout.ts` (every logout path) ·
> `useRelayAccount.ts` (`isRelayGuest`)
> · Amends: [ADR-0156](./0156-an-invited-cloud-is-entered-with-the-invite-login-answer.md) — its
> consequence that desktop-web refuses a signed-in account outright
> · The module doc is [apps/desktop-web auth](../../apps/desktop-web/docs/auth/README.md#invites-and-logout-for-a-signed-in-account)

## Context

On desktop a sign-in (Google or phone) does not replace the device's Guest Session; it links it. The
device registers a guest before the sign-in starts, the exchange is signed with that guest's session,
and the relay records the guest as the new session's link. The guest's id (`delegatorId`) stays on
the device, cleared only by a relay logout. Afterwards the device registers back into the same guest:
`register-device` finds the account by the device alias, every time.

Two things in the desktop app were written as if the account were someone else:

- The profile menu offered "Join with invite" to guests only, on the belief that the invite exchange
  refuses a signed-in account. It does not. `POST /oauth/login-invite` checks no role: it takes the
  code and the `delegatorId`, and links the invited cloud's user to `LMN:{delegatorId}`. When the
  account later switches into that cloud, `delegate-cloud` follows the session's link back to the
  original guest and admits it by invite. The only refusal was the client's own — `useInviteLogin`
  stops an account that has no `delegatorId`, which is the case where there is truly nothing to join
  under.
- Logging out of the account ran the full account reset, which wiped the cloud cache and the
  joined-clouds store. Those are the only places the rail can list an invited cloud from: the relay
  catalog never carries one, and there is no server list to rebuild them. The guest the device fell
  back to still held every grant — messages kept arriving — but its rail showed no invited cloud until
  a push re-cached one at a time.

Both checks also read guest-ness from `useRuntimeProfile().isGuest`, which is the active session's
role. Inside a cloud that is the cloud user's, not the account's.

## Decision

1. **The join entry is offered to a guest and to any account holding a `delegatorId`.** That is the
   same line the exchange draws, so an entry that is shown is one that can succeed. The account hub
   still offers it only on the guest card; the rail menu is the signed-in account's way in.
2. **A signed-in account's logout keeps the invited clouds.** The reset keeps the cloud cache's
   invited rows and the joined-clouds store, and still clears every other cloud row (owned clouds'
   names belong to the account). A guest's logout is a delete and still clears everything.
3. **Both decisions read the relay token's role** (`isRelayGuest`), not the active session's. No relay
   user counts as a guest, as the account hub already does.

## Alternatives

- **Keep the guest-only gate and tell signed-in users to log out first.** Rejected: the server
  accepts the join, so the gate only cost the person a logout and, before this change, their rail.
- **Keep only rows also present in the joined-clouds store.** Safer against a mislabelled row, but the
  store is per profile and newer than many invited rows, so clouds joined elsewhere would still vanish
  on logout. Rejected for now; see below.

## Consequences

- A cache row labelled invited is not proof of a grant the guest holds. Push recovery writes
  `cloudType: 'invited'` for any missing cloud a push names, which can include a cloud the account
  owns. Such a row now survives the account's logout, and on a shared device the next person could
  see a tile they cannot enter. Closing it belongs to the recovery's labelling, not to the reset.
- The reset reads the cloud list and deletes rows one by one, so a cloud write landing in between
  survives. The full clear had a shorter window. A batch delete on the repository would close it.
- The guest-delete confirmation in the rail still reads the active session's role; it is unchanged
  here.
