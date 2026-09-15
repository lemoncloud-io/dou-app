# unread-dot — telling you about somewhere you are not looking

Home marks activity in three places you cannot currently see: a **place** of the active cloud that
is not the selected one, a **cloud** other than the connected one, and the switcher control in the
header that opens the cloud sheet. All three are presence marks — "there is something here" — and
never a number.

The count you _can_ see, on a channel row of the selected place, is a different thing with a
different source, and it is described under [Counting](#counting-the-formula) below because the
place mark is summed from it.

## Why marks are not counts

Data for a place you are not in, and for every cloud you are not connected to, is only as fresh as
your last visit there. A number computed from it would be confidently wrong. A mark says the one
thing that stale data still supports.

The second rule follows from there being no way to take a mark back: **a missed mark beats a false
one.** Where the source cloud of a push cannot be pinned down to exactly one candidate, nothing is
marked. The next signal will cover it.

## Counting — the formula

`apps/web/src/app/utils/countUnread.ts` holds the only copy. The badge counts _user_ messages, but
`chatNo` is one monotonic sequence over user and system messages together, and `metaNo` is the
cumulative count of the non-countable system events at that point in the sequence. So the head and
the read cursor are two points in the same sequence and **each must be converted with its own
`metaNo` snapshot** before they are subtracted:

```text
unread = (channel.chatNo − channel.metaNo) − (cursor − cursorMetaNo)
cursor = max(join.readNo, join.chatNo)
cursorMetaNo = join.metaNo ?? channel.metaNo
```

A join row written before the server began snapshotting `metaNo` has no `cursorMetaNo`, and the
head's value stands in. That errs **high** — by the system events between cursor and head — and the
direction is deliberate: the alternative, subtracting an unconverted cursor, errs low and hides
genuinely unread messages. Reading the room once repairs the row permanently, because the server
then answers `join.read` with both a cursor and its snapshot.

No read cursor at all counts 0. A channel whose join row has not arrived shows nothing rather than
flashing its entire history as unread.

`countUnread` is shared by the home list, the search results and the cross-cloud hint. A second copy
is how two screens start disagreeing about the same channel:

```bash
grep -rn "countUnread" --include='*.ts' --include='*.tsx' apps/web/src
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

Cursors come from the observed join rows, not the channel-embedded `$join`, which lags live read
state.

### Cloud rows and the header switcher — marks plus a cached hint

Two independent inputs are OR-ed on both surfaces:

- `useOtherCloudUnread` recomputes each inactive cloud's unread from the local cache, using the same
  `countUnread`. It is a hint, bounded by when that cloud was last open.
- `useCloudPushMarkStore` holds `badged: Record<cloudId, true>` — clouds a push arrived for while
  they were not active. `mark` and `clear` return the same state reference on a no-op, so a repeated
  mark does not re-render the sheet.

In the sheet, `CloudSessionSheet` draws a `CloudUnreadBadge` on a row when either says so.
`DouHomeItem`, `CloudItem` and `InviteCloudItem` share that one badge component rather than each
hand-rolling a dot. In the header, `HomePage` computes the same OR and passes `switcherDot` to
`AppHeader` — the sheet is invisible until opened, so the discovery surface has to be outside it.

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
3. An empty `cid` → a cross-partition cache read through `resolveContext`, the only cross-cloud
   reader in the app (repositories are scoped to the connected cloud). First by `uid`, matching my
   join row; then by `channelId`, narrowed by `sid` and `channelName`. **Each narrowing step applies
   only when it leaves a candidate**, and anything other than exactly one surviving cloud returns
   `null`.

`null` means no mark. That is the missed-beats-false rule in code.

## `CloudPushMarkRunner` — where marks come in and go out

Mounted once under `AppRuntime` beside `UnreadBadgeRunner` and `CloudActivatedRunner`, not on the
home page, so the store stays correct on every route.

Two arrival paths, one resolver:

- **Foreground** — `OnReceiveNotification` delivers the payload; `extractPushCloudHint` pulls the
  hint out and the resolver runs immediately.
- **Background or killed** — the push never reaches the web layer at all. The native shell records
  the raw hint alongside its badge increment, and this runner drains that store with
  `appBridge.fetchPushMarks()`, which reads and clears in one call. It drains on mount — by the time
  the runner mounts inside `RuntimeConnectionHost` the `WebAppReady` handshake has completed, so a
  plain mount effect already means "after boot" — and again on every foreground return, because a
  mark can land while the app is merely backgrounded.

A push naming the **active** cloud is never marked; its live socket already owns that cloud's unread
state.

Clearing is a standing effect keyed on `(isVerified && activeBadged)`, not on the switch edge. A
mark that resolves slightly _after_ the socket verified still gets swept, because the condition
re-evaluates on every state change rather than only on the transition into it.

On a browser or an older native shell `fetchPushMarks()` degrades to an empty array, and the feature
falls back to foreground marks plus the cached hint.

## The native contract

The web side of this feature depends on two things from the shell, and on nothing else about it:

| Contract           | Shape                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Stored hint record | `{ cid, uid, channelId, sid, channelName }` — raw strings, fields omitted when absent    |
| Drain message      | `FetchPushMarks` (`libs/app-messages`) — returns the records and clears the native store |

The records are written inside the same guard that increments the app-icon badge, so a push that
does not raise a badge does not leave a mark either. The native badge counter itself is a separate
concern — marks are never added to it. See [`apps/mobile`](../../../../../apps/mobile/docs/badge.md)
for the counter and [push](../../../../../apps/mobile/docs/push.md) for why a background push cannot
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
- [`libs/data`](../../../../../libs/data/README.md) — the channel and join caches, and the
  cross-partition search these reads go through
