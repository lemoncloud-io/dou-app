# ADR-0166: The place invite is a Lab experiment, off until a device turns it on

> Status: Accepted · Decided: 2026-10-02 · Implemented: `feat/place-invite-lab-experiment`
> · Scope: libs/config `feature.placeInvite` · apps/web `features/mypage` (`LabPage`),
> `app/hooks/usePlaceInviteExperiment`, `app/utils/placeInviteGate`, the home profile menu,
> `features/invite` (`PlaceInvitePage`)
> · Amends: [ADR-0139](./0139-an-owner-invites-into-a-place-without-a-room.md) decisions 1 and 2 —
> who is offered the entry, and the gate's `hidden` rule
> · The module docs are [apps/web invite/place-invite.md](../../apps/web/docs/feature/invite/place-invite.md)
> and [apps/web mypage](../../apps/web/docs/feature/mypage/README.md)

## Context

ADR-0139 put "Invite to place" on the home profile menu of every owner of a cloud place. The same
record lists three things the client cannot close: the owner cannot see who they invited, an
unaccepted invite cannot be taken back, and a member cannot leave a place.

Trying the feature on the dev servers showed the first one is what people run into. Once someone is
in the place, the owner wants to put them in a room — and cannot. The room invite's "place members"
tab is the union of the rosters of the rooms the owner is in, so a person who is only in the place
appears in none of them. Nothing on the backend lists a place's members, or a cloud's. The
list-shaped calls the app can make are per room (`channel.list-user`, `channel.sync-users`), per
place but only for people with a place profile (`profile.sync`), or about the caller
(`user.my-site`).

So the feature works, and it leaves its users stuck one step later. That is the case the Lab page was
built for. The page existed with nothing on it but the hidden debug unlock, and the config registry
already had a `labs` surface reserved for exactly this — default off, killable by the server — that
no key had claimed.

## Decision

### 1. One `labs` key, one switch on the Lab page

`feature.placeInvite` is a boolean, default `false`, `surface: 'labs'`, writable by `local` and
`server`, persisted `local`, applied live. The Lab page draws one hand-built row for it under an
"Experiments" card. There is no generic renderer; each experiment gets its own row, as each `user`
key does in Settings.

### 2. The switch is an input to the gate, not a second check beside it

`resolvePlaceInviteGate` takes `isExperimentEnabled` as a required field, and off means `hidden`.
The home menu entry and `PlaceInvitePage` already shared that one function so they could never
disagree; making the switch part of it keeps that true. With the switch off the menu has no entry,
a direct visit to `/invite/place/:placeId` (an old link, the back stack) is sent home without
waiting for the place row, and a page already open in the same tab leaves and refuses to send —
exactly what a non-owner gets. Another tab keeps the value it read until it reloads: the config store
does not listen for storage changes from other tabs.

### 3. Nothing else in ADR-0139 moves

Who sees the entry once the switch is on, when it is greyed out, what goes on the wire and what the
recipient sees are unchanged.

## Alternatives

- **Move the entry into the Lab page** — a Lab row that opens the invite directly. Rejected: the
  server files the invite under the place the session is on, and the Lab page shows no place. An
  owner would be inviting into a place the screen never named. The home menu sits beside the place
  list.
- **Gate it by build stage** (dev builds only). Rejected: a production owner could not opt in, and a
  build gate cannot be turned off remotely.
- **Widen the room invite's candidates with `profile.sync`**, so a place-only member who has a
  profile can be added to a room. Deferred. Measured on the dev servers it returns profile holders,
  not members — one place's rooms held six people and `profile.sync` returned two — so it is not the
  member list the room invite needs. It would also change every room invite, not only the
  experiment's. A place member listing from the backend is the fix.

## Consequences

**What it costs**

- **An owner who never opens Lab never finds the feature.** Intended while the gaps above stand.
- **The switch is per device.** It persists to local storage, so the owner's second device starts
  with it off.
- **The server kill is declared, not wired.** apps/web has no remote config adapter yet, so both
  server lanes are empty and nothing can turn the experiment off remotely today. The Lab row draws no
  "locked by the server" state for the same reason; it should once a kill can actually arrive.
- **The first `labs` key sets the pattern** the next experiment will copy: the key in its domain
  module with `surface: 'labs'`, a hand-built Lab row, and the feature's own gate taking the value as
  an input.

**What it does not change**

- The room invite, the relay 1:1 invite and the accept pipeline.
- Invites already issued stay valid, and accepting one works with the switch off — the switch gates
  issuing, not joining.
