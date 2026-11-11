# ADR-0259: Web names a cloud 1:1 peer by their cloud profile when they have no place profile

> Status: Accepted · Decided: 2026-10-22 · Implemented: `fix/cloud-dm-peer-name`
> · Scope: `apps/web/src/app/features/channels/lib/resolveChannelTitle.ts` · `utils/dmTitle.ts` ·
> `lib/channelStereoPolicy.ts` · `utils/dmPeer.ts` · `hooks/useDmPeer.ts` · `hooks/useDmPeers.ts` ·
> `hooks/usePeerCloudNames.ts` · `apps/web/src/app/features/search/hooks/useSearchContext.ts`
> · Supersedes in part: [ADR-0039](./0039-dm-display-name-chain-and-invite-profile-release.md) — decision
> 1's revision that kept the peer's user record out of the chain, and decision 3's place-profile-only
> intro name, both for a cloud 1:1 only
> · Follows: [ADR-0127](./0127-desktop-names-a-1-1-peer-by-place-profile-else-cloud-profile.md) — the
> chain desktop already uses
> · The module doc is [apps/web channels](../../apps/web/docs/feature/channels/dm-and-self-chat.md#naming)

## Context

Web titles a 1:1 with one chain on every surface: my `join.nick` for the room, then the peer's
place-profile nick, then `channel.name`, then the "대화 상대" label. ADR-0039 first had the peer's user
record as a step and removed it while implementing: only a per-room `syncChannelUsers` call fills it,
which a list could not afford, so the room would have named the peer and the list would not. The
record also often holds a masked phone number (`***1234`).

A cloud 1:1 has since dropped the first step. The server writes values into `join.nick` that the client
cannot tell apart from a name somebody chose, so the chain skips it for the cloud lineage. And the
server no longer writes an alias there for a 1:1 the app opens, so a new cloud 1:1 carries none.

That leaves the place profile as the only person-naming step, and a cloud member need not set one up
in every place. Measured on dev: in one place, four 1:1 peers answered `404` to `profile.get` for that
place and a fifth had a profile row with no nick. The 1:1 picker listed them by name (one as `임마`);
inside the room the join message read `임마 entered the chat room`; the room header and the home row
read "대화 상대". The picker, the message rows and the member list all read
the user record. The title was the one surface that did not, so a person someone had just picked by
name opened as an unnamed partner.

Desktop met the same gap when it listed 1:1s and settled it in ADR-0127: the place profile where the
peer set one, else their cloud profile — the user record in the cloud's user cache — then the room name,
with the list loading a room's members only when nothing names the peer. ADR-0127 left bringing web onto
that chain as a separate change, one that had to weigh the phone-placeholder concern.

## Decision

1. **A cloud 1:1's chain gains the peer's cloud profile, after the place-profile nick and before
   `channel.name`.** The cloud profile is the user record, read `nick` then `name` — the order web's
   message rows name a member in. Above it the place profile still wins, so a peer who set one keeps
   being named by it.
2. **Generated account names fall through.** The record's own id, `User_0101` and a masked `***0101`
   are not names; they are screened by the guard `join.nick` already passes. A plain phone number stored
   as the name by a batch invite is shown, as the picker shows it.
3. **A relay 1:1 is unchanged.** Its records are mostly the masked placeholder, and its room is named at
   the invite form through `join.nick`.
4. **Every surface fills it, at a bounded cost.** The room and settings take it from the members they
   already load. A list — home, place channel management and search, all of which read the selected
   cloud — reads the user cache per peer and loads a room's members only for a cloud 1:1 whose peer has
   neither a place nick nor a cached record, once per room per mount, and not if a place nick arrived
   during the cache read. The cache keeps the record across launches, so the cost is paid once per
   person, not per visit. The reading is scoped to the selected cloud and my uid in it, so nothing from
   a previous cloud or account is shown or sent after a switch.
5. **The cloud 1:1 intro block names the peer the same way**, through the same function as the title,
   so the header and the first line of the body agree. A relay 1:1's intro still names the peer by
   place profile only, else says no name.

## Alternatives

**Leave web as it is and let the label stand.** The chain stays simple and identical across lineages.
Rejected: it names nobody for exactly the people a cloud member is most likely to message — someone who
joined the cloud but never opened this place — while every other surface in the same room names them.

**Fill the gap from `join.nick` again for a cloud 1:1.** The old rooms carry the peer's name there.
Rejected: new rooms carry nothing, and trusting the field is what the cloud lineage stopped doing for a
measured reason.

**Read the record in the room only.** No new requests. Rejected: it reopens the split ADR-0039 was written
to close — the header names the person and the home row calls them "대화 상대" until the room is opened.

**Load every 1:1's members on the list.** Simplest to write. Rejected, as on desktop: a request per row
on every mount, for rows the place profile or the cache can usually already name.

**Take the names from `place.list-user`.** One request names every member of the place. Rejected: it is
paged, it names only current members of the place, and it would add a second source for the same record
the user cache already holds.

## Consequences

- A cloud 1:1 with a peer who has no place profile is named on the home list, place channel management,
  the room header, settings and the intro, the same as in the picker and the message rows.
- The same person can be named differently in two places' 1:1s: by the place profile where they set one,
  by the cloud profile where they did not. That follows from profiles being per place, as on desktop.
- A list can make one `syncChannelUsers` call per unnamed cloud 1:1 on its first visit. Every mount
  also reads the cache once per cloud 1:1 row whose place nick has not arrived yet, which is most of
  them on the first render; a row named by the time its read returns is not loaded.
- Until that load answers, a never-opened row still shows "대화 상대" for a moment.
- The message rows screen a record's name less strictly — they drop only a raw id — so a peer whose
  record is a masked `***0101` reads that in a message and "대화 상대" in the title.
- Web and desktop now agree on the cloud 1:1 name chain. They still differ on the photo: web's list
  shows only the place photo, where desktop falls back to the cloud photo. That stays out of scope here.
