# ADR-0245: No desktop logout takes the invited clouds

> Status: Accepted · Decided: 2026-10-27 · Implemented: `fix/guest-logout-invited-clouds`
> · Scope: `apps/desktop-web/src/app/shared/hooks/useAccountResetOnLogout.ts`
> · Supersedes in part: [ADR-0209](./0209-a-signed-in-desktop-account-keeps-its-guests-invites.md) —
> decision 2's "a guest's logout is a delete and still clears everything"
> · The module doc is [apps/desktop-web auth](../../apps/desktop-web/docs/auth/README.md#invites-and-logout-for-a-signed-in-account)

## Context

ADR-0209 kept a signed-in account's invited clouds through its logout, because the device registers
back into the guest that holds the invite grants. It kept the opposite for a guest: a guest's logout
was treated as a delete, on the belief that nothing could sign back into it, and the reset cleared the
cloud cache and the joined-clouds store. Those two records are the only places the rail lists an
invited cloud from.

The belief does not hold. The device id is fixed per install, so the next registration from the same
device — "Start chatting", the start of a Google sign-in, a phone code request — comes back as the
same guest, which still holds every grant. Reproduced on dev: a person joined a cloud by invite,
signed in, logged out (the cloud stayed), started chatting again as the device guest, and logged that
guest out. The rail lost the cloud, and signing back into the account did not bring it back. Yet
`delegate-cloud` for that cloud still succeeded from the device's guest. The delete removed nothing
on the server; it removed the only list this device had.

The same reset also runs when a person backs out of a sign-in (the guest the sign-in registered is
signed out without a confirmation), so this was reachable without ever choosing "Delete and log out".

apps/web never had the problem: its logout clears no cache, and its "clear local caches" setting
leaves the invited-cloud rows alone for the same reason — the cache is the only copy.

## Decision

1. **Every logout keeps the invited clouds.** The reset keeps the cloud cache's invited rows and the
   joined-clouds store whatever the relay role is, and still clears every other cloud row.
2. ADR-0209's other decisions stand: the join entry is offered by the relay role (`isRelayGuest`).

## Alternatives

- **Keep the guest delete, and only skip it on the backed-out sign-in path.** Rejected: the rail's own
  guest logout loses the clouds the same way, and the same device registers into the same guest after
  it too.
- **Rebuild the list from the server after login.** Not possible: there is no server list of a
  person's invited clouds, only a per-cloud `delegate-cloud` for an id already known.

## Consequences

- The guest logout confirmation still says "Delete and log out" and that nothing in the guest can be
  reached again. That copy now overstates what the reset does; changing it is a product wording
  decision left to its own change.
- On a shared machine, the next person to use the same install sees the invited clouds in the rail.
  They are the install's guest's clouds, and that guest is who the next person becomes, so this adds
  no access the device did not already have.
- ADR-0209's note still applies: a row labelled invited by push recovery may not be a grant the guest
  holds, and it now survives a guest's logout as well.
