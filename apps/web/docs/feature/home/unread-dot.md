# unread-dot — telling you about somewhere you are not looking

Home marks activity in three places you cannot currently see: a **place** of the active cloud that
is not the selected one, a **cloud** other than the connected one, and the switcher control in the
header that opens the cloud sheet. All three are presence marks — "there is something here" — and
never a number.

The count you _can_ see, on a channel row of the selected place, is a different thing with a
different source, and it is described under [Counting](#counting--the-formula) below because the
place mark is summed from it.

## Why marks are not counts

A cloud you are not looking at is counted from its own cache, and that cache lags: a cloud with a
background socket asks its server for a channel delta once a minute (sooner when a push names it —
see [`CloudPushMarkRunner`](#cloudpushmarkrunner--where-marks-come-in-and-go-out)), and a cloud past
the background cap, or with no tokens yet, is only as fresh as your last visit there. The count
behind the mark is right within that lag; the sheet shows a mark rather than the number because
that is what the design draws (Figma 4147:24964, an "N" badge), and a presence mark is true for the
whole length of the lag, where a number would be briefly wrong.

The second rule is about pushes: **a missed mark beats a false one.** Where the source cloud of a
push cannot be pinned down to exactly one candidate, nothing is marked. The next signal will cover
it.

## Counting — the formula

`apps/web/src/app/utils/countUnread.ts` holds the only copy. The badge counts _user_ messages, but
`chatNo` is one monotonic sequence over user and system messages together, and `metaNo` is the
cumulative count of the non-countable system events at that point in the sequence. So the head and
the read cursor are two points in the same sequence and **each must be converted with its own
`metaNo` snapshot** before they are subtracted:

```text
unread = (channel.chatNo − channel.metaNo) − (cursor − cursorMetaNo)
position = whichever of my join row and channel.$join is further along
cursor = max(position.readNo, position.chatNo)
cursorMetaNo = position.metaNo ?? channel.metaNo
```

**Two cursors, and the one further along wins** (`readPositionOf`). My join row moves the moment I
read on this device; the channel's embedded `$join` only catches up on the next channel delta. But
the channel delta is the only thing that moves a cloud's cursors while that cloud is off screen — it
writes channel rows, never join rows — so a read made on another device reaches this one through
`$join` alone. A read position only moves forward, so the further one is right in both cases. On a
tie, the one carrying its own `metaNo` snapshot wins.

A join row written before the server began snapshotting `metaNo` has no `cursorMetaNo`, and the
head's value stands in. That errs **high** — by the system events between cursor and head — and the
direction is deliberate: the alternative, subtracting an unconverted cursor, errs low and hides
genuinely unread messages. Reading the room once repairs the row permanently, because the server
then answers `join.read` with both a cursor and its snapshot.

No read cursor at all counts 0. A channel with neither a join row nor a `$join` shows nothing rather
than flashing its entire history as unread.

`unreadOf(channel, join)` picks the cursor and calls `countUnread`; the home list, the search results
and the cross-cloud count all go through it. A second copy is how two screens start disagreeing
about the same channel:

```bash
grep -rn "countUnread\|unreadOf" --include='*.ts' --include='*.tsx' apps/web/src
```

## The three surfaces

### Place rows — the active cloud, from cache

`useChannelUnreads(channels, joins)` returns `byChannel`, `byPlace` and `total`.

There is **one** observation behind all of it. `ActiveCloudDataProvider`, mounted once in
`AppRuntime` above both the badge runners and the router, observes every channel of the connected
cloud plus my join rows and runs `useChannelUnreads` over them; `HomePage`, `UnifiedLayout` and
`UnreadBadgeRunner` all read that one value through context. Each used to assemble the same number
from its own channel observer plus a join observer per channel, so every join write was paid for
three times.

`HomePage` reads `byPlace` from it. Every site of the cloud has a key, so an unselected `PlaceItem`
can show its dot; the selected row shows a `VerifiedBadge` instead, because it is where you already
are. `ChannelList` re-derives `byChannel` over just the visible channels from the same join map — a
second pass over data already in hand, not a second subscription.

The provider is **observe-only** (`sync: false`): mounting the app registers zero per-channel join
sync. Freshness rides the cloud-wide `syncChannels` delta in `useBackgroundSync` plus the join
cache's own optimistic writes, and a screen that needs a live cursor registers one itself
(`useJoinSyncRegistration`) so it tears down with that screen.

Cursors are the further along of the observed join row and the channel-embedded `$join` (see
[Counting](#counting--the-formula)). That also counts a room of another place whose join row this
device has never synced, which used to read 0 until the room was opened.

### Cloud rows and the header switcher — each cloud's cache, plus push marks

Two independent inputs are OR-ed on both surfaces:

- `useOtherCloudUnread` — each cloud other than the active one (owned + invited + relay), counted by
  `OtherCloudUnreadProvider`. The provider mounts one observer per cloud, reading that cloud's
  partition under **the uid the account has there** (`useUidInCloud(cid)`) — channel rows, places,
  and my join rows — and runs the same `useChannelUnreads` as the active cloud. The observers are
  live: when a cloud's background delta lands in its partition, its count moves without anything
  asking. A cloud the account has no uid in yet is absent until one is issued.
- `useCloudPushMarkStore` holds `badged: Record<cloudId, true>` — clouds a chat push arrived for
  whose cache has not caught up with it yet. `mark` and `clear` return the same state reference on a
  no-op, so a repeated mark does not re-render the sheet.

The provider replaced a one-shot scan of every cached cloud through `resolveContext`. That scan read
every partition under the **active** cloud's uid, which matches the uid the account has in another
cloud only by coincidence — the relay was never counted while a cloud was on screen — and what it
did find was only as fresh as the last visit.

In the sheet, `CloudSessionSheet` draws a `CloudUnreadBadge` on a row when either says so.
`DouHomeItem`, `CloudItem` and `InviteCloudItem` share that one badge component rather than each
hand-rolling a dot. In the header, `HomePage` computes the same OR and passes `switcherDot` to
`AppHeader` — the sheet is invisible until opened, so the discovery surface has to be outside it.
The app-icon badge adds the same per-cloud counts to the active cloud's total (`UnreadBadgeRunner`).

**The mark store is filtered at draw time, not at write time.** A row is only marked when its id is
in the current catalog (owned clouds + invited clouds + relay). A mark for a cloud that was deleted,
or for a malformed `cid`, is then structurally incapable of becoming a permanent dot.

## Resolving which cloud a push came from

`features/home/utils/resolvePushCloudId.ts` is the **single place in the app** that interprets a
push's cloud hint. Native code stores the hint fields raw and the foreground bridge forwards them
unparsed; neither normalizes. Three runtimes cannot each own a copy of this logic and stay agreed.

The resolver is a pure function with its dependencies injected (`cids`, `resolveContext`):

1. `cid === '#'` → the relay cloud, `'default'`. The sentinel is the relay's own marker.
2. A non-empty `cid` → itself.
3. An empty `cid` → a cross-partition cache read through `resolveContext`. First by `uid`, matching my
   join row; then by `channelId`, narrowed by `sid` and `channelName`. **Each narrowing step applies
   only when it leaves a candidate**, and anything other than exactly one surviving cloud returns
   `null`. `resolveContext` reads every partition under the active cloud's uid, so outside the
   active cloud this step rarely finds a candidate and the push goes unmarked — a known gap, and
   the missed-beats-false direction. Fixing it means handing the search source a uid per cloud.

`null` means no mark. That is the missed-beats-false rule in code.

## `CloudPushMarkRunner` — where marks come in and go out

Mounted once under `AppRuntime` beside `UnreadBadgeRunner` and `CloudActivatedRunner`, not on the
home page, so the store stays correct on every route.

Two arrival paths, one resolver:

- **Foreground** — `OnReceiveNotification` delivers the payload; `extractPushCloudHint` pulls the
  hint out and the resolver runs immediately. **Only a chat push may mark** (`isChatPush`): the rule
  is "chat passes", so a notification type added later stays off the dot without a list to extend.
  A cloud-activation push (`type: 'cloud'`) is why — it names the brand-new cloud, which lit up as
  unread the moment it was created. A push with no `type` passes too: the payload spec lives outside
  this repository, and a chat push without the field must still mark.
- **Background or killed** — the push never reaches the web layer at all. The native shell records
  the raw hint alongside its badge increment, and this runner drains that store with
  `appBridge.fetchPushMarks()`, which reads and clears in one call. It drains on mount — by the time
  the runner mounts inside `RuntimeConnectionHost` the `WebAppReady` handshake has completed, so a
  plain mount effect already means "after boot" — and again on every foreground return, because a
  mark can land while the app is merely backgrounded. The shells only record from a chat
  notification channel, so the chat rule holds there by their own means.

A push naming the **active** cloud is never marked; its live socket already owns that cloud's unread
state.

**A mark is a bridge between hearing of a message and that cloud's cache holding it.** A cloud off
screen is not sent the message on its socket (measured on the dev servers — see `libs/app-runtime`'s
sync doc), so its count would only move on its next once-a-minute delta. Marking therefore does two
things: it lights the dot, and it asks that one cloud for its delta now
(`runtime.sync.refreshBackgroundClouds(cid)`). That delta also re-reads the cloud's place list, so
a room in a place the cache has not learned yet is not filtered out of the count. The runtime
announces every answered background delta with the time its request was sent
(`runtime.sync.subscribeBackgroundDeltas`) — a kicked one only once its place read succeeded too —
and the first delta **requested after the mark** clears it, one second later: the cloud's observer
re-reads after its own short debounce, and clearing first would blink the dot off and back on. By then the message is in the cache and the count
keeps the dot on for as long as it is unread — and takes it off when it is read, on another device
too. Comparing against the request time, not the answer time, is what stops a delta already in
flight when the push landed from clearing the mark without the message. A second push for a marked
cloud moves the time the clearing delta has to postdate. A mark restored from the previous run
counts as made at mount.

A cloud with no background socket — past the cap, or with no tokens yet — never answers a delta, so
its mark stays until the user enters it. Entering clears it: a standing effect keyed on
`(isVerified && activeBadged)`, not on the switch edge, so a mark that resolves slightly _after_ the
socket verified still gets swept, because the condition re-evaluates on every state change rather
than only on the transition into it.

On a browser or an older native shell `fetchPushMarks()` degrades to an empty array, and the feature
falls back to foreground marks plus each cloud's cached count.

## The native contract

The web side of this feature depends on two things from the shell, and on nothing else about it:

| Contract           | Shape                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Stored hint record | `{ cid, uid, channelId, sid, channelName }` — raw strings, fields omitted when absent    |
| Drain message      | `FetchPushMarks` (`libs/app-messages`) — returns the records and clears the native store |

The records are written inside the same guard that increments the app-icon badge, so a push that
does not raise a badge does not leave a mark either. The native badge counter itself is a separate
concern — marks are never added to it. See [`apps/mobile`](../../../../../apps/mobile/docs/push/badge.md)
for the counter and [push](../../../../../apps/mobile/docs/push/README.md) for why a background push cannot
reach the web layer.

## Notes for implementers and tests

- Place marks are summed from a **cache-only** observation. Adding a sync registration to make them
  fresher would add per-channel server requests across every site of the cloud; that trade was
  refused. A screen that needs a live cursor registers one for itself and only for itself.
- A dot that will not clear is almost always a catalog-filter question, not a store question — check
  whether the marked id is still in owned + invited + relay before touching `clear`.
- `sid` is not part of the push specification. Code reads it optimistically as a narrowing hint
  only; there is no per-place push mark.
- `apps/desktop-web` has its own port of the mark store and runner. It is a reference, not a shared
  implementation, and the `'#'` relay branch exists only here.

## Further reading

- [README](./README.md) — the places and clouds these marks appear on
- [last-chat](./last-chat.md) — the preview and ordering, which do not feed unread
- [`libs/data`](../../../../../libs/data/README.md) — the channel and join caches these counts read, and
  the cross-partition search only the empty-`cid` resolver still uses
