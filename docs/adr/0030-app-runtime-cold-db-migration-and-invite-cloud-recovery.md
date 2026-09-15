# ADR-0030: Switch app-runtime to the cold DB, seed hot→cold, and recover invited clouds

> Status: Superseded (for the 2-tier decisions only) → [ADR-0051](0051-cache-storage-routing-simplification.md) · Decided: 2026-07-24

> **The body below is the record as of 2026-07-24 and is not rewritten.** What changed since:
>
> - **The means of decision 1 (enabling the cold DB) was reversed.** The plan was to turn on the
>   hot/cold 2-tier through `HotColdCacheStorageStrategy`, but three days later commit `796aa3cf`
>   (2026-07-27) moved native to **a single cold layer** — the 2-tier's cold-first write gate and its
>   missing cold-miss→hot fallback surfaced as channel and chat load failures. That switch left no ADR,
>   and [ADR-0051](0051-cache-storage-routing-simplification.md) recorded the reality and deleted the
>   dead 2-tier machinery. **The purpose itself — cold (SQLite) as native's source of truth — still
>   holds.**
> - **Decision 3's "hot loss self-heals" reasoning no longer applies.** `DynamicCacheStorage`'s hot
>   miss → cold fallback → hot backfill machinery is gone. But on native an invited cloud is now stored
>   only in cold, so the failure mode "it disappeared from hot" no longer exists, and the conclusion (one
>   source in the cache DB, durable cold) stands.
> - **Decision 2 (the one-time invitecloud hot→cold seeding) is still alive.** It has been renamed into
>   web→native vocabulary, where `createWebInviteCloudStorage` and `invitedCloudDurability` play that
>   role (the localStorage key for the completion flag is frozen under its old name so it cannot run
>   twice).
>
> How storage routing actually behaves now:
> [cache-storage-routing.md](../../libs/app-runtime/docs/data/cache-storage-routing.md)

## Context

`libs/app-runtime` has already built and tested the hot/cold 2-tier cache machinery
(`DynamicCacheStorage`: cold = the source of truth, hot = a derived cache), but `selectStrategy()` in
`factories/localFactory.ts` hard-returns `IndexedDbOnlyCacheStorageStrategy` in every environment, so
the cold (native SQLite) layer is dormant. A TODO comment says Hot+Cold is disabled "until the native
caching domains are registered on the bridge". The mobile side (cold) is ready: `dou.sqlite` (migration
v9), `useCrudCacheHandler`, the per-domain `*DataSource`s and the bridge message handlers are all wired
up.

Turning the cold DB on for real involves three intertwined requirements.

1. **Enable the cold DB** — have app-runtime use cold (SQLite) on native.
2. **Sync the caches already deployed** — for users already on a release, all cached data lives only in
   hot (IndexedDB) and cold (SQLite) is empty. Cold becomes the source of truth, and the cold-first read
   paths (`join`, the cursor-based `chat`) have no reverse backfill, so read state (readNo), unread
   counts and history can break right after the switch.
3. **Recover invited clouds** — an invited cloud (`cloudType: 'invited'`) is a local-only entity absent
   from every sync and list API. It is written to the local cache only at invite-accept, and the server
   has no endpoint that enumerates them. In practice "the invited cloud sometimes disappears from the hot
   cache" is observed, and a push can arrive at exactly that moment. Backend changes are out of scope
   here (front end only).

The related findings, in brief:

- Writes are cold-first, then hot fire-and-forget. Reads are hot-first (except `join`, which is
  cold-first, and the cursor `loadAll`, which forces cold-first). A hot miss falls back to cold and
  backfills hot, but **the reverse (a cold miss falling back to hot) does not exist.**
- The only place an invited cloud's `id` / `name` / `backend` / `wss` is written is invite-accept's
  `cloud.cacheWrite` (the cache DB), so it disappears when the cache empties.
- A push payload carries no `backend` or `wss`, and its `cid` is usually an empty string on the deployed
  backend.
- But `issueCloudDelegationToken(cloudId)` (relay, an existing endpoint) reissues that cloud's
  `backend` / `wss` / `cid` from the `cloudId` alone — callable from the front end with no backend
  change.
- `localStorage` is a completely separate store from the cache DB and survives a cache clear. The
  `chatic-invited-clouds` (`CLOUD_INVITED_BUNDLES_KEY`) key is defined but only ever cleared — a dead
  key with no writer.

## Decision

**Target platform: mobile (the native WebView) only.** The cold DB exists only where the native bridge
does, so web and desktop-web keep `IndexedDbOnlyCacheStorageStrategy`. The hot/cold 2-tier structure
stays as designed (hot = derived cache, cold = source of truth).

### 1. Enable the cold DB

Make `selectStrategy()` return `HotColdCacheStorageStrategy` in a native environment (`isNativeApp()`).
The native caching domains are already registered on the bridge, so the TODO's precondition is met.

### 2. Seed hot→cold (the migration)

**On the first boot, seed only the `invitecloud` type from hot (IndexedDB) to cold (SQLite).** Stamp a
completion flag in localStorage so it cannot run again. The other types (channel, user, join, site,
profile, meta, chat) are **not seeded** — server rehydration plus cold-first writes fill cold naturally
during normal use. Invited clouds are the only local-only data with nowhere on the server to ask again,
so they are the one case that needs an explicit move.

- Right after the switch, the cold-first reads (`join` readNo, cursor `chat`) are restored by a server
  resync, and a brief gap in unread counts and history in the meantime is accepted.

### 3. Recover invited clouds (front end only, one source: the cache DB)

**The cache DB (cold plus hot) is the only source for invited clouds.** No separate durable store
alongside it (a localStorage registry, for example) — two sources can diverge and tangle the data, so
that is deliberately excluded.

- **Hot loss self-heals**: the ordinary case where hot loses what cold has needs no code of its own —
  `DynamicCacheStorage`'s hot miss → cold fallback → hot backfill recovers it. Keeping invited clouds in
  durable cold is itself the fix for "it disappeared from hot".
- **A push safety net (best effort)**: when a push's `cid` is valid (parsing the nested `payload` too)
  and the cloud is not in the cache, rebuild the endpoints through
  `issueCloudDelegationToken(cid)`.
- **Name sync**: once the invited cloud's socket is verified, fetch the authoritative name with
  `cloud.get` and update it (a delegation token carries no name).

**Out of scope (follow-up):** a complete reset where both cold and hot are empty (a reinstall or a full
cache wipe) together with a push that has no `cid` cannot be recovered by the front end, because there is
no way to know which cloud it was. That is the consequence of choosing not to keep a separate durable
store. It needs backend support — a `cid` (or `backend` / `wss`) in the push payload, or a new invited
cloud enumeration API (`GET /clouds/0/list?view=invited`).

## Alternatives

- **Seed every type** — copy all eight types over the bridge on the first boot. Cold becomes a complete
  source of truth immediately, but a user with a lot of `chat` (effectively permanent TTL) faces a much
  slower first boot. Everything but invited clouds can be replaced by server rehydration, so not adopted.
- **A lazy reverse backfill** — add a "cold miss → hot fallback → cold backfill" path to
  `DynamicCacheStorage`. Zero boot cost and graceful natural recovery for join and chat, but it adds an
  exception to the "cold = source of truth" invariant, so not adopted. The server resync handles it
  instead.
- **Fill cold from a server resync and ignore hot** — simplest, but invited clouds have no server origin,
  so this could never recover them. That is why they cannot be left out of the migration.
- **A localStorage invited-cloud registry (a separate durable store)** — keep invited cloud ids
  permanently outside the cache DB so even a complete reset recovers at boot. Adopted at first, then
  **withdrawn**: a **second source** alongside the cache DB can diverge and tangle the data (the
  single-source principle). Recovery from a complete reset is left to the backend follow-up.
- **A backend change (a `backend` / `wss` in the push, or a `view=invited` API)** — it would solve even
  total loss cleanly, but the backend is out of scope here, so it is recorded as follow-up only.

## Consequences

**What is gained**

- On mobile, cold (SQLite) acts as the source of truth and hot (IndexedDB) self-heals as a derived
  cache.
- The observed "the invited cloud disappears from the hot cache" problem is resolved by durable cold
  storage plus the hot miss → cold fallback.
- When a push's `cid` is valid, an invited cloud can be recovered by reissuing through relay. The name
  is filled in on connection through `cloud.get`.
- The migration burden is minimal — a handful of invited cloud rows copied on the first boot.
- With the cache DB as the only source for invited clouds, there is no divergence to worry about.

**Trade-offs and risks accepted**

- Right after the switch, until the first server resync, the cold-first paths (`join` readNo, cursor
  `chat`) can be briefly empty or inaccurate.
- A complete reset (cold and hot both lost) plus an empty push cid cannot be recovered by the front end
  — it depends on the backend follow-up (the price of the single-source choice).
- Web and desktop-web stay IndexedDB-only, so a per-platform cache strategy branch lives on in the code.
