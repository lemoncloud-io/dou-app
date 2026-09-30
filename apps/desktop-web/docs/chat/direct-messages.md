# Direct messages (cloud 1:1s)

A 1:1 opened inside a subscription cloud belongs to the **cloud**, not to a place. The server stamps
the room with whichever place its creator happened to be standing in (`sid`), but that value names
no one's home for the room and is not used to file it. The decision and its reasoning for all
clients are in ADR-0113. Desktop then files each 1:1 under the places its peer shares with me
(ADR-0141). This document is how desktop applies both.

On the default (relay) cloud a 1:1 is reached by inviting a phone number, which is a mobile flow.
Desktop offers no way to start one there, and every entry point below hides.

## Where a 1:1 is listed

- **In the places where its peer shares a group channel with me, exactly once each.** People are
  invited per place, so a 1:1 belongs where the other person is. `useChannels` reads the cloud's
  whole channel cache once (`observeList({ sid: '' })`) and keeps a row when `listingPlaces` names
  the open place: a group channel's own place, or, for a cloud 1:1 (`isCloudWideChannel`, from
  `@chatic/data`), the places `cloudDmPlaces` files it under. The unread counts and the quick
  switcher's index read the same helper. Filtering on `c.sid === placeId` instead would show a 1:1
  only under its creator's place.
- **Membership is read from the group channels I am in.** A place's members are taken to be the
  union of `memberIds` over its group channels. The server has no place member list to ask, and the
  place profile cache is no substitute: members who never set a profile have no row there (a test
  cloud measured zero rows across six places). The cost is that a place member who shares none of
  my channels is not seen, and a 1:1 with them is not listed in that place.
- **A peer found in no place** is still reachable. The 1:1 is listed in its stamped place (`sid`)
  when that place is mine, and in every place otherwise. The same applies while a room's members are
  not known yet.
- **Everyone else in the place is listed too.** After the 1:1s, the section lists the place's
  members I have no 1:1 with there yet (`placeMemberPeers`, the same group-channel membership), by
  name. Clicking one starts the 1:1 through `useStartDm`, and the new room then takes the person's
  place among the 1:1s. These rows have no room, so they cannot be dragged or starred, and a person
  whose name has not loaded is not drawn — never a raw id — while `useHydrateDmPeers` loads the
  members of a group channel they are in. Without them, a place where no one has a 1:1 with me
  showed an empty section.
- **Not before my places load.** A 1:1 cannot be placed until my place list is known, so
  `useChannels` reports loading until it is; listing 1:1s earlier would show each one everywhere for
  a moment through the fallback.
- **A cloud with no place at all** still lists its 1:1s (`whenNoPlace: 'cloudDms'`). HomePage asks for
  that only once places have loaded, are empty and no switch is in flight. "No place selected yet"
  during a cloud switch must list nothing, or the home screen auto-selects a 1:1 in the gap.
- **The Default Cloud (Home)** is not that case. Nothing but an invite join selects a site on it, so
  it usually has no place, and its 1:1s are not cloud-wide (they live in the relay's one place):
  the cloud-1:1 rule would list nothing, the Self Channel included, and onboarding would wait on it
  forever. With no site, Home lists every relay row (`whenNoPlace: 'relay'`).
- **The quick switcher** (`useKnownChannelsStore`) files a 1:1 under each place that lists it, with
  its person (`peerId`), so ⌘K offers a 1:1 listed only in other places as "in another place",
  named after the person rather than the server-set room name (`elsewhereChannels`) — the room name
  stands in until HomePage loads the person, and a 1:1 whose members have not arrived is not filed. It is offered
  once however many places list it, and not at all when the open place lists it already. Picking it
  goes through the same open as a saved item, so it lands in a place that lists it.

## Starting one

`useStartDm` is the one call site, behind two entry points: the "+" on the Direct messages section
(opens `NewDmDialog`) and the Message action on another person's profile card or panel. The server
(`channel.startDm({ peerId })`) resolves the pair to a single room, so asking again returns the room
that exists — there is no "already have one?" branch.

- **Single flight.** A second call while one is in flight returns `null` without reaching the server.
- **A cloud switched away from mid-call opens nothing.** The returned room belongs to the cloud that
  was left, and its id could land on another room here.
- **Failure** is logged and shown as a toast; the picker stays open for a retry.
- **The picker's pool** is everyone I share a channel with in this place, plus the peers of the 1:1s
  this place lists, minus me, so a 1:1 started from it is always listed in this place. There is no
  user directory to search. 1:1 and self rooms are read from the cache only, not fetched per room.
  With no place, the "+" hides, since the pool could only be empty.

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

## Opening a 1:1 from elsewhere

A notification, a toast, a saved item or a mention names a place for the room it opens. For a 1:1
that place is only its stamp (`sid`), which need not list it, so `openPlaceFor` picks the place
instead: this place when it lists the room, else the named place when it does, else the first place
that does. Switching to a place that does not list the room would wait on it until the pending
landing expires. A room no place is known to list yet keeps the named place and waits as above.

**An open that cannot be placed yet** is held instead of switched: another cloud's 1:1, whose rooms
are read only after the cloud switch, and any open that arrives while HomePage is still loading (a
notification clicked from settings remounts it with an empty list). The first lands in the named
place, the second stays put, and once the list loads without the room HomePage moves to the place
`openPlaceFor` picks (`pendingRedirectPlace`) — once per room, and never while a switch is in
flight, so a list that never gains the room cannot bounce between places.

## Unread

The place rail puts a dot on every place that lists an unread 1:1, so a dot always leads to a
Direct messages row. The window title and the OS badge count that 1:1 once (`placeUnreadCounts`
keeps a per-channel total beside the per-place map); summing the places would count one conversation
as many. The counts come from a separate whole-cloud listing (`usePlaceUnreadCounts`), not the
sidebar's cache, and both place a 1:1 with `cloudDmPlaces`, so for a moment after a change a dot can
sit on a place whose list has not caught up.

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
