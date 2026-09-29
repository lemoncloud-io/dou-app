# ADR-0126: A cloud off screen is counted from its own cache, and a push mark bridges only until that cache catches up

> Status: Accepted · Decided: 2026-09-29 · Implemented: `feat/cross-cloud-unread-web`
> · Scope: apps/web `OtherCloudUnreadProvider` · `CloudPushMarkRunner` · `utils/countUnread.ts` ·
> `libs/app-runtime/src/socket/sync/backgroundDeltas.ts` · `refreshBackgroundClouds(cid)`
> · Supersedes: [ADR-0056](./0056-place-cloud-unread-dot-from-cache-and-push.md) decision 2's dot
> formula and its switch-only clear. Its `cid` resolution, the switch clear for a cloud with no slot,
> and decisions 1, 3, 4 and 5 stand.
> · Builds on: [ADR-0125](./0125-a-cloud-off-screen-keeps-its-lists-current-with-one-delta-a-minute.md)
> (a cloud off screen keeps its lists current with one delta a minute)
> · Carries out: [ADR-0098](./0098-cloud-activated-notification-app-readiness.md) decision 2 (only a
> chat push lights the dot), which had not reached the code
> · The module doc is [apps/web/docs/feature/home/unread-dot.md](../../apps/web/docs/feature/home/unread-dot.md)

## Context

ADR-0056 gave a cloud other than the active one two inputs for its dot: a count recomputed from
the local cache, and a mark set when a push named that cloud and cleared when the user switched to
it. Three things since then change what either input can do.

- **The cache count read the wrong partitions.** It read every cached cloud through
  `resolveContext`, a one-shot cross-partition scan that takes one uid for all of them — the
  active cloud's. A partition is keyed by the uid the account has in that cloud, and nothing makes
  two clouds agree on it: the relay's uid never matches a cloud's, so the relay was never counted
  while a cloud was on screen, and a cloud was counted only where its uid happened to equal the
  active one's (on the dev servers, two clouds happened to assign the account the same uid). What
  the scan did find was also as old as the last visit, since nothing refreshed those partitions.
- **A cloud off screen is now current within a minute.** ADR-0125 gave every cloud with a socket
  slot a receive loop that asks for `channel.sync` once a minute. The rows it writes carry each
  room's head (`chatNo`) and this account's embedded `$join` — which is everything an unread count
  needs — but nothing read them.
- **Two measurements from ADR-0125's run on the dev servers**, one account on two devices: a
  message into a background cloud produced **no** `chat.sync` on that cloud's socket (it reached the
  cache on the next tick, 40–45 s later), and the delta **did** carry a `$join` moved by the other
  device's read. `channel.sync` writes channel rows only — never join rows — so while a cloud is
  off screen, `$join` is the only cursor that moves.

And a gap found on the way: ADR-0098 decision 2 says only a chat push may light the dot, but the
foreground handler still marked on any push with a `cid`, so a cloud-activation push lit a brand-new
cloud as unread.

## Decision

### 1. Each cloud off screen is observed in its own partition, under its own uid

`OtherCloudUnreadProvider` mounts one observer per cloud other than the active one (owned +
invited + relay). Each reads that cloud's channel rows, places and my join rows under the uid the
account has there (`useUidInCloud`), and runs the same `useChannelUnreads` the active cloud runs —
the active cloud's hooks were split into a cloud-scoped core (`useCloudChannelsSource`,
`useCloudPlaceIds`, `useCloudJoins`) and a thin active wrapper. The observers are live, so a delta
landing in a background cloud moves its count without anything asking; the `refresh` the old scan
needed is gone. A cloud the account has no uid in yet is absent. The app-icon badge is the active
total plus these.

### 2. The cursor is the further along of my join row and the channel's `$join`

`unreadOf(channel, join)` picks the cursor (`readPositionOf`) and calls `countUnread`, and every
count goes through it — home, search, and the per-cloud observers. The join row leads right after
a read on this device; `$join` is the only thing a read on another device moves while that cloud
is off screen. A read position only moves forward, so the further one is right in both cases; on a
tie, the one carrying its own `metaNo` snapshot wins. It applies to the active cloud too, where it
also counts a room of another place whose join row this device never synced (it read 0 before).

### 3. A push mark is a bridge, and the first delta requested after it retires it

Marking a cloud asks that one cloud for its delta now (`refreshBackgroundClouds(cid)`, new
optional argument), debounced like a push and with a fresh read of its place list — a room in a
place the cache has not learned is filtered out of every count, so the delta alone cannot be relied
on to show the message. The runtime announces every answered background delta with the time its
**request** was sent (`subscribeBackgroundDeltas`, one new public symbol), and the web clears the
mark on the first announcement for that cloud whose `requestedAt` is at or after the mark (a kicked
delta is announced only once its place read has answered too), one second after it so the cloud's
observer has redrawn first. From
there the cache count carries the dot, and a read — on any device — takes it off. A repeated push
moves the time; a mark restored from the previous run counts as made at mount. A cloud with no slot
never answers, so its mark keeps ADR-0056's rule: it clears on entering that cloud.

### 4. Only a chat push marks; a push with no type passes

`isChatPush` lets `type: 'chat'` and a missing `type` through and blocks everything else. The rule
is "chat passes", as ADR-0098 decided, so a type added later stays off the dot unasked. A missing
type passes because the payload spec that defines the field lives outside this repository, and
nothing in it confirms that every chat push carries `'chat'`.

### 5. The sheet keeps its "N" badge

The cloud rows and the header switcher keep drawing presence, not a number (Figma 4147:24964). The
count behind it is now real, but a background cloud's count lags its server by up to a minute and a
capped cloud's by as long as since its last visit; a presence mark is true for the whole of that
lag, a number is briefly wrong in it. Showing counts is a design change, not part of this one.

## Alternatives

- **Keep the scan and give `resolveContext` a uid per cloud.** Fixes the partition bug with a
  smaller web change, but the search source has a native SQLite implementation behind the bridge,
  so it widens the change into the shell, and the result is still a one-shot scan that has to be
  re-triggered by guesswork (it used to re-run whenever the active count moved). Rejected for the
  count; it remains the fix for the empty-`cid` reverse lookup in `resolvePushCloudId`, which reads
  through the same scan and is left as it is.
- **Skip the mark when that cloud's slot is verified and has answered a
  delta.** It assumed a background socket is sent `chat.sync`. It is not (measured), so a push for
  a background cloud would light nothing until the next tick — up to a minute with no dot at all.
  Rejected for marking-and-kicking.
- **Clear the mark on the next answer, whenever it was requested.** A delta already in flight when
  the push lands can come back without the message, clear the mark, and leave the dot dark until
  the following tick. Comparing request time is what makes the clear safe. Rejected.
- **Count from join rows only**, as the active cloud did. A read made on another device would never
  reach a background cloud's count, because nothing writes its join rows while it is off screen: a
  cloud you had read everywhere else would stay unread here until entered. Rejected.
- **Register per-channel join sync on each background cloud's socket.** Keeps join rows fresh, at
  one request per channel per background cloud per cycle — the cost ADR-0056 already refused for
  the active cloud's other places, multiplied by five. `$join` in the delta the loop already makes
  covers it for free. Rejected.
- **A strict gate — `type === 'chat'` only.** Correct if the spec says every chat push carries it,
  and silent on every chat mark if it does not. Without the spec in hand the lenient direction was
  chosen; tightening it is a one-line change once the spec is confirmed.
- **Counts in the sheet.** See decision 5. Rejected for now.

## Consequences

**What is gained**

- Measured on the dev servers (2026-09-29), one account on two devices, the receiving one on cloud
  B: with a room of cloud A made to read 3 unread in the cache, the header dot, the sheet's "N"
  badge and an app-badge total of 3 appeared on A's next background delta, and a message sent into
  that room from the other device took all three back to 0 on the delta after — both without
  leaving B.
- The cloud dot and the app-icon badge follow what actually happened in other clouds — including a
  read made on another device — within a minute, and within a round trip of a push.
- A mark no longer sits on a cloud until the user visits it; it lasts only until the cache has the
  message.
- A cloud-activation push no longer lights a new cloud as unread.
- One cursor rule and one count function serve every surface.

**What it costs**

- One cache observer per channel per background cloud (plus a channel and a place observer per
  cloud). Local reads only — no requests — but up to five clouds' worth of observers are live at
  once where there were none.
- One extra `channel.sync` per marking push, on that cloud's socket.
- A mark for a cloud without a slot still clears only on entering it.
- An empty-`cid` push for a cloud other than the active one is still rarely resolved (the scan's
  single uid), and goes unmarked — the missed-beats-false direction.
- The lenient gate lets through any typeless push; if a non-chat notification is ever sent without a
  type, it will mark.
- desktop-web still runs its own port of the old rules; it is not changed here.
