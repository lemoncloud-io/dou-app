# active cloud data — the shared channel, unread and catch-up observation

What the app observes once for every screen, how a cloud that is not on screen is counted, and how a
room that fell behind is caught up. The cold-cloud rule and scope pinning the hooks below rely on are in
[data-flow.md](./data-flow.md#3-reading-data--observe); the badge's consumers are in
[layout-shell.md](../shell/layout-shell.md#unread-badge-one-shared-observation-three-readers).

## One observation of the active cloud

`ActiveCloudDataProvider` (mounted in `AppRuntime`, above the badge runners and the router) holds the
cloud-wide channel list, my read cursors and the unread aggregation derived from both.
`useActiveCloudData` reads it and **throws** without the provider: a silent private subscription would
bring back the duplication, and a silent empty value would show a zero badge that never corrects itself.

- **Why it sits above the router.** A cache write re-renders the provider and its context consumers
  only; `children` arrives as one unchanged element, so React bails out of the route subtree instead of
  walking it.
- **Cloud-wide, so per-site views are filters.** `channels`, `byChannel` and `myJoins` cover every site of
  the cloud; consumers look rows up by channel id, so extra keys are inert, and `useHomeChannels(sid)` is
  a `filter` on the shared list (with the data layer's place rule, `isInPlaceList`) rather than a second
  observer. A second, per-site observer carries a different list key, so the cache cannot share its read
  and every channel write cost two full scans.
- **Observe-only.** Mounting the app registers no per-channel join sync. Freshness comes from
  `useBackgroundSync`'s cloud-wide channel delta (rows carry their own `$join`) and from the join cache's
  optimistic writes when I read. A screen that wants a live cursor calls `useJoinSyncRegistration`, so
  the registration tears down with it. Join registrations refcount by `<channelId>@<uid>`, so overlapping
  ones (the room registering every member, home registering me) collapse into one poll.
- **My cursor comes from the join row, not `$join`, when it can.** The embedded `$join` lags a read
  (the join cache moves at once, `$join` only on the next channel sync), but `$join` is the only copy that
  moves when another device reads while its cloud is off screen. `useChannelUnreads` takes whichever is
  further along. A channel with neither counts 0 rather than flashing a full count.
- **Join targets use the selected cloud's own uid.** Every cloud gives the account a different uid and the
  session uid is only the committed cloud's, so during a switch a join id built from it would name someone
  else's row. The effect waits for that cloud's own slot, not the active one.

### Which channels are counted

- A channel whose place left the rail (access revoked, place deleted) keeps its cached row and unread. It
  would show in no list and no place dot, but would stay in the app-icon total with no way to open the
  room, so the badge would never go down. `useActiveCloudChannels` therefore drops channels of places the
  user can no longer reach, once the place list has resolved. A channel with no `sid` is a row mid-sync and
  is kept; so are the account's notes-to-self room and a relay 1:1, whose place field is not where they live.
- `useAccessiblePlaceIds` answers `null` while unknown, never "no places": reading an unresolved list as
  empty would blank the badge on every cloud switch. An empty cache is treated as unresolved too, but only
  for the cold-list window, so a cloud whose places really all went away still settles on the empty set.
- A cloud 1:1 counts like a group room under the place it lives in, so the place dot, bottom nav, cloud
  sheet and app icon all point at a row that clears them. One that names no place is counted in
  `byChannel` only, because nothing on screen could clear a mark for it.
- The server's "no place" is `#`, like an empty field.
- Scope the observer by `{cid, uid}` taken from the React session, and key it on neither the place nor the
  provider's committed scope. A site switch does not change the cloud-wide read, so the observer is not
  re-created on one. When the selection moves, the render still holds the previous cloud's list for one
  commit, so rows are filtered to this cloud at render time before anything registers a sync target for
  them; a background socket for the new cloud is already up and would receive the old cloud's ids
  (`place.get` 404, `auth.switch` "siteId is invalid").

## Clouds that are not on screen — `OtherCloudUnreadProvider`

One count per inactive cloud, for the cloud sheet, the switcher dot and the app icon. Each inactive cloud
gets an observer of its own partition, under **the uid the account has in that cloud**: reading it under
the active cloud's uid would find another partition, and the relay was never counted while a cloud was on
screen. An observer waits for that uid and is keyed on it.

- The partitions stay current through the runtime's background receive loop (a channel delta per cloud
  about once a minute, sooner on a push for it).
- A cloud with no socket slot (past the background cap, or no tokens yet) has no loop, so its count is its
  cache as last received; the sheet's push mark covers that case.
- Only non-zero counts are kept, so 0 and "absent" are one state and a change between them re-renders
  nobody. Counts are filtered to the current cloud set at read time, because a cloud that just became active
  is still reported until its observer's unmount withdraws it. The active cloud is taken from the session,
  not a prop, so no consumer can disagree about which cloud is excluded.
- `useOtherCloudUnread` excludes the cloud on screen (observed live above) from owned + invited + relay.

## Keeping every room's preview current — `useChatSyncRegistration`

Home only reads the chat cache, so a row repaints only when something writes a newer message. Inside a
room `useChatSync` is that writer; for every other room nothing was, so previews and the activity order
sat still until the room was opened. `ChatSyncRunner` mounts the hook once for the app, so it runs on every
route and the cache holds the place's rooms whatever screen is open (the notification inbox relies on that).
The rooms are the place's own plus the cloud's notes-to-self room, minus someone else's notes-to-self:
that row is only left over from a previous account, the server refuses its feed to anyone but the owner,
and every head move would fetch a page that can only fail. The owner is compared against the uid the account
has in the selected cloud, not the session's, which lags a switch.

Two mechanisms, because the chat plan's `run` loads nothing by itself:

1. **A `chat` sync target per room.** A `chat.sync` frame goes to every registered chat target, so a message
   in any room is appended live and a reconnect catches the target up. Registrations refcount by key, so the
   open room's own registration folds into this one.
2. **Head-triggered catch-up.** A room whose polled head (`channel.chatNo`) runs ahead of the chat cache
   gets its newest page pulled, then older pages until they meet what the cache held. It does not care
   whether the push was delivered, missed or scoped away, and it only fires for rooms that moved.

Constraints that keep this cheap and correct:

- **The catch-up lives in a sync hook, not the list.** The list stays a pure cache read, so rendering a row
  can never make a network call.
- **The cache is read once per room at start and once more each time that room's head moves**, never on
  chat writes: a held-open observation would re-read every room's tail on every message anywhere.
- **Baseline.** The same read aligns the plan's `lastNo`, or the first push after a cold start looks like a
  gap and refetches the newest page per room. Only `lastNo` is patched, so an open room's window is intact.
- **One head fires at most one walk**, even when the response cannot advance `lastNo` (every new row was a
  reaction or thread reply). A reorder of rooms does not re-register or re-read (keys are sorted).
- **Cloud safety.** Targets and baselines name the selected cloud and wait for its own slot. A reading is
  applied only while the selection is still the cloud it was read in, and the walk checks before each older
  page that the cloud and uid are unchanged, because a baseline from one cloud would read as "already have
  everything" in another.
- **Not closed:** a hole whose newest rows reached the cache before the head moved, and a walk cut short by
  a switch or a failed page. The head they were started for is spent, so neither is walked again until the
  room is opened.

### Catch-up bounds (`hooks/chatCatchUp.ts`)

The server counts a page down from a cursor and returns the lowest number it counted; the gap is closed
when that cursor reaches the cache's newest row plus one, and 0 means the start of history.

| Value                            | Meaning                                                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CATCH_UP_LIMIT` = 30            | Newest page: deep enough to reach a previewable message past a reaction burst, and more than two screens for a room opened later                               |
| `CATCH_UP_OLDER_LIMIT` = 50      | Each older page                                                                                                                                                |
| `CATCH_UP_MAX_OLDER_PAGES` = 5   | At most 280 messages behind the newest page; a larger hole is filled when the room is opened and scrolled                                                      |
| `CATCH_UP_OLDER_CONCURRENCY` = 2 | Older pages in flight across all rooms; after a long absence every room walks at once, and a 40-room place would otherwise put them all on the socket together |

A room the cache holds nothing of gets its newest page only: it has history, not a hole, and walking every
such room would pull the bound for each one on a fresh install. A cursor that does not move down stops the
walk rather than asking for the same page again. The newest page uses its own size, not the room feed's
default of 20, so a room opened on fewer than two screens does not immediately ask for an older page.

## My own profile and place profile

- `useMyProfile` shares one in-flight `profile.get-mine` per `<sid>@<uid>` across every mounted instance
  (home mounts two, the room a third), so the request and the cache write happen once. The entry clears when
  it settles, so a later mount still refreshes. The fetch waits for a verified socket: firing on mount
  raced the handshake and rejected with `503 SOCKET NOT CONNECTED` on every cold start.
- `usePlaceProfileAbsent` is a one-shot awaited read, not a subscription, because a reactive `null` would
  mean "loading" and "absent" at once. The judgement fails open (an inconclusive read, or no place at all,
  settles as "present"), so a gate on it never hangs. A verdict is stored with the `<sid>@<uid>` it was read
  for and returned only while that key is current; a guest promotion changes the uid but not the relay
  site, and a stale "present" would skip the gate exactly where it matters. Callers that mount before the
  socket can carry the read pass `enabled: false` until it can.
- `useSetMyPlaceProfile` writes only the place the session is on, and only once the session is really
  there: the server writes `profile.set` to the session's site and ignores the site in the payload. A new
  place needs a switch first. The write also refuses while a switch is in flight, since the selection is
  pre-applied before `auth.switch` commits and the write would land on the previous place. The state is read
  at call time, not render time, for the same reason.
