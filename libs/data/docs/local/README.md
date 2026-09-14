# local — storing, reading, emitting streams

> Status: Live · Last updated: 2026-09-14 · Overview in the [lib README](../../README.md) · Canonical code: [local/data-sources/types.ts](../../src/local/data-sources/types.ts) · [local/ports/cacheStorage.ts](../../src/local/ports/cacheStorage.ts)

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
                                            ↓ SaveCacheData · FetchCacheData · …
apps/mobile   CacheCrudService → SqliteDatabase   native · rows live here
              database/sqlite/schema.ts · tables.ts · services/cache/cacheDomainVersions.ts
```

Which of the two a domain gets is decided by neither of them — `resolveCacheBackend` in
`@chatic/app-runtime` owns that.

**Choosing which adapter a domain gets is not this lib's job either.** `resolveCacheBackend` in
`@chatic/app-runtime` decides environment, type pins and native capability in one place — see
[cache-storage-routing.md](../../../app-runtime/docs/data/cache-storage-routing.md).

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
applied per call.

## Domains

`channel`, `chat`, `cloud`, `invite`, `join`, `place`, `profile`, `user`, `syncMeta` — nine.

Factory: [data-sources/index.ts](../../src/local/data-sources/index.ts) —
`createLocalDataSources(contextProvider, storages, options?)`. `options.routingFingerprint` flows only
into `syncMeta`, so a cursor can notice that its storage moved (ADR-0053).

## The stream model

`BaseLocalDataSource` is the core of it. The UI only ever looks at `observe*`, and when a repository
touches local, **only the affected observers** are recomputed.

- **Item observers and list observers are separate** — registered through `observeItemQuery(id, …)` and `observeListQuery(key, …)`. Subscribing emits once immediately and returns an unsubscribe function.
- **A list observer key is built from the query** — `createListObserverKey(parts, …)` combines the scope key with the query parts. A different query is a different observer.
- **Re-emission is scoped to what was affected** — a mutation does not re-emit everything.
    - `scheduleItemReemit(ids)` — only the observers for those ids
    - `scheduleListReemit(prefixes)` — only the list observers whose key starts with a prefix
    - `scheduleFullReemit()` — everything (a scope switch, a clear, and so on)
- **Debounced flush** — re-emissions are collected on a 50ms timer and flushed at once (duplicate notifications are removed in the process).

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

Physical storage is per `CacheStorage<TType>` slot. There are nine slot keys: `channel`, `chat`, `user`,
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

## Cache clear

What gets deleted and when — the scope semantics, the irreversibility of deleting chat, the purge
triggers on leaving and rejoining — is policy at the repository layer, and the canonical text is
[the cache clear rules](../repositories/README.md#cache-clear-rules). What is written here is only **how**
storage carries that request out.

### Three paths for a channel-scoped delete

`clearByChannelId` does the same job a different way per adapter
(ADR-0067).

| Adapter                    | How                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `IndexedDBAdapter`         | A channel index range cursor                                                                                                    |
| `NativeDBAdapter`          | The bridge message `ClearCacheDataByChannel` → `DELETE … WHERE cid=? AND uid=? AND channel_id=?` (one round trip, zero payload) |
| `BaseDbAdapter` (fallback) | `loadAll({ channelId })` → `deleteAll(ids)`                                                                                     |

Why this was not done by adding a `channelId` field to the existing `ClearCacheData`: web ships ahead of
the app, so **an older app would ignore the field it does not know and wipe the entire table for that
scope.** With a new type, the same situation becomes a `NOT_FOUND`, which the adapter learns once
(`resetNativeClearByChannelSupport` is the test seam) and then drops to the fallback. It is the same
idiom as `FetchManyCacheData` and `FetchLastChatsData`, but the fallback has a different character — a
read that fails can come back empty-handed, while a delete's fallback has to actually finish the same
job.

The fallback read narrows to the channel for the domains that declared `channelId` as a query (chat and
join). So emptying one room does not send an entire table across the bridge. A failure that is not
`NOT_FOUND` (a timeout, say) is not learned from; it is rethrown as is.

## Adding a cache domain

[Adding a server call](../remote/README.md#adding-a-server-call) covers the outbound side. A domain
that also needs a **subscribable local cache** reaches across three libs and the native shell, and
only the middle of it is type-checked. Work top to bottom.

| #   | Where                                                                                                                                                                                                                                                           | Caught by                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `CacheType` in [`libs/app-messages`](../../../app-messages/src/types/model/cache.ts) — the bridge vocabulary, not a local name                                                                                                                                  | the compiler, everywhere the union is switched on                                                     |
| 2   | A slot in `createCacheStorages` ([ports/cacheStorage.ts](../../src/local/ports/cacheStorage.ts))                                                                                                                                                                | [cacheStorage.test.ts](../../src/local/ports/cacheStorage.test.ts) pins the slots **and their order** |
| 3   | The data source itself — extend `BaseLocalDataSource`, then add the key to `LocalDataSources` and its line in `createLocalDataSources` ([data-sources/index.ts](../../src/local/data-sources/index.ts))                                                         | the compiler                                                                                          |
| 4   | `REQUIRED_DOMAIN_VERSION` in app-runtime [`nativeCacheSupport.ts`](../../../app-runtime/src/data/nativeCacheSupport.ts), when the domain needs a minimum shell version — the app declares its own side in `apps/mobile` `services/cache/cacheDomainVersions.ts` | **nothing**                                                                                           |
| 5   | The SQLite side in `apps/mobile` — a data source, a `CacheCrudService` arm, and the table in `database/sqlite/schema.ts`. `@chatic/db` needs no line: `NativeDBAdapter` is generic over `CacheType`                                                             | **nothing**                                                                                           |
| 6   | A repository — `buildRepositories` plus `DOMAIN_KEYS` in [repositories/index.test.ts](../../src/repositories/index.test.ts)                                                                                                                                     | that test                                                                                             |

**Steps 4 and 5 fail in silence, and the silence is by design.** `resolveCacheBackend` sends a type
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
- Scope poisoning and the `chat.feed` merge policy are the repository's responsibility → [notes for implementers and tests](../repositories/README.md#notes-for-implementers-and-tests).
