# Direct messages (cloud 1:1s)

A 1:1 opened inside a subscription cloud belongs to the **place it was opened in**. The server opens
a separate room per place — a new room's id is `<sid>@<uidA>@<uidB>` — and files it under the place
the session was on when it asked; it never moves. Two people who share several places therefore have
one 1:1 in each. A room opened before the server worked that way keeps its pair-key id
(`<uidA>@<uidB>`) and the place it was stamped with. The decision is ADR-0210 (which replaced the
cloud-wide reading of ADR-0113 and the peer-shared-places filing of ADR-0141); this document is how
desktop applies it.

On the default (relay) cloud a 1:1 is reached by inviting a phone number, which is a mobile flow.
Desktop offers no way to start one there, and every entry point below hides. The sidebar's 1:1
section stays, though: while it has no 1:1 in it, it says that a 1:1 on Home starts from a phone
number in the DoU mobile app, with the App Store and Google Play links (`MobileAppPointer`). It
used to vanish without a word, which read as a missing feature rather than one that lives
elsewhere.

## Where a 1:1 is listed

- **In its own place, exactly once.** `useChannels` reads the cloud's whole channel cache once
  (`observeList({ sid: '' })`) and keeps a row when `listingPlaces` names the open place — a group
  channel's and a cloud 1:1's own `sid` alike. The unread counts and the quick switcher's index read
  the same helper. The whole-cloud read is still needed for the two rooms below that are not simply
  their own `sid`.
- **The room's `sid` is the server's, never the reader's.** `libs/data` fills a cloud 1:1's place
  from the place a place-keyed id names, then from the server's field (`dmPlaceOf`; `#` reads as no
  place), and otherwise leaves it empty; it never takes the session's current place. During a place
  switch that place already names the next one while the server files the room under the one being
  left, and with a 1:1 listed in one place only the mismatch would put it in the wrong list.
- **Everyone else in the place is listed too.** After the 1:1s, the section lists the place's
  members I have no 1:1 with **in this place** (`placeMemberPeers`: the union of `memberIds` over the
  place's group channels), by name. Someone whose only 1:1 with me is in another place is offered
  here too — opening it makes this place's room. Clicking one starts the 1:1 through `useStartDm`, and
  the new room then takes the person's place among the 1:1s. Until the server answers, the clicked
  row shows a spinner and reads as busy, and every person row ignores clicks (`aria-disabled`, not
  `disabled`, so the pressed row keeps its focus for the arrow-key walk). `HomePage` keeps which row
  asked and passes it down with the hook's `isStarting`; a failure is the hook's usual toast. Each
  row's accessible name says what pressing it does — "Start a direct message with {name}" — since the
  visible text is only the name. These rows have no room, so they cannot be dragged or starred, and a
  person whose name has not loaded is not drawn — never a raw id — while `useHydrateDmPeers` loads the
  members of a group channel they are in. The place profile cache is no substitute for that
  membership: members who never set a profile have no row there.
- **My notes-to-self room is listed in every place,** relay included. It belongs to the account and
  the server returns it whichever place is asked about. Two rules carry that: the sidebar lists a
  row stored under the account (`ACCOUNT_CHANNEL_SID`, a room that arrived with no place), and
  `roomPlaces` files a room that does name a place — as one opened by `channel.get-self` does —
  under all of mine rather than that one. The second is what the unread counts and the quick
  switcher read, so they agree with the sidebar. Its unread count therefore shows in every place, and
  the quick switcher offers it once (`self` on its index entry): never "in another place", since the
  open place lists it.
- **Not before my places load.** The notes-to-self room cannot be filed until my place list is known,
  so `useChannels` reports loading until it is.
- **A cloud with no place at all** lists the cloud 1:1s that no place of it holds
  (`whenNoPlace: 'cloudDms'`): one opened while the cloud had no place (the server keys it by the
  pair and files it under none), and one whose place is gone. HomePage asks for that only once places
  have loaded, are empty and no switch is in flight. "No place selected yet" during a cloud switch must
  list nothing, or the home screen auto-selects a 1:1 in the gap.
- **A 1:1 that names no place** — a room from before places keyed 1:1s may carry none — is stored with
  an empty `sid` and listed only by a cloud with no place; search and a notification still reach it.
  One stamped with a place I am not in is listed nowhere either, for the same reason.
- **The Default Cloud (Home)** is not that case. Nothing but an invite join selects a site on it, so
  it usually has no place, and its 1:1s are relay 1:1s that live in the relay's one place: the
  cloud-1:1 rule would list nothing, the Self Channel included, and onboarding would wait on it
  forever. With no site, Home lists every relay row (`whenNoPlace: 'relay'`).
- **The quick switcher** (`useKnownChannelsStore`) files a 1:1 under its own place, with its person
  (`peerId`), so ⌘K offers a 1:1 of another place as "in another place", named after the person rather
  than the server-set room name (`elsewhereChannels`) — the room name stands in until HomePage loads
  the person, and a 1:1 whose members have not arrived is not filed. The 1:1s with one person in two
  other places are two rows. An index persisted before 1:1s were keyed by place can still hold one
  room filed under several places until those filings age out; it is offered once, and not at all
  when the open place lists it. Picking a row goes through the same open as a saved item, so it lands
  in the room's own place. The "in another place" row is named by the cloud profile, not that place's:
  reading another place's profiles would need a subscription to them.

## Starting one

`useStartDm` is the one call site, behind two entry points: the "+" on the Direct messages section
(opens `NewDmDialog`) and the Message action on another person's profile card or panel. The server
(`channel.startDm({ peerId })`) resolves the pair to a single room per place, so asking again in the
same place returns the room that exists — there is no "already have one?" branch. Mobile makes no
cloud 1:1; starting one is a desktop feature.

- **It waits for a place switch.** The server files the room under the place the session is on when
  it answers, for good, so a call made while a place switch runs is held until the switch settles
  (the `SWITCH_SITE` mutation count, read from the mutation cache so a caller that unmounts still
  sends). If the cloud or the place moved in the meantime — a failed switch rolls back, a second one
  may follow — nothing is sent. The callers do not lock their buttons; the wait is in the hook.
- **It lands on the room's place.** The pending open names the room's `sid`. When that is not the
  place the call started from, the hook logs a warning and the open still goes to the room's place,
  rather than leaving it unlisted in this one.
- **Single flight.** A second call while one is in flight — waiting included — returns `null` without
  reaching the server.
- **A cloud switched away from mid-call opens nothing.** The returned room belongs to the cloud that
  was left, and its id could land on another room here.
- **Failure** is logged and shown as a toast; the picker stays open for a retry.
- **The picker's pool** is the place's member list (`place.list-user`), minus me — the same pool as
  "Add members", described in [channel-settings.md § Add members](./channel-settings.md#add-members).
  It includes people I share no channel with, and people with no channel at all. A 1:1 started with one of them is listed here, because it is opened
  in this place. When the list cannot be had, the pool falls back to everyone I share a channel with
  in this place plus the peers of the 1:1s this place lists — 1:1 and self rooms read from the cache
  only. With no place, the "+" hides, since the pool could only be empty.

### Notes to self

The same hook opens my own notes-to-self room (`openSelf`), from a row pinned above the picker's
people and from the action my own profile card or panel shows in place of "Message". It cannot go
through `channel.start-dm`: the server answers 400 when the peer is me. The room comes from
`channel.get-self` instead, which gets or creates it — one per person per cloud, so asking again
returns the same room, like a 1:1.

- **It shares the one flight** with `startDm`, and the same cloud-switch guard and failure toast.
- **It needs an open place.** The answer carries no place of its own, so the repository tags the row
  with the one it is handed (`getSelfChannel(payload, siteId)`), and with no place there is nothing
  to hand it. The row hides there (`canOpenSelf`).
- **The row does not wait for the pool.** It is drawn apart from the people list, so it shows while
  that list loads, fails or is empty. A search filters it like any row — by my place nick, my account
  name, my id, its "You" tag or its "Notes to self" line.
- **The room exists before anyone asks for it.** A subscription cloud does not create it on its own,
  so a new member had no notes-to-self row until they picked themselves. `useEnsureSelfChannel`
  (mounted with the background sync) asks `channel.get-self` once per cloud per app session, when the
  socket is verified, a place is open and no switch is in flight; a failure is logged and asked again
  the next time those hold (a reconnect, a place change, a switch ending). The relay needs none of this — its sync brings the room.
- **Its sidebar row wears my photo**, as the picker's "me" row does: my place profile's, else my
  cloud profile's, looked up by my id in the cloud (the room's own join row), not the session id.
  The label stays "You".
- **It holds the top of Direct messages.** It is drawn above every 1:1 whatever the stored order or
  the names say, cannot be dragged or moved with Alt+Shift+↑/↓, and a 1:1 cannot be moved above it.
  It is left out of the order a move writes.

## Opening a room that is not listed yet

A new room's answer carries no place field, but its place-keyed id names the place, so
`ChannelRepository.startDm` caches it under that place and the sidebar lists it at once. A pair-key
room whose answer names no place cannot be cached (the cache files rows by place) and is returned
uncached; its row arrives with the next channel sync. Either way:

1. `useStartDm` requests the open through the pending-open store rather than selecting the id. An id
   the list lacks would make the home screen fall back to the remembered channel.
2. `pendingOpenRoute` answers `wait` until the room is listed, and HomePage holds the id in its
   pending landing (`usePendingLanding`, 30s expiry).
3. For a room that came back with no place, `useStartDm` pulls the channel delta at once, on the same
   `channel-sync:<cid>` cursor `useBackgroundSync` advances. Waiting for the background poll (every
   60s) would outlast the expiry.
4. When the row is listed, `landingTarget` returns it and the room opens. Until then the current
   selection is kept, so the screen never jumps to another room while it waits.

The same landing serves notification clicks, saved-item jumps and newly created channels.

## Opening a 1:1 from elsewhere

A notification, a toast, a saved item or a mention names a place for the room it opens. For a 1:1 the
place that counts is the room's own, which the request need not name — a notification names the place
its sender wrote from. So `openPlaceFor` opens a 1:1 in its own place: the cached row's
(`roomPlaces`), else the place a place-keyed id names (a room not cached yet), and only for a room
that names neither, the place the request named. Desktop's cross-cloud notification and its toast
work out the room's place the same way before they build the open (`pushLandingPlace`), reading the
row from the source cloud's cache.

**An open that cannot be placed yet** is held instead of switched: another cloud's 1:1, whose rooms
are read only after the cloud switch, and any open that arrives while HomePage is still loading (a
notification clicked from settings remounts it with an empty list). The first lands in the named
place, the second stays put, and once the list loads without the room HomePage moves to the place
`openPlaceFor` picks (`pendingRedirectPlace`) — once per room, and never while a switch is in
flight, so a list that never gains the room cannot bounce between places.

## Opening the Self Channel from another place

The Self Channel is in every place's list, but each place holds its own messages in it: the server
answers a read from the place the session is in. An item saved, mentioned or notified in place B
therefore has to be opened from place B, and the listing alone — every place — cannot say which.
`openPlaceFor` takes `placeBound` for this room: the named place wins when it lists the room, and
this place is kept only when none was named. `pendingRedirectPlace` does the same for a held open,
whose room is already listed here.

Because the room is listed in the place being left too, the pending landing cannot use "the list
carries it" as its signal. HomePage remembers the place a same-cloud open switched to
(`awaitedPlaceRef`) and `landingTarget` holds the pending landing until the session is in that place
and the `SWITCH_SITE` mutation has finished; the fallback landing waits with it, so a channel nobody
picked is not opened from the target place's cached list in the meantime.

Three rules keep that wait from pointing at a place that never comes:

- A switch that fails (the engine has rolled the place back) gives the open up: `switchPlace` takes an
  `onFailed` callback, and HomePage uses it to drop every pending landing. The reader keeps the place
  they were in, and picking another place lands normally.
- A second open while a switch runs does nothing (`jumpToSaved`, `returnToOrigin`), the way the place
  rail is locked. Letting it through would re-arm the landing and drop the place the first open waits
  for, and its channel would then land in the list of whichever place the pre-applied selection shows.
- A notification open that reaches the switch step while another switch runs (`switchPlace` refuses it)
  is given up for the same reason: the running switch heads somewhere the open did not choose. An open
  whose place is already the session's has nothing to wait for and lands at once. A notification held
  because the list is still loading takes no such lock; it is re-armed like any new open.

The five ways in — saved items, mentions, a notification, the return bar after a jump, and message
search — differ in what they know. The first four name a place (a return point records the place the
reader stood in). Search names none: its rows come from the local cache by channel id and carry no
place, so a Self Channel hit opens in the place the reader is in.

## Unread

The place rail puts a dot on the place an unread 1:1 lives in, when it is not muted, so a dot always
leads to a Direct messages row (a muted one counts nowhere above its own row — see
[the cloud rail's Unread section](../shell/cloud-rail.md#unread)). My notes-to-self room dots every
place it is listed in, so the window title and the OS badge count each room once (`placeUnreadCounts`
keeps a per-channel total beside the per-place map); summing the places would count one conversation
as many. A cloud 1:1 that names no place counts in that total only, as a cloud with no place lists
it. The counts come from a separate whole-cloud listing (`usePlaceUnreadCounts`), not the sidebar's
cache, so for a moment after a change a dot can sit on a place whose list has not caught up.

## Naming and picturing the other person

One rule on every surface — the sidebar row, the room's header and intro, and the New message picker:

1. **This place's profile**, where the person set one (`useSiteProfileMap`).
2. **Their cloud profile** otherwise — the user record in the active cloud's cache
   (`useCloudProfiles`).
3. The server-set room name, as a last resort.

Nick and photo are resolved **field by field**, so a place nick with no place photo keeps the cloud
photo. "This place" is the room's own: a 1:1 opens only in the place it lives in. The 1:1s with one
person in two places can therefore name them differently, each by that place's profile, which
follows from profiles being per place; ADR-0127 records why the cloud profile is the fallback.

**Staying current.** A peer's place nick or photo edit reaches this window without waiting for the
60s background poll: the server pushes a `profile.sync` frame to everyone who shares a room with the
editor, and `useRealtimeProfileSync` answers it with the same profile delta pull the poll makes, on
the same `profile-sync:<cid>:<sid>` cursor. The frame is only a nudge — its payload is not read, and
an edit made in another place just costs one idempotent pull. Focusing the window pulls too, to catch
what was missed while it was in the background. The older `channel.sync-site-profile` name is a deprecated
request alias of the pull; the server never pushes it.

**Filling the cache.** Only an opened room loads its members, so a peer nobody has opened a room with
has no cached name. The sidebar loads the members of each listed 1:1 whose peer has neither a place
nick nor a cached name (`useHydrateDmPeers`): once per room per mount, after the socket is verified,
and only after a cache read finds nothing, so a warm cache costs no request. A failed load is logged
and retried on the next list change.

**Waiting for names.** On a cloud with nothing cached those loads took 5-10s, and the rows used to
show each peer's raw id (with its first digit as the avatar) until they landed. A 1:1 row is never
drawn under an id now:

- Until every 1:1 in the place has a name, the whole Direct messages section is placeholder rows.
  The 1:1s are ordered by the names they show, so drawing them one by one would re-sort the list
  under the pointer as each name arrived; holding the section sorts it once.
- After that first settle, a 1:1 that appears later (a new room) holds only its own row.
- The wait gives up after `DM_NAME_WAIT_MS` (10s) and the row falls back to the room name, so a
  person whose record never arrives cannot hold the section for good.

People with no 1:1 yet do not hold the section: they are left out until named anyway.
