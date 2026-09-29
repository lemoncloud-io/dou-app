# ADR-0127: Desktop names a 1:1 peer by their place profile, else their cloud profile

> Status: Accepted · Decided: 2026-09-29 · Implemented: PR #499 (`feat/desktop-cloud-dm`)
> · Scope: `apps/desktop-web/src/app/features/chat/**` · `apps/desktop-web/src/app/features/channels/components/NewDmDialog.tsx`
> · `apps/desktop-web/src/app/shared/hooks/useAuthorNames.ts`
> · Builds on [ADR-0113](./0113-a-cloud-1-1-has-no-invite-and-no-place.md) (a cloud 1:1 is cloud-scoped;
> the profile naming its peer is place-scoped)
> · The module doc is [direct-messages.md](../../apps/desktop-web/docs/chat/direct-messages.md)

## Context

ADR-0113 lists a cloud 1:1 in every place of its cloud and names the peer from the reader's current
place, because profiles are per place. Web's chain for that is: my own name for the room, then the
peer's place-profile nick, then the server-set room name (`resolveDmTitle`). It leaves the peer's user
record out on purpose — on web the record only fills through a per-room member sync the lists cannot
afford, and it can hold a phone placeholder.

Desktop, once 1:1s were listed in every place, showed where that leaves a gap. A peer who set no
profile in the open place was named from the user cache if some opened room had loaded them, and
otherwise by the server-set room name — for a new room, a raw id. And three surfaces resolved the same person three ways: the sidebar read the place photo only,
the room's intro passed no photo at all, and the New message picker read only the user record. One
person showed a photo in the sidebar and an initial in the room, in the same place.

The owner's call on what the rule should be: show the cloud profile by default, and the place profile
wherever the peer has set one.

## Decision

1. **One chain on every desktop surface that shows a 1:1 peer** — the sidebar row, the room's header
   and intro, and the New message picker:
    1. this place's profile, where the peer set one;
    2. their **cloud profile** — the user record held in the active cloud's user cache;
    3. the server-set room name.
2. **Field by field.** Nick and photo fall back independently, so a place nick with no place photo
   keeps the cloud photo (`resolveDisplay`).
3. **The list pays for the cloud profile once, not per render.** The sidebar loads the members of a
   listed 1:1 only when its peer has neither a place nick nor a cached name, once per room per mount
   (`useHydrateDmPeers`). A warm cache costs no request.

The cloud profile is not a new stored thing. It is the user record the cache already keeps per cloud,
so ADR-0113's decision 5 — no cloud-level profile is introduced — still holds.

## Alternatives

**Keep web's chain on desktop (place nick, then room name).** Desktop and web would agree. Rejected:
it leaves every peer without a place profile in the open place named by a raw room id, which listing
1:1s in every place makes the common case rather than the edge.

**Name the peer from the place the room was created in (`channel.sid`).** One name everywhere.
Rejected for ADR-0113's reason: that place is only where the creator happened to be, and the other
participant may not be in it.

**Fetch every 1:1's roster on the list.** Simplest to write. Rejected: one request per row on every
mount, for rows the cache can usually already name.

## Consequences

- The same 1:1 can look different from one place to another, whenever the peer set a profile in some
  places and not others. That is intended — it follows from profiles being per place.
- **Desktop and web now differ.** Web's name chain stops at the place nick and never shows the cloud
  profile's name. For the photo, web's list reads the place photo only, while web's room falls back to
  the member's photo (`useDmPeer`). Bringing web onto this chain is a separate
  change to `resolveDmTitle` and `useDmPeers`, and has to weigh the phone-placeholder concern web
  recorded. Whether that placeholder can appear in a cloud user record is not verified.
- A new 1:1 shows its raw room id in the header for a fraction of a second, until its members load.
