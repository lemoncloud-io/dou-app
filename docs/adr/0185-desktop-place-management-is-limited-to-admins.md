# ADR-0185: The desktop offers place management to administrators only

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/desktop-place-manage`
> · Scope: `apps/desktop-web/src/app/shared/utils/placeAccess.ts` (`canManagePlaces`,
> `readPlaceManageAccess`) · `apps/desktop-web/src/app/shared/hooks/useClouds.ts` (`canCreatePlace`)
> · `apps/desktop-web/src/app/features/chat/components/PlaceRail.tsx` (the place menu)
> · The module doc is [apps/desktop-web shell/place-rail.md](../../apps/desktop-web/docs/shell/place-rail.md)

## Context

The desktop place rail could make a place, and offered that to every account that owned the cloud it
was in — the rule the mobile app applies. It could not edit a place or delete one. Deleting did not
exist in any client: the socket contract has `place.delete`, and nothing called it.

Editing and deleting are being added to the desktop first. A place holds the channels and messages of
everyone in it, so a delete is the most destructive thing the rail can do, and how the server answers
it for an ordinary owner has not been exercised from a client yet.

Until now the repository had no logic that told an administrator from anyone else. `userRole` was
compared against `'guest'` and nothing more. ADR-0092 was written on that premise, and it no longer
holds from here on.

## Decision

**On the desktop, making, editing and deleting a place are offered to an administrator, and to
nobody else.** The condition is added to the existing ones (not a guest, active in a cloud, the cloud
is the account's own and open); it replaces none of them.

- **Administrator means `userRole === 'admin'` on the relay account**, read from the relay token.
  The session's role is the cloud user's while a cloud is connected, and that differs per cloud for
  one person.
- **One rule for all three actions.** `canManagePlaces` is a pure function; the tile and the menu
  read the same answer.
- **A development build adds two accounts by email**: the shared sign-ins the team uses on the
  development server. The list is a constant beside the rule, applied only when `env.buildStage` is
  `LOCAL` or `DEV`. `env.buildStage` is baked into the bundle and cannot be set from a page.
- **It hides entries; it does not protect anything.** The server decides, and a refusal is shown in
  the dialog or toast of the action that was refused.

## Consequences

- An owner who is not an administrator loses the **New place** tile on the desktop that the previous
  release gave them. They still make places in the mobile app, whose rule is unchanged, so the two
  apps now differ on purpose.
- The repository now reads the admin role in one place. Whether the relay token carries `'admin'` for
  the accounts expected to have it has not been measured in production; if it does not, nobody sees
  the entries there, which fails closed.
- Two account emails are named in the rule. They are addresses, not credentials, and both already
  appear elsewhere in this repository.
- Opening this to every owner later is a one-line change to `readPlaceManageAccess`.

## Alternatives

- **Allow one production account by its user id.** Considered first, as a way to let one named person
  through in production. Dropped: it puts a production identifier in a public repository for good, and
  the admin role already says the same thing without naming anyone.
- **Keep creation open to every owner and gate only edit and delete.** Leaves the rail with two rules
  for one menu, and creation is the entry to the same server path whose answers are not yet known.
- **Read the role from the session.** One line shorter, and wrong inside a cloud: the same person
  would be an administrator in one cloud and not in the next.
- **Put the email list in the config registry.** The registry gives per-stage values and a read-only
  key, which fit. It is also shared by every app and its key count is asserted and documented in
  several places, which is a lot of surface for a list one app reads in one function.
- **A build variable for the list.** Keeps the addresses out of the repository, and needs a CI secret
  and a workflow change for something that is not secret.
