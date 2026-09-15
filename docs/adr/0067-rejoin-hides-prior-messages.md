# ADR-0067: Rejoining must look like joining for the first time — the joinedNo display gate and chat cache purge

> Status: Accepted · Decided: 2026-08-25

## Context

The server (`chatic-socials-api`) fixed the rejoin cursor reset in `0.26.810a` (PR #28,
`fix(joins): reset cursors on re-join so prior messages stay hidden`). `makeJoin`'s reactivation path was merging
cursors into a copy skimmed off the proxy cache, so the save was silently dropped; the fix changed the merge target
to the cache node `inc` returns, and narrowed the fields it overwrites to four: `chatNo` · `joinedNo` · `metaNo` ·
`notify`. Now, on rejoin, the storage cursor resets to the channel's current value, and the feed hits `listFeed`'s
`chatNo > joinedNo` rule and no longer returns messages from before the departure.

**But this fix alone changes nothing on screen.** The client doesn't render the server response — it subscribes to
and renders a local cache.

### Why the server fix never reaches the screen

The message stream is [`useChats`](../../apps/web/src/app/features/channels/hooks/useChats.ts)'s
`chatRepository.observeList` — a cache subscription. And nowhere on the departure path is the chat cache cleared:

- [`ChannelRepository.leaveChannel`](../../libs/data/src/repositories/ChannelRepository.ts) only clears the
  **channel** cache.
- `ChatSyncPlan` has no `onRemove` — a comment in [`plans.ts`](../../libs/app-runtime/src/socket/sync/plans.ts)
  deliberately states the design: "message history is kept for lazy-load/offline."
- `ChatRepository.refreshList` only does `cacheWriteMany` and doesn't prune. Rows the server no longer sends stay
  put.
- `cacheClearByChannelId` exists but has **0 production callers.**
- The cache persists on native SQLite / IndexedDB, so it survives an app restart.

The leak has three branches. **The feed** (entering the room shows the pre-departure conversation as-is), **the
home preview** (`observeLastList` derives from the same chat cache, so even when the server returns null via
`getByChannel({joinedNo})`, the old message stays in the preview), and **global search**
(`IndexedDbGlobalSearchSource` scans the whole chat table, and
[`useSearchContext`](../../apps/web/src/app/features/search/hooks/useSearchContext.ts) doesn't drop a chat with no
matching channel row — it renders it with `channelName: undefined` — meaning messages from a channel you've left are
already searchable today, independent of rejoining).

### A separate bug that blocks this in front

[`ChannelRepository`](../../libs/data/src/repositories/ChannelRepository.ts)'s `leftChannelIds` is an in-memory Set
that filters **both** `refreshList` and `syncChannels`, but it's only ever cleared on a leave-failure rollback.
[`DataManager`](../../libs/app-runtime/src/data/DataManager.ts) constructs repositories once in its constructor and
only swaps context via `ensure()`, so this Set survives even a cloud switch. In other words, **leave, then get
reinvited, and the channel doesn't come back to the list until a refresh.** Rejoin behavior can't even be verified
without fixing this first.

### What was checked about the bridge

The native chat table already filters by the `channel_id` column
([`ChatDataSource`](../../apps/mobile/src/app/data/cache/ChatDataSource.ts)) — the exact path used to read a room's
feed — so **every deployed app build supports it.** A channel-scoped purge therefore doesn't require a new bridge
message. The warning in [`storages/types.ts`](../../libs/data/src/local/data-sources/types.ts) about "pulling an
entire table over the bridge" is about the base calling `loadAll()` with no arguments, and doesn't apply to a chat
call carrying `ChatQueryOptions.channelId`.

### API contract

This server change carries no schema change. The client's `^0.26.721` caret already covers `0.26.810a`, so no
type/version work is needed. The response now returns `stereo`·`sid`·`nick`·`role` as preserved values, but the
client reads `join.stereo` nowhere.

## Decision

### 1. Put a joinedNo display gate at three consumption points

Drop `chatNo` entries at or below `myJoin.joinedNo` at render time. This uses the same basis as the server's
`listFeed`, so the rule isn't forked into two versions. It applies at all three points: **the room feed**, **the
home last-message preview**, and **global search results.** Search is ready for this — its context already carries
`joinsByRef` (keyed by channelId, my own joins) for unread computation.

This gate isn't a duplicate of the purge — it's a **retroactive line of defense.** It covers the existing install
base whose cache is already populated as of deploy time, plus the path where a purge signal never arrives (item 4
below).

### 2. Chat cache purge attaches only to explicit signals

- `leaveChannel` success (self-leave)
- `JoinSyncPlan.onRemove` removing **my own** join row

It does **not** attach to `ChannelSyncPlan.onRemove` or `syncChannels`'s stale prune. A wrongly deleted channel cache
gets refilled by the server anyway, but **a wrongly deleted chat cache can't be recovered** — the server only sends
what's after `joinedNo`. A single bad call in inference-based pruning permanently erasing history is worse than
leaving the leak to the display gate, so the display gate wins.

### 3. Add `ClearCacheDataByChannel` to the bridge, with the fallback as the canonical path

- **Fallback (works on every app build):** `loadAll({ channelId })` → ids → `deleteAll(ids)`. Two round trips,
  scoped to one channel. `ChatLocalDataSource` already knows `TType='chat'`, so it handles this in a type-safe way
  directly.
- **Optimization (new message):** a single native `DELETE … WHERE cid=? AND uid=? AND channel_id=?`. One round trip,
  zero payload.
- **Fallback switch:** after one `NOT_FOUND` from an app build that doesn't know this message, learn it and stop
  trying afterward — the same pattern already used by `FetchManyCacheData`/`FetchLastChats`.

Adding a `channelId` to the existing `ClearCacheData` is not adopted — a legacy app would ignore the field it
doesn't know and **wipe the entire chat table for that scope.**

### 4. Turn `leftChannelIds` from a permanent block into a time-boxed guard

The purpose of this Set is a race guard: preventing an in-flight response published right before a leave from
resurrecting the channel it just deleted. That purpose only needs a short grace period — there's no reason for it to
persist for the whole session. The grace value and expiry handling are set at the spec stage.

### 5. `notify` reset just follows the server

Rejoining unmuting is server-intended behavior. The client only reflects the value and adds no separate
notification UI.

### Out of scope

- `apps/desktop-web` — referenced but not modified.
- One-off cache migration — the display gate covers retroactively.
- Auto-purge triggered by detecting `joinedNo` advancing — the delete path stays a single explicit signal.
- `apps/testbed`.

## Alternatives

**Only the display gate, leave the cache alone.** Deployable immediately regardless of the bridge, but messages
from a left channel stay in the cache and search index permanently. This approach can't fix the global search leak.

**Attach the purge to a channel-teardown path.** Would also cover kicks and cross-device departures with no leak,
but a bad call in inference-based pruning turns into unrecoverable history loss. Rejected for the loss asymmetry
(a wrongly deleted channel is cheap, a wrongly deleted chat is permanent).

**Add a `channelId` field to `ClearCacheData`.** A single message solves it, but a legacy app ignores the field and
wipes the whole table. In a structure where the web deploys before the app, that's silent data loss.

**Detect `joinedNo` advancing and auto-purge below it.** Cleans up existing cache with no migration and also covers
kicks, but grows the delete trigger from one explicit signal to include a derived one. Chose to keep the delete path
narrow instead.

**A one-off cleanup migration.** Would also reclaim cache capacity, but is irreversible, whereas the display gate
gets the same user-facing effect while staying reversible.

## Consequences

**What is gained**

- Rejoining actually looks like joining for the first time — across the feed, the home preview, and search.
- An existing leak closes as a side effect: messages from a left channel showing up in global search with no
  channel name.
- A rejoined channel returns to the list within the session.
- **Shipping the web alone makes all of this work.** The app deploy is only an optimization that cuts the purge down
  to one round trip, and once the app catches up, the learned fallback switches over to the fast path on its own.

**What is accepted**

- **Kicks and cross-device departures are not purged.** As a comment in
  [`useChannelMutations`](../../apps/web/src/app/features/channels/hooks/useChannelMutations.ts) notes, the server
  doesn't push a join update to the person being kicked — `JoinSyncPlan.onRemove` can't be trusted on the kicked
  device. This path is covered only by the display gate; data stays in the cache.
- **A first-paint exposure window.** `joinedNo` updates via `syncChannelUsers`'s `$join` on room entry, so for one
  frame right after rejoining, before that response arrives, the gate runs on the old (smaller) value.
- **Cache size isn't reclaimed immediately.** Since the gate only hides, old rows from the existing install base
  remain.
- **Conflicts with `openFeed`.** The server has an `openFeed` that ignores the `joinedNo` guard, and the client
  currently sends this value nowhere. If a "reveal past history" feature is introduced later, the display gate must
  be turned off for that channel.
- One more bridge message — carrying native implementation, QA, and an app deploy along with it.

**Follow-ups**

Until the `leftChannelIds` fix lands, rejoin QA must assume an app restart. The implementation order should fix this
guard first, since it's what makes the rest of the verification possible.
</content>
