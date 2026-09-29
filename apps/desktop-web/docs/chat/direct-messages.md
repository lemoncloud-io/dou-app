# Direct messages (cloud 1:1s)

A 1:1 opened inside a subscription cloud belongs to the **cloud**, not to a place. The server stamps
the room with whichever place its creator happened to be standing in (`sid`), but that value names
no one's home for the room and is not used to file it. The decision and its reasoning for all
clients are in ADR-0113. This document is how desktop applies it.

On the default (relay) cloud a 1:1 is reached by inviting a phone number, which is a mobile flow.
Desktop offers no way to start one there, and every entry point below hides.

## Where a 1:1 is listed

- **Every place of its cloud, exactly once.** `useChannels` reads the cloud's whole channel cache
  once (`observeList({ sid: '' })`) and keeps a row when it is in the open place's list
  (`isInPlaceList`) or is cloud-wide (`isCloudWideChannel`, from `@chatic/data`). Filtering on
  `c.sid === placeId` instead would show a 1:1 only under its creator's place.
- **A cloud with no place at all** still lists its 1:1s (`cloudWideOnly`). HomePage asks for that only
  once places have loaded, are empty and no switch is in flight. "No place selected yet" during a
  cloud switch must list nothing, or the home screen auto-selects a 1:1 in the gap.
- **The quick switcher** (`useKnownChannelsStore`) does not file cloud 1:1s under a place, so it never
  offers one as "in another place" while it already sits in the open one.

## Starting one

`useStartDm` is the one call site, behind two entry points: the "+" on the Direct messages section
(opens `NewDmDialog`) and the Message action on another person's profile card or panel. The server
(`channel.startDm({ peerId })`) resolves the pair to a single room, so asking again returns the room
that exists — there is no "already have one?" branch.

- **Single flight.** A second call while one is in flight returns `null` without reaching the server.
- **A cloud switched away from mid-call opens nothing.** The returned room belongs to the cloud that
  was left, and its id could land on another room here.
- **Failure** is logged and shown as a toast; the picker stays open for a retry.
- **The picker's pool** is everyone I share a channel with in this place plus my existing 1:1 peers,
  minus me. There is no user directory to search. 1:1 and self rooms are read from the cache only,
  not fetched per room. With no place, the "+" hides, since the pool could only be empty.

## Opening a room that is not listed yet

A room the call just created comes back **without a place** (`sid` empty). `ChannelRepository.startDm`
therefore cannot cache it (the cache files rows by place), and returns it uncached. The row arrives
with the next channel sync. So:

1. `useStartDm` requests the open through the pending-open store rather than selecting the id. An id
   the list lacks would make the home screen fall back to the remembered channel.
2. `pendingOpenRoute` answers `wait`, and HomePage holds the id in its pending landing
   (`usePendingLanding`, 30s expiry).
3. `useStartDm` pulls the channel delta at once, on the same `channel-sync:<cid>` cursor
   `useBackgroundSync` advances. Waiting for the background poll (every 60s) would outlast the expiry.
4. When the row is listed, `landingTarget` returns it and the room opens. Until then the current
   selection is kept, so the screen never jumps to another room while it waits.

The same landing serves notification clicks, saved-item jumps and newly created channels.

## Naming and picturing the other person

One rule on every surface — the sidebar row, the room's header and intro, and the New message picker:

1. **This place's profile**, where the person set one (`useSiteProfileMap`).
2. **Their cloud profile** otherwise — the user record in the active cloud's cache
   (`useCloudProfiles`).
3. The server-set room name, as a last resort.

Nick and photo are resolved **field by field**, so a place nick with no place photo keeps the cloud
photo. The same 1:1 can therefore look different from one place to another: that follows from
profiles being per place (ADR-0113 decision 4), and ADR-0127 records why the cloud profile is the
fallback.

**Filling the cache.** Only an opened room loads its members, so a peer nobody has opened a room with
has no cached name. The sidebar loads the members of each listed 1:1 whose peer has neither a place
nick nor a cached name (`useHydrateDmPeers`): once per room per mount, after the socket is verified,
and only after a cache read finds nothing, so a warm cache costs no request. A failed load is logged
and retried on the next list change.
