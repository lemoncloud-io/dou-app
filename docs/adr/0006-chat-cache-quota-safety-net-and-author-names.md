# Chat cache: a quota safety net + author names from the user cache; full bounding deferred

## Status

accepted

## Context

The data layer is a Hot/Cold 2-tier cache (see `docs/cache-architecture-spec.md`).
A review of the chat caching surfaced three facts that matter specifically for a
messaging app:

1. **The chat cache grows unbounded.** `DefaultEvictionStrategy` is a no-op,
   `DefaultCapacityPolicy` returns "unlimited", and chat TTL is effectively
   permanent (`createTtlMeta` → ~100 years). Worse, on web/desktop-web
   (`!isNativeApp()`, i.e. not a React-Native WebView — Electron counts as
   browser) `localFactory.selectStrategy()` returns
   `IndexedDbOnlyCacheStorageStrategy`, a **bare `IndexedDBAdapter` that never
   wraps `DynamicCacheStorage`** — so the eviction/quota hooks never run there at
   all. A heavy user eventually hits `QuotaExceededError` and can no longer
   send/receive until the cache is cleared by hand.

2. **Author names vanish after a cold reload.** The chat feed payload omits
   `owner$` for other users (only `chat:create` live pushes and the `chat:users`
   roster carry names; `ChatFeedPayload` has no `detail` flag). The designed
   `user` cache type already persists member profiles in IndexedDB, scoped by
   `{cid,uid}`, but `useChannelMembers` waited for socket verification before
   reading even the local cache — so on launch the roster was empty and headers
   flashed "Unknown". A stopgap added a parallel author-name cache in
   `localStorage` at the presentation layer, duplicating the `user` cache.

3. The eviction/capacity gap is already self-reported as "구현 필요" in the spec
   (§11) — it is known, not a surprise to the original author.

## Decision

- **Quota safety net (not full eviction).** Add a `QuotaExceededError` handler in
  `IndexedDBAdapter` (the level that actually runs on every platform, including
  desktop-web): on a write that overflows, emergency-evict the oldest chats
  (by `chatNo` / least-recently-active channel) and retry once. Add a startup
  sweep for the short-TTL non-chat types. This prevents the hard send/receive
  lock without a full eviction subsystem.
- **Author names come from the `user` cache, not a parallel store.** Let
  `useChannelMembers` read the local `user` cache cache-first **before** socket
  verification (a local read needs no socket), then refresh over the network once
  verified. Remove the `localStorage` author-name cache added as a stopgap — the
  `user` cache (IndexedDB, persisted, `{cid,uid}`-scoped) is the single source.
- **Defer full bounding.** A real `CapacityPolicy` (per-channel LRU cap) plus
  routing web/desktop-web through `DynamicCacheStorage` so the designed
  `EvictionStrategy` hooks run is the proper fix — but it changes the caching path
  for every browser client (web/admin/landing) off the shared engine, so it is
  deferred to its own scoped effort.

## Considered Options

- **Full bounded cache now** (per-channel LRU + web via DynamicCacheStorage) —
  rejected for blast radius across the shared engine and time; this is the
  deferred follow-up.
- **Do nothing** — rejected: a messaging app that bricks on quota is not
  acceptable even if rare.
- **Denormalize the author name onto each cached chat** — rejected: the `user`
  cache already holds names; denormalizing duplicates state and needs an engine
  change. (The existing `upsertMany` merge that preserves `owner$` stays.)

## Consequences

- The app no longer hard-locks on `QuotaExceededError`, but the chat cache still
  grows between quota events — memory/disk use is not yet bounded. The follow-up
  (per-channel cap) is owed.
- Author name resolution has a single source (the `user` cache); the presentation
  layer stops carrying a parallel cache. Known authors resolve instantly on
  relaunch from IndexedDB; genuinely unresolved authors show a skeleton, then
  "Unknown" only once settled.
- The safety net lives in `IndexedDBAdapter` rather than the `EvictionStrategy`
  abstraction, so when the deferred full-bounding lands it should migrate the
  emergency logic into a real `EvictionStrategy` and route web through
  `DynamicCacheStorage`.
