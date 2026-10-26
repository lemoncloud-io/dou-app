# ADR-0230: A relay 1:1 is listed in the relay's place whatever its `sid` says

> Status: Accepted · Decided: 2026-10-26
> · Scope: `libs/data/src/domain/channelScope.ts` · `libs/data/src/repositories/ChannelRepository.ts`
> (`syncChannels`) · `libs/data/src/local/data-sources/ChannelLocalDataSource.ts` (cache write) ·
> `apps/web/src/app/hooks/**` · `apps/web/src/app/features/channels/lib/channelStereoPolicy.ts`
> · Supersedes [ADR-0035](./0035-relay-invite-accepted-channel-resolution.md) decision 4 and its first
> rejected hypothesis · Narrows [ADR-0210](./0210-a-cloud-1-1-belongs-to-the-place-it-was-opened-in.md)
> decision 1
> · The module docs are [dm-and-self-chat.md](../../apps/web/docs/feature/channels/dm-and-self-chat.md),
> [relay-invite-accept.md](../../apps/web/docs/feature/invite/relay-invite-accept.md) and
> [domains.md](../../libs/data/docs/repositories/domains.md)

## Context

A user accepted a relay 1:1 invite twice on production, and both times the room never appeared on
Home. The logs showed the accept succeeding and the room hunt ending unresolved, with no sign of the
room afterwards.

The relay and a subscription cloud key a 1:1 differently. A subscription cloud opens one 1:1 per place,
`<sid>@<uidA>@<uidB>`, and that place is where it lives (ADR-0210). The relay keys a 1:1 by its two
members alone, `<uidA>@<uidB>`, and an accepted invite gets that pair's room or creates it. So the same
two people get **the same room back every time** they meet again through an invite, and the room keeps
the `sid` it was stamped with when first created: the place of the session that opened it, never
updated. That can be the relay's one place (`0000`), a place from an earlier session, or nothing.

The app treated a relay 1:1's `sid` as where it lives:

- Home sliced the relay's rooms with `isInPlaceList`, `channel.sid === selectedPlace`.
- The reachable-place filter dropped a row whose `sid` is not one of the user's places.
- The channel sync dropped a changed row with no `$.sid`, and the cache write threw for a row whose
  place could not be resolved.

A pair room stamped with another place, or with none, was therefore cached but hidden, or never
cached. ADR-0035 had checked this filter and kept it. Its evidence was that relay rooms showed up
correctly, so they must carry the default place's `sid`. That held for rooms the relay had just
created. It does not hold for a room the relay hands back.

## Decision

1. **A relay 1:1 (`isRelayDm`: `stereo === 'dm'` on the relay cloud) is listed in the relay's one place
   whatever its `sid` says.** `isInPlaceList` passes it, and so does the reachable-place filter. Group
   rooms on the relay keep the plain `sid` rule.
2. **The channel sync keeps a relay 1:1 with no place,** and the cache stores it with an empty `sid`
   rather than refusing it. It still takes the ordinary place chain first. An empty `sid` is only what
   is left when nothing names a place.
3. **A relay 1:1 is named by the reader's place** (`profilePlaceOf`), not by the stamped one. That is
   the place Home names the peer by, so the room and its Home row agree.
4. **The invite accept's list fallback (tier 3) observes the cloud-wide list** and applies the place
   rule in JS. The cache wakes only the observers of the place a write files a row under, so an
   observer keyed by the active place never saw a row filed under another place or none.

## Alternatives

- **Rewrite a relay 1:1's `sid` to `0000` in the mapper or cache.** One place to change, and every
  consumer would read a consistent field. Rejected: it overwrites a server field with a client guess,
  and a later write from the server would put the stamp back, which is the drift ADR-0210 decision 2
  exists to avoid for cloud 1:1s.
- **Ask the server to stamp relay 1:1s with the relay's place.** The right long-term fix for the
  field, but it does nothing for rooms already stamped, and the client cannot wait for it.
- **Fix only the Home filter.** Rejected because the other three gates would still hide or drop the
  same rooms (reachable places, sync drop, cache throw).

## Consequences

- A relay 1:1 the user belongs to is on Home whatever place it carries.
- A device that dropped such a room before this change gets it back on its next full channel sync. A
  sync cursor that has gone unused past its TTL is retired and the next sync is full, so backgrounding
  or relaunching the app is enough. A user active on the relay without a break waits until then.
- Tier 3 still cannot name a room this device had already cached, because that room is not new. When
  the accept response, the probes and the push also miss it, the flow ends on "the room is on its way",
  and the room is in the list.
- Not changed here:
    - desktop-web still lists a relay 1:1 by `channel.sid` (`roomPlaces`), so it can hide the same rooms;
    - search passes a relay 1:1's stamped `sid` when it navigates and when it names people;
    - unread counts per place bucket a relay 1:1 under its stamped `sid`, which no relay screen reads.
