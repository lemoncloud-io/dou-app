# local — storing, reading, emitting streams

> Status: Live · Last updated: 2026-11-15 · Overview in the [lib README](../../README.md) · Canonical code: [local/data-sources/types.ts](../../local/src/data-sources/types.ts) · [local/ports/cacheStorage.ts](../../local/src/ports/cacheStorage.ts)

The local layer handles **storing, reading and emitting streams** for the local data an app reads.

`local` never calls `remote` directly. It is the layer that re-emits, as a UI read-model, the remote
results a repository wrote. In other words it is not "sync logic" — it is "the layer that safely stores
the result of a sync and sends it out on a stream".

## Layout

```text
local/
  data-sources/  9 per-domain LocalDataSources + the BaseLocalDataSource stream engine
  ports/            ports that receive external implementations — cacheStorage · indexeddb · metrics · policy · search
  stableHash.ts     scope key hash
```

**The storage engine is not in this lib.** The `CacheStorage` implementations (`IndexedDBAdapter`,
`NativeDBAdapter`, `BaseDbAdapter`) and the compound queries (`ChatQueryExecutor`, `IndexedDBDatabase`)
all live in `@chatic/db`. `ports/` declares only the interfaces those implementations satisfy.

**And on native, `@chatic/db` is not the end of the line either.** `NativeDBAdapter` holds no rows —
it turns every call into a bridge message. The SQLite that actually stores them belongs to the app
shell, which is a separate deploy. A cache read therefore crosses three packages:

```text
libs/data     LocalDataSource → the CacheStorage port
libs/db       IndexedDBAdapter   web    · rows live here, in the browser's IndexedDB
              NativeDBAdapter    native · a bridge client holding no rows
              WebStorageAdapter  session · rows live here, in the tab's sessionStorage (invitecloud in a plain tab only)
                                            ↓ SaveCacheData · FetchCacheData · …
apps/mobile   CacheCrudService → SqliteDatabase   native · rows live here
              database/sqlite/schema.ts · tables.ts · services/cache/cacheDomainVersions.ts
```

Which of them a domain gets is decided by none of them — `resolveCacheBackendFor` in
`@chatic/runtime-web` owns that, as the page's answer to `LocalCachePorts.route()`.

**Choosing which adapter a domain gets is not this lib's job either.** `resolveCacheBackendFor` in
`@chatic/runtime-web` decides environment, type pins and native capability in one place — see
[runtime-web docs/cache](../../../runtime-web/docs/cache/README.md).

## Responsibilities

- Reading local snapshots and emitting streams
- Partial merge and normalization
- Scope separation (`cid` / `uid`)
- Re-emitting, as a UI read-model, the remote results a repository wrote

## The shared contract

```ts
interface ILocalDataSource<TItem, TListQuery, TListResult> {
    cacheRead(id, contextOverride?): Promise<TItem | null>;
    cacheReadList(query, contextOverride?): Promise<TListResult | null>;

    observeItem(id, callback, contextOverride?): Unsubscribe;
    observeList(query, callback, contextOverride?): Unsubscribe;

    cacheWrite(item, contextOverride?): Promise<void>;
    cacheWriteMany(items, contextOverride?): Promise<void>;
    cacheDelete(id, contextOverride?): Promise<void>;
    cacheDeleteMany(ids, contextOverride?): Promise<void>;
    cacheClear(contextOverride?): Promise<void>;
}
```

Every method takes a `contextOverride` — so that the request-time scope a repository captured can be
applied per call. The override decides three things together: the **partition** the operation reads
and writes, the observer key it notifies, and the `cid` stamped on a merged row. Without one, all
three follow the provider's current context. How the partition half works is in
[which partition an operation touches](#which-partition-an-operation-touches).

## Domains

`channel`, `chat`, `cloud`, `invite`, `join`, `place`, `profile`, `user`, `syncMeta` — nine.

Factory: [data-sources/index.ts](../../local/src/data-sources/index.ts) —
`createLocalDataSources(contextProvider, storages, options?)`. `options.routingFingerprint` flows only
into `syncMeta`, so a cursor can notice that its storage moved (ADR-0053).

## The stream model

`BaseLocalDataSource` is the core of it. The UI only ever looks at `observe*`, and when a repository
touches local, **only the affected observers** are recomputed.

- **Item observers and list observers are separate** — registered through `observeItemQuery(id, …)` and `observeListQuery(key, …)`. Subscribing emits once immediately (unless the subscription ends first) and returns an unsubscribe function.
- **A list observer key is built from the query** — `createListObserverKey(parts, …)` combines the scope key with the query parts. A different query is a different observer.
- **Re-emission is scoped to what was affected** — a mutation does not re-emit everything.
    - `scheduleItemReemit(ids)` — only the observers for those ids
    - `scheduleListReemit(prefixes)` — only the list observers whose key starts with a prefix
    - `scheduleFullReemit()` — everything (a scope switch, a clear, and so on)
- **Debounced flush** — re-emissions are collected on a 50ms timer and flushed at once (duplicate notifications are removed in the process).
- **Nothing reaches a subscription after it ended** — the unsubscribe function is the end of delivery, including the first emit. That first emit can be a read still in flight, so it is checked against the live subscription when it lands rather than when it started. The case that needed it: a screen moves to another scope, its read there is out, and the move is undone (a refused cloud switch). The screen goes back to the old key and is answered from memory at once, and the abandoned key's read, landing after that, used to reach the same `setState` and replace the right answer with the abandoned scope's rows — home showed "no rooms" until something else wrote.

### Observer sharing

Observers on one key are one **group**, and the group, not each observer, owns the read.

- **One query per key.** The key is built from every parameter that reaches storage, so the same key is the same query. A re-emit runs it once and hands the value to every callback; an observer that threw is kept as a breadcrumb and does not stop the others.
- **A newcomer does not read storage again.** The group keeps its last value. A new subscriber is answered alone, from that value, or by attaching to the read already in flight (a burst of hooks mounting on one screen), and only the first subscriber of a key reads. Re-delivering to the others would re-render every consumer whenever one more mounted.
- **A group outlives its last subscriber for a minute (at most 256 such groups).** A screen transition destroys subscriptions and recreates them at once, and on native each read is a bridge round trip. A resubscribe within that grace revives the group and is answered from memory. A write that reaches a group in grace discards it instead of re-querying, since nobody is listening and the next subscriber should read the post-write answer, not a value from before it. The grace timers are `unref`'d, so they never hold a Node process open.
- **A failed first read is retried once, after one second.** The callback had never been called, so the screen would stay empty until the next write or resubscribe. The retry does nothing if the group gained a value, another read started, or the group was removed meanwhile; on success it delivers to everyone waiting on the key.
- **Item keys carry the scope too.** A group reuses the query of whoever registered it first, so a raw id as the key handed a subscriber from another cloud the first one's data.

### Re-emit prefixes

`flush` matches a pending prefix with `startsWith` against observer keys, which makes two mistakes easy.

- A bare `<scope>|channels` (or `|chats`, `|joins`, `|profiles`) prefix matches every observer of the domain, so one write woke all of them and each re-read storage. Only the written channels (or sids) are named.
- The prefix ends in `|`, so it matches a whole key segment: without it `channel:ch-1` also matches `channel:ch-10`, and `sid:site-1` matches `sid:site-10`.
- Cloud-wide observers (an empty `sid` for channels, `sid:__all__` for profiles) must hear every written sid, so they get their own entry.
- `chats-last|` is the one catch-all kept on purpose: the last-chat observer's key is a set of channel ids, which `startsWith` cannot test membership against, so every chat write wakes it. It is the home list's single observer and the 50 ms flush coalesces it.

## Scope and cache slots

A scope is `cid` (cloud) and `uid` (user) — **the same pair the storage partition uses**
(`AdapterScope`, `ports/policy.ts`). Observers are isolated by the `stableHash` of that pair
(`getScopeKey`); a missing `cid`/`uid` normalizes to `'default'`.

**`sid` is not part of it (ADR-0085).** It used to be, and that split one physical partition across
several observer scopes: a write made under one place never reemitted an observer that had subscribed
under another, even though both read the very same rows. A place switch clears and re-selects the
place on its own timeline, so the two disagreed routinely and the rail went stale on screen while the
cache held the data.

Per-place views are isolated where they are actually asked for — the `|sid:<sid>|` segment of a list
key (`ChannelLocalDataSource`, `ProfileLocalDataSource`). The rule that keeps this sound: **a field
that reaches storage belongs in the observer key**, never in the scope alone. Put another way, if a
read's answer depends on a value, that value has to be in the key, because observers sharing a key
share one query execution.

### Which partition an operation touches

A data source does not hold a storage; it holds a **slot** (`ScopedCacheStorage<TType>`,
`ports/cacheStorage.ts`) and asks it for the storage of one scope: `storage(contextOverride)` in
`BaseLocalDataSource` → `slot.forScope(context)`. A write resolves its context **once, when it starts**
(`resolveContext`), and uses that one value for the storage, the `cid` it stamps and the keys it
re-emits — so a read-merge-write cannot read one partition, write another and wake a third scope's
observers, even when no override was given and the session moves mid-operation.

The slot builds one adapter per partition on first use and reuses it after. Each adapter is handed a
snapshot provider holding only that scope's `cid` and `uid` — the adapter still reads its provider at
call time, as it always has, but what it reads can no longer move. The memo is keyed by the resolved
partition (`resolveScopedContext`), so contexts that land in the same partition share an instance:
every context for `invitecloud`, whose partition is fixed, and every uid-less context, whose adapter
has no scope and skips every operation. The memo is not evicted — one small object per account and
cloud the session has touched.

`createCacheStorages` builds each slot's storage for the assembly-time scope immediately. Nothing
depends on that storage being special; it exists so the factory is called once per slot while the
assembler is watching, which is what its routing fingerprint (ADR-0053) and native-fallback report
count.

This is what makes the rule in [notes for implementers](#notes-for-implementers-and-tests) true. For a
long time it was not: every adapter got the live provider, so the captured scope reached the observer
key and the stamped `cid` but never the partition. An answer that landed after a switch was written
into the partition switched to, a stale prune read and deleted rows there, and an observer pinned by
an override read the live partition (ADR-0112).

Physical storage is per slot — a `ScopedCacheStorage<TType>` holding one `CacheStorage<TType>` adapter
per partition. There are nine slot keys: `channel`, `chat`, `user`,
`join`, `site`, `invitecloud`, `profile`, `meta`, `invite`.

Three domain→slot mappings need care (the slot is reused because the entity is the same).

| Domain     | Slot          |
| ---------- | ------------- |
| `place`    | `site`        |
| `cloud`    | `invitecloud` |
| `syncMeta` | `meta`        |

The policy that decides the storage scope (`cid`/`uid`) per type is **owned by this lib** —
`resolveScopedContext` in `ports/policy.ts`. `BaseDbAdapter` in `@chatic/db` imports it from
`@chatic/data` and uses it. That is, the engine knows only how to store; it does not know the scope
rules.

## Chat cursors and local

Local's job is not to compute a cursor. It is to return a snapshot for the query a repository gave it.

Taking `ChatLocalDataSource`:

- `cacheReadList({ channelId, cursorNo?, limit? })` / `observeList(...)`
- `cacheClearByChannelId(channelId)`

Watch for:

- The latest page and an earlier page have different queries, so they have different observer keys.
- The merge policy for a `chat.feed` response is the repository's responsibility (local stores and re-emits).
- `cursorNo` is a discriminator for fetching an earlier page, not a baseline for the latest sync.

## Room media index

A room's attachments and links, read from this device's cache without scanning every cached message:
`listRoomMedia` (one kind, newest first) and `countRoomMedia` (per kind) on `IChatLocalDataSource`.
A screen reaches them through `IChatRepository`, whose `listRoomMedia` and `countRoomMedia` hand the
call to the data source unchanged in the graph's scope — the repository is all a page can reach, and in a
shell that owns the session the call crosses the bridge as any repository call does. The answer is the
same in a browser, in a phone shell with the index and in one without it.

**One judge, two stores.** `chatMediaEntries` ([domain/chatMediaEntries.ts](../../model/src/chatMediaEntries.ts))
turns a message into its entries — `image`, `video`, `file`, `audio` (the attachment's `uploadSlotKind`)
and `link` (the `url` runs of the bubble's own tokenizer, so an address inside code is not a link,
and one URL counts once per message). An unsent, failed, deleted, system or event row has none; a
thread reply counts like any message of its room. `idx` is the attachment's `upload$$` position, and
for a link the slot count plus its order. The kind is decided here and nowhere else: the shell's
SQLite and IndexedDB only store and index what they are handed.

**The write path carries it.** `cacheWrite` and `cacheWriteMany` attach `mediaEntries` — and
`mediaEntriesVersion`, the rules version they were decided under — to the merged row they hand storage, so an edit, a delete mark (`hidden`) and a re-sent copy all rewrite the
message's entries in the same transaction as the row. A store reads the field three ways:

| `mediaEntries` on the row | What the store does                                       |
| ------------------------- | --------------------------------------------------------- |
| a list                    | replaces the message's entries with it                    |
| an empty list             | removes the message's entries                             |
| absent                    | leaves them alone — the row came from an older web bundle |

Absent and empty are kept apart on purpose: treating them alike would erase the index on every write
an older bundle makes. Deleting rows, clearing a room and clearing a scope take the entries with them.

**The page never splits a message.** Entries come newest message first and by `idx` within a message;
the page runs past `limit` by the rest of the message the limit landed in, because the cursor is one
message number (`cursorNo`) and a message cut in half would lose its tail to the next page.
`nextCursorNo` is the page's last message number, or `null` when nothing of that kind is cached below
— which says nothing about the server. A consumer that reaches `null` widens the cache with the room's
ordinary older-page load and asks again with the same cursor; those rows are indexed by their write.

**A room is filled once, with entries only.** Messages cached before the index existed have no
entries. The first read of a room only reads its cached rows, computes their entries with
`chatMediaEntries` and hands them to `saveChatMediaEntries(items, CHAT_MEDIA_ENTRIES_VERSION)` — it
never writes a row. Then it writes a mark: a `meta` row with id
`chatmedia-indexed:v<CHAT_MEDIA_ENTRIES_VERSION>:<channelId>`. Concurrent first reads share one run; a
run cut short starts over next time.

The rows are left alone on purpose. Every store stamps a row's cache time (`__cacheMeta.lastSyncedAt`)
on save, and the room's page reads that stamp as "the server sent this during this run" and skips
re-checking its block — so rewriting would switch off the re-check of the room's older messages. And
the copy written back would be the one read: a delete mark (`markMissingHidden`, which keeps the row's
`updatedAtMs`), a delete or a clear landing in between would be undone. Instead the store applies a
fill item only while the message's row still exists and its `mediaEntriesVersion` (absent = 0) is
below the fill's version, checked in the same transaction as the write. A write since the read stamped
the current version and already put the right entries; a deleted or cleared row is gone; either way
the item is skipped. A row already at the current version is not sent at all, and neither is a row
with no version and no entries, since nothing was ever indexed for it. The mark is read by its own rule
([data-sources/chatMediaIndexMarks.ts](../../local/src/data-sources/chatMediaIndexMarks.ts)), not by
`getSyncedAt`: a sync cursor retires after the `meta` TTL (30 minutes), which would refill every room
every half hour. A mark has no age. It holds while it was written under the current routing
fingerprint and after the last cache clear (`cursorsValidAfter`), and raising
`CHAT_MEDIA_ENTRIES_VERSION` — required whenever `chatMediaEntries` would answer differently for a row
it has answered before — retires every mark, so each room is filled again under the new rules. Nothing
fills a room at boot, login or sync.

**A store without the index is read from plain rows.** `CacheStorage` declares four optional members
for this — `canQueryChatMedia`, `loadChatMedia`, `countChatMedia` and `saveChatMediaEntries`. When the storage cannot query
(a phone shell built before the index, or the handshake reply not in yet), the data source pages the
room's plain rows and runs the same `chatMediaEntries` over them: the same page and counts, slower,
and nothing filled or marked. A read the index fails on (`null`, a bridge error) is answered the same
way, for that read only.

## Sync cursors and cache lifetime

`SyncMetaLocalDataSource.getSyncedAt` answers 0 ("sync everything") whenever it cannot vouch for a
cursor. A missing row is a first sync and stays silent; the other three are reported with a
`sync-cursor-retired` warning naming the reason, because a retired cursor costs a full re-sync and a
fingerprint that changed on every boot would otherwise charge it forever with nothing to point at.

- **`expired`** — computed at read time from the row's `lastSyncedAt` against the current `meta` TTL, not from the stored `expiresAt`, so rows written under an older, longer policy are judged by today's. A row with no cache meta counts as expired. A cursor idle beyond the server's delta-history window points past what `channel.sync` / `profile.sync` can replay and would freeze the list stale; every successful sync re-saves the cursor and refreshes its TTL, so only an inactivity gap longer than the TTL expires one.
- **`routing-changed`** — the stored `routing` differs from the assembler's fingerprint. The fingerprint deliberately covers every cache type, because cursor kinds are assembled by callers (`channel-sync:<cid>`) and a kind-to-domain table would silently miss a later one. The cost is that an unrelated domain's routing change also retires them. A cursor written before the stamp existed has no `routing` and retires once. Without a fingerprint (tests, injected storages) the check is off.
- **`cache-cleared`** — saved before `cursorsValidAfter()`.

TTLs by cache type (`ports/policy.ts`): `chat`, `invite` and `invitecloud` never expire in practice
(100 years). An invite's expiry is judged from the server's `state` / `expiredAt`, so evicting the cache
would only undo its purpose, instant render on a cold boot. `channel`, `join`, `profile`, `site`, `user`
and `meta` live 30 minutes. The partition fallbacks are asymmetric: a missing `cid` becomes `default`,
which is a real partition (the relay), but there is no uid-less cache, so no uid means no scope and the
adapter skips every call. `invitecloud` is answered before that uid check with a fixed global partition,
because whoever opens an invite link may not be signed in yet.

## Reading rows

- **`loadMany` omits absent ids and promises no order.** Merging writes index what came back by id (`indexById`) rather than pairing by position; the in-memory test fixture returns rows reversed so code that pairs by position breaks in tests. Readers that look rows up by id (chat authors, say) ignore the order.
- **The last-chat read has a fast path and a fallback.** `cacheReadLastList` asks storage for the newest previewable and newest activity row per channel plus the channel's highest `chatNo` in one call (`loadLastPerChannel`, optional, one bridge round trip on native). The SQL decision is only an optimization: this layer re-checks each row with `isPreviewableChat` / `isActivityChat`, and a channel that is missing from the answer, fails the check or carries no `activityItem` (an app build that predates it) is read from its newest 30 cached rows instead. A channel with no rows is a valid answer (`lastNo: 0`, no preview), not a fallback. `lastNo` counts every row type so a head-driven refresh can compare against it.
- **Channel and place lists sort by id, numeric-aware**, so the rail does not follow server order or activity times.
- **A channel or profile query with no `sid` means every place of the cloud**, never the ambient one: reading it would answer differently depending on which place was selected while the observer key could not see the difference.
- **A partial profile write merges.** The cached row is read before normalizing so a `profile.get` / `profile.set` answer without `thumbnail` does not wipe the cached photo; the existing rows of a batch are read in one call.

## Cache clear

What gets deleted and when — the scope semantics, the irreversibility of deleting chat, the purge
triggers on leaving and rejoining — is policy at the repository layer, and the canonical text is
[the cache clear rules](../repositories/README.md#cache-clear-rules). What is written here is only **how**
storage carries that request out.

### Three paths for a channel-scoped delete

`clearByChannelId` does the same job a different way per adapter
(ADR-0067).

| Adapter                   | How                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `IndexedDBAdapter`        | A channel index range cursor                                                                                                    |
| `NativeDBAdapter`         | The bridge message `ClearCacheDataByChannel` → `DELETE … WHERE cid=? AND uid=? AND channel_id=?` (one round trip, zero payload) |
| `BaseDbAdapter` (default) | `loadAll({ channelId })` → `deleteAll(ids)`, for a store with no scoped delete of its own                                       |

Why this was not done by adding a `channelId` field to the existing `ClearCacheData`: web ships ahead of
the app, so **a shell that did not know the field would have ignored it and wiped the entire table for
that scope.** A new message type cannot fail that way. Every phone shell the web still runs in (app
0.30.0 and later) answers it, so `NativeDBAdapter` keeps no fallback for it: a failure (a timeout, say)
is rethrown as is, because a delete that did not happen must not look as if it did.

The default read narrows to the channel for the domains that declared `channelId` as a query (chat and
join). So emptying one room does not send an entire table across the bridge.

## Adding a cache domain

[Adding a server call](../remote/README.md#adding-a-server-call) covers the outbound side. A domain
that also needs a **subscribable local cache** reaches across three libs and the native shell, and
only the middle of it is type-checked. Work top to bottom.

| #   | Where                                                                                                                                                                                                                                                                 | Caught by                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `CacheType` in [`libs/bridge-messages`](../../../bridge-messages/src/types/model/cache.ts) — the bridge vocabulary, not a local name                                                                                                                                  | the compiler, everywhere the union is switched on                                                     |
| 2   | A slot in `createCacheStorages` ([ports/cacheStorage.ts](../../local/src/ports/cacheStorage.ts))                                                                                                                                                                      | [cacheStorage.test.ts](../../local/src/ports/cacheStorage.test.ts) pins the slots **and their order** |
| 3   | The data source itself — extend `BaseLocalDataSource`, then add the key to `LocalDataSources` and its line in `createLocalDataSources` ([data-sources/index.ts](../../local/src/data-sources/index.ts))                                                               | the compiler                                                                                          |
| 4   | `REQUIRED_DOMAIN_VERSION` in runtime-web [`nativeCacheSupport.ts`](../../../runtime-web/src/localCache/nativeCacheSupport.ts), when the domain needs a minimum shell version — the app declares its own side in `apps/mobile` `services/cache/cacheDomainVersions.ts` | **nothing**                                                                                           |
| 5   | The SQLite side in `apps/mobile` — a data source, a `CacheCrudService` arm, and the table in `database/sqlite/schema.ts`. `@chatic/db` needs no line: `NativeDBAdapter` is generic over `CacheType`                                                                   | **nothing**                                                                                           |
| 6   | A repository — `buildRepositories` plus `DOMAIN_KEYS` in [repositories/index.test.ts](../../repositories/src/index.test.ts)                                                                                                                                           | that test                                                                                             |

**Steps 4 and 5 fail in silence, and the silence is by design.** `resolveCacheBackendFor` sends a type
the installed shell cannot hold to web storage instead (ADR-0053) — that is the deliberate fallback
for a shell that predates the domain, because the web deploys ahead of the app. The app end agrees:
`CacheCrudService.getDataSource` answers `null` for a type it does not know rather than throwing,
because a throw would arrive on the web as a bridge error and muddy that very fallback. Nothing logs
an error. The cache simply reads empty for as long as the native side is missing, which is
indistinguishable from a permanent cold miss. So a new cache domain is not finished when it compiles;
it is finished when the shell that stores it has shipped.

## Notes for implementers and tests

- The context must be read at **call time**, not at construction time (a repository injects the scope it captured via `contextOverride`).
- The request-time context and the response-time context can differ → capture the scope in the repository.
- Reach storage only through `this.storage(...)`. An operation that awaits starts with `const scope = this.resolveContext(contextOverride)` and passes `scope` to everything after it — storage, stamps, re-emits. A second read of the provider inside the same operation, made without an override, can answer a different partition than the first.
- Local suites build on one fixture, `createPartitionedMemoryStorage(type)` (`local/src/testing/MemoryCacheStorage.ts`, imported as `@chatic/data-local/testing` from the repository tests) — the production `createScopedCacheStorage` over in-memory maps, so every test runs on real partitions and the routing under test is the real one. `slot.forScope({ cid, uid })` returns the very storage the data source uses for that scope: seed it, read it back, or spy on it. A suite does not write its own in-memory storage.
- Scope poisoning and the `chat.feed` merge policy are the repository's responsibility → [notes for implementers and tests](../repositories/README.md#notes-for-implementers-and-tests).
