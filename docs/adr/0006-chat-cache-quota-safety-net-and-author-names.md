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

## Update — full bounding landed, and did NOT take the migration this ADR planned

Per-channel bounding shipped on `feature/louis-improve-desktop`
(`IndexedDbOnlyCacheStorageStrategy` gets a limit, `IndexedDBAdapter` enforces it via
`findNewestKeyBeyond` over `CHAT_PAGINATION_INDEX`). The last bullet above says that
should have migrated into a real `EvictionStrategy` with browser clients routed through
`DynamicCacheStorage`. **It did neither, deliberately** — this note supersedes that
bullet so the next reader does not plan a migration that has been decided against.

Why the planned migration was not the fix:

- **There is no working abstraction to migrate into.** `EvictionStrategy` and
  `CapacityPolicy` have exactly one implementation each repo-wide, and both are inert:
  `DefaultEvictionStrategy`'s three hooks are no-ops and `DefaultCapacityPolicy.getLimit()`
  returns `null` (`libs/data/src/data/local/storages/defaultPolicies.ts`). Worse, nothing
  reaches them: they live inside `HotColdCacheStorageStrategy`, and `localFactory` no longer
  constructs it on any path — native goes to `NativeDbOnlyCacheStorageStrategy` and everything
  else to `IndexedDbOnlyCacheStorageStrategy`, neither of which wraps `DynamicCacheStorage`.
  It is empty scaffolding, not a designed mechanism being bypassed.
- **`IndexedDBAdapter` is the home the cap can actually reach.** It is what
  `IndexedDbOnlyCacheStorageStrategy` builds, which is every non-native client. The native path
  now stores through `NativeDBAdapter` alone and has no IndexedDB tier at all, so a cap that
  lived inside `DynamicCacheStorage` would reach _neither_ path.
- **The blast radius this ADR already rejected has not changed.** Routing browser clients
  through `DynamicCacheStorage` also changes their read-policy resolution and adds the
  stampede guard for every one of them — the same reason "Full bounded cache now" was
  rejected under Considered Options.

Two facts the bounding work established that this ADR did not anticipate:

- **`IndexedDbOnlyCacheStorageStrategy` is not a desktop path.** `localFactory.selectStrategy`
  routes every client without `window.ReactNativeWebView` to it — `apps/web` opened in a
  browser and `apps/admin-v2` included. A capacity constant placed there silently truncates
  their scrollback. The limit is therefore injected by the app that owns the policy
  (`setChatCacheLimit`, called from `apps/desktop-web`'s entry); unset stays unbounded.
- **The quota safety net is gated on a limit being configured.** With no limit, eviction has
  nothing to evict, so retrying the write would meet the same full store — the gate does not
  remove a net that would otherwise work. The net promised "on every platform" by the
  Decision above has in fact never existed on the native path, which stores through
  `NativeDBAdapter` alone and so never reaches the eviction hooks at all. That gap is unchanged
  by this work and remains owed.
