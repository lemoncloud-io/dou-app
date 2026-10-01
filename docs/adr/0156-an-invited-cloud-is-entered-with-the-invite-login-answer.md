# ADR-0156: An invited cloud is entered with the invite login's answer

> Status: Accepted · Decided: 2026-10-01
> · Scope: `apps/web/src/app/features/invite/accept/` · `apps/web/src/app/hooks/useInvitedClouds.ts` ·
> `apps/web/src/app/utils/invitedCloudAcceptance.ts` · `libs/app-runtime/src/session/auth/{cloudSession,cloudTokens}.ts` ·
> `libs/app-runtime/src/session/hooks/session/actions/useSwitchCloudSession.ts` ·
> `libs/app-messages/src/types/model/cache.ts` (`CacheCloudView.acceptedBy`)
> · Amends: [ADR-0119](./0119-every-joined-cloud-keeps-a-socket-session.md) decision 1 — the invited
> clouds handed to the background sockets are the ones the device user accepted, not the whole cache
> · The module doc is [apps/web invite](../../apps/web/docs/feature/invite/README.md#accepting-a-cloud-invite)

## Context

Accepting a cloud invite on iOS failed in production: the invite was accepted and the room opened, but
every request in it answered `403 not a member of channel`. Reproduced on production on 2026-10-01,
the cause was who the session entered the cloud as.

The invite login (`login-invite`) is sent with the `delegatorId` — the device user registered on first
launch, which a sign-in does not replace — and the server binds the invite's member to it. Its answer
is that member's own cloud token. Since the 2026-06 channel refactor the app threw that answer away and
entered the cloud with an ordinary switch, which re-issues through `delegate-cloud`. That call answers
for the relay user **as it is now**, and two server behaviours, both measured, made that the wrong user:

- after a sign-in the relay user is the account, not the device user the invite was bound to — the
  relay identity token's `did`, meant to name the device user, is empty;
- `delegate-cloud` into a cloud the relay user was never in mints an empty user there, and the invite
  login then cannot attach its member to that relay user.

The second one was reachable without a sign-in. The invited-cloud cache is one partition per device,
not per user: each web tab starts its own device user, and a cloud one of them accepted reached the
next one's list. ADR-0119 hands that list to the background sockets, which re-issue every listed
cloud, so the next device user was delegated into the cloud before it accepted anything.

## Decision

1. **An invited cloud is entered with the invite login's answer.** `switchCloud(cloudId, { inviteLogin })`
   commits that token as it is — into the store and the per-cloud cache, replacing rather than merging
   whatever the cloud held — and re-registers a background socket already up for it. Entry no longer
   depends on what kind of relay user the device has. An answer that cannot be entered with (no
   identity token, no endpoint) falls back to the ordinary re-issued switch.
2. **The cloud is entered before it is cached.** Caching lists it; a committed cloud is left out of
   the background list, so nothing re-issues it under the entry.
3. **An invited cloud is listed only for a device user that accepted it.** The cached row records
   `acceptedBy` (the accepting `delegatorId`s), and `useInvitedClouds` leaves out rows other device
   users accepted. A row with no `acceptedBy` predates the field and is kept for everyone.

## Alternatives

- **Send the relay account as `delegatorId`.** Tried on production: `login-invite` accepted it, and
  the next `delegate-cloud` was refused (`has no permission on cloud`). Acceptance is per device.
- **Partition the cloud cache per user, or clear it when the device user changes.** Invited clouds have
  no server list to refill from, so either would lose them for the user they belong to.
- **Hide rows with no `acceptedBy`.** The same loss, for every install that predates the field.

## Consequences

- **A renewal still re-issues through `delegate-cloud`.** A cloud entered by a signed-in device keeps
  the invitee while the cloud socket refreshes its own token; a renewal answers for the account, which
  the server refuses. Closing it needs the relay session to name its device user (`did`) — a backend
  question, recorded in the module doc.
- **Unattributed rows still feed the background sockets**, and so do two paths that do not read the
  list: a push tap's cloud switch and the push-driven recovery of a missing row. They can still mint an
  empty user in a cloud the device user was not granted; with entry no longer re-issued, that no longer
  blocks a later acceptance.
- **apps/web only.** desktop-web neither writes nor reads `acceptedBy`, and accepts invites through its
  own flow; it refuses a signed-in account outright.
- Two tabs accepting the same cloud at once can lose one `acceptedBy` entry: the write reads the row
  and replaces the field.
