# Where lists and feeds get their data

The channel list, the message feed and the background features (OS banners, the inbox, my threads)
read the engine's caches; fetching is owned by the runtime's sync layer. The hooks are in
`src/app/shared/hooks/`.

## Observing a cache

- **A subscription is keyed by cloud, user and place.** Channel and chat caches are partitioned by
  `{cid, sid, uid}`, and `uid` flips only when a cloud switch commits, after the optimistic `cid`. Place
  ids and channel ids are per cloud, so a cross-cloud switch can land on an equal one (a cloud's place
  `10001` and the relay's); keyed on place alone, the observer stayed bound to the cloud just left and
  streamed its rows forever. `useChannels`, `usePlaces` and `useChats` re-key on uid, and `useChats` on
  the cloud as well, since one account can hold the same uid, and so the same Self Channel id, in two
  clouds.
- **A read already in flight still delivers after its unsubscribe.** The engine's unsubscribe only
  deregisters the observer. On a switch the old cloud's read resolved after the new subscription had
  painted and overwrote it, and nothing re-emitted until the next cache write, so sending a message
  seemed to fix it. Every observing hook ignores an answer that arrives after its own teardown
  (`useChannels`, `usePlaces`, `usePlaceProfiles`, `useChats`). `usePlaces` also filters at render to
  the current cloud's rows, since the reset runs in an effect and one render would still hold the old
  places.
- **Module state is session-only memo, not a store.** The author-name memo (`useAuthorNames`) and a
  room's paging depth (`useChats`) only record what the cache already resolved or how far the person
  paged, so a revisit paints on the first frame. They are never persisted; the cache stays the source.

## The channel list

`useChannels` reads the whole cloud (`observeList({ sid: '' })`) and filters in JS, because a place's
list is not simply the rows whose `sid` names it (see [direct-messages.md](./direct-messages.md) and
`roomPlaces`). A per-place observe could not serve a cloud with no place, nor my notes-to-self room
filed under every place.

- **Order is alphabetical, fixed.** The list does not jump on every new message; unread shows as the
  row's badge.
- **No place means nothing, unless the caller says what it means** (`whenNoPlace`). A place not
  selected yet (loading, or the site cleared mid-switch) lists nothing: a 1:1 listed then would be
  auto-selected by the home screen before the place lands. `cloudDms` is for a subscription cloud
  known to have no place, which lists the 1:1s no place holds. `relay` is Home: it has no place
  switcher, and nothing selects a site on it except an invite join, yet it owns rows, the Self Channel
  first, which onboarding waits on, so every relay row is listed. A row with no `cid` came from the
  relay; the `cid` check keeps a late row of the cloud just left out of Home.
- **An empty list is not trusted at once.** The cache emits empty on a cold boot or after a switch
  reset, before list discovery (a sync that runs on a verified socket) writes it, which flashed "No
  channels yet". There is no per-place "list fetched" signal, so an empty result holds the skeleton for
  `EMPTY_SETTLE_MS` (600 ms) on a verified socket, or up to `EMPTY_WEDGE_CEILING_MS` (4 s) on an
  unverified one, so a socket wedged after a sleep ends in the empty state instead of spinning. A
  populated list is never masked. The list is also not final until my places are known, because my
  notes-to-self room cannot be placed before.
- **Unread comes from the join row**, with the local cursor layered on; see
  [unread-badges.md](./unread-badges.md).

## The message feed

`useChats` observes a channel's newest `limit` rows, descending by `chat_no`, and widens the window by
`LOAD_MORE_SIZE` for each older page, so the freshly cached page is read back in. Paging past deleted
messages is in [feed-windowing.md](./feed-windowing.md).

- **Unsent rows are opt-in** (`includeUnsent`). Rows still sending or failed carry `chat_no` 0 and sort
  lowest in the pagination index, so in a channel holding a page of committed messages they fell off the
  newest page and a failed message showed no "Not delivered" and no retry button. `apps/web` does not
  pass the flag. For the same reason the older-page cursor skips `chatNo` 0: taken as the oldest row,
  it asks for everything before 0, gets nothing and ends load-more for good.
- **The channel record is the freshness signal.** The engine's chat sync does not deliver mid-session
  messages here: the live frame arrives as `channel.sync` and goes to the channel target only, the chat
  plan's periodic run does nothing, and its connect catch-up never fires for a target registered while
  already connected. The channel record is kept live by the channel plan's poll, so when its newest
  `chatNo` runs ahead of the cache, `useChats` pulls the newest page. The check is guarded per channel
  and number so a target the feed cannot show (a deleted or thread-only message) is not refetched every
  render; a failed fetch gives the guard back, so the next chance (a cache emission, a newer number, a
  reopen) tries again, and a persistent failure costs one request per chance, not a loop.
- **A cold room is not an empty room.** The cache reads empty before the first page lands. The feed
  stays loading until the room's prime settles, then trusts empty after `EMPTY_SETTLE_MS`; on a socket
  that never verifies it gives up after `UNVERIFIED_CEILING_MS` and offers a retry instead of a skeleton
  that never ends.
- **Duplicate older-page requests are blocked with refs, not state.** A scroll handler fires every frame
  at the top, and the thread panel's pager calls again before any render hands new state, so two calls
  in a tick both saw "not loading". The request in flight is named by scope, so a page still out for the
  channel just left does not block the one now on screen, and a landed page is not asked for again while
  the widened window has not been read back (the oldest row is still the old cursor).
- **A second consumer does not save the depth.** The thread panel reads the same channel with
  `persist: false`, so paging a thread's replies back does not widen the room the next time it opens.

## Background channels

Chat content streams only for the open room, so background features ride the channel record.
`useChannelChatFeeds` registers a channel sync target per channel (which keeps `lastChat$` live and
feeds the unread badges) and emits a channel's newest message when its watermark advances. It
sees only the latest message, so a burst collapses to the newest, which is all a banner needs. The
first snapshot is a warm-up baseline, never emitted, and the baseline never regresses on a stale emit.

- **Observe only, no fetch per place.** `channel.mine` answers for the place the socket session is on
  and ignores the payload's `sid`, so a per-place refresh returned the active place's list every time.
  That read as "every channel of the place I asked about is gone" and pruned that place's cache. The
  cloud-wide cache the observers read is fed by `channel.sync` in the runtime's background sync.
- The relay cache is not place-isolated, so each place's observer filters to its own channels.
- Channel ids are per cloud and collide across clouds, so the baselines are dropped with their
  subscriptions on a cloud change.
