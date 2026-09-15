# ADR-0051: Simplify the Cache Storage Strategy Layer into a Declarative Routing Table

> Status: Accepted · Decided: 2026-08-12
> · Replaces the 2-tier related decision in [ADR-0030](0030-app-runtime-cold-db-migration-and-invite-cloud-recovery.md)
> · Keeps the chat cap from [ADR-0006](0006-chat-cache-quota-safety-net-and-author-names.md) (only the
> injection path changes)

> **Follow-up (2026-08-13): Decision 4 has run its course and is gone.** Decision 4 below, and the
> "desktop-web is off limits" constraint behind it, were both resolved on 2026-08-13 when the user
> lifted the constraint for this work only. The `setChatCacheLimit` shim was **removed**, and
> desktop-web now calls `configureDataRuntime` directly. In the same change the signature was
> switched to the object form `configureDataRuntime({ repositories?, cache? })`, so each call site
> passes only the policy it needs (the calls are merged). In other words, the _immediate removal of
> `setChatCacheLimit` and migration of its call site_ — rejected under "Alternatives" — was adopted a
> day later, because the reason for rejecting it was an external constraint, not a technical
> judgment.

> **Naming note (2026-09-01):** the names this document uses — `*RemoteDataSource` ·
> `RemoteGatewayBundle` · `*DomainGateway` · `remoteFactory` · `remote/data-sources/` — are the
> **names as of the time**. The mapping after the socket axis moved to the `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> historical record, so the body of this document is left as written.

## Context

The cache storage assembly in `libs/app-runtime` is structurally out of step with the other
factories in the data layer (over-modularized). `remoteFactory` and `repositoryFactory` are
stateless, thin assembly functions, while only `localFactory` + `cacheStorageStrategies` carry the
following:

- **A dead 2-tier machine.** After native switched to Cold-only (NativeDB/SQLite) (commit `796aa3cf`,
  2026-07-27 — reverted because the 2-tier's cold-first write gate and the absence of a cold-miss →
  hot fallback showed up as channel and chat load failures; no ADR was left for that switch, and this
  ADR fills that gap too), nothing creates `HotColdCacheStorageStrategy`, `AppPolicyResolver`, or the
  hot-first/cold-first policy tables any more. Their libs/data counterparts —
  `DynamicCacheStorage`, `defaultPolicies`, `dynamicCacheTypes`, and the eviction/capacity subsystem —
  are dead code by extension too, since their only consumer is `cacheStorageStrategies.ts`.
- **Routing decisions scattered three ways.** The answer to "where does this type get stored" only
  emerges from the combination of ① `selectStrategy` (environment detection), ② `HOT_ONLY_CACHE_TYPES`
  (a pin on `profile` — a workaround for a uid-overwrite bug in the native Cold writer), and
  ③ `isNativeCacheTypeUsable` (the handshake gate, defending against web-first-deploy skew).
- **Three module-level mutable state slots plus a boot-order-dependent setter.** The `sharedStrategy`
  and `hotStrategy` memos, the `chatCacheLimit` memo, and `setChatCacheLimit` (which only works if
  called before the runtime mounts).

Premises and constraints:

- The uncommitted WIP **nativeCacheSupport handshake** (native reports which cache types and schema
  version it supports via `OnWebAppReady`) still lands as planned, and the new structure folds this
  gate in as one axis of the routing decision.
- **Behavior stays fully invariant.** Storage location, routing outcome, and boot migration paths must
  stay identical across every client (apps/web, admin-v2, desktop-web, mobile WebView).
- **desktop-web is off limits** (user directive). The only call site of `setChatCacheLimit` is
  `apps/desktop-web/src/main.tsx`, so this export cannot be removed right away.
- To avoid overlapping with the ADR-0036 (gateway retirement, repository promotion) data layer
  refactor, this ADR covers **only the cache storage family**.

## Decision

1. **Delete the dead 2-tier machine.**
    - app-runtime: retire `HotColdCacheStorageStrategy`, `AppPolicyResolver`, the hot/cold policy
      tables, and the `CacheStorageStrategy` interface-based strategy pattern itself.
    - libs/data: remove `DynamicCacheStorage`, `defaultPolicies`, `dynamicCacheTypes`, the
      eviction/capacity subsystem, and the related barrel exports.
    - `createWebInviteCloudStorage` (the web reader used for boot migration, formerly named
      `createHotInviteCloudStorage`) talks to `IndexedDBAdapter` directly and has nothing to do with
      the strategy layer, so it **stays**.
2. **Collapse storage routing into a single declarative table.** Introduce one `web | native`
   decision function/table per type that judges environment (`isNativeApp`) × handshake
   (`isNativeCacheTypeUsable`) × type pin (the `profile` hot pin) in one place, and document the
   reason for each pin/gate as a table entry. The read-policy concept (hot-first/cold-first) has lost
   its meaning now that the tier is gone, so it is retired rather than redesigned — the only policies
   left are **the routing table and the chat cap.**
3. **Rebuild localFactory as a stateless assembly function in the same shape as remoteFactory.** Inject
   the per-channel chat cap as an option at data-runtime assembly time. The shared `IndexedDBDatabase`
   instance is a physically shared resource, so it is called out explicitly as the one remaining piece
   of module state.
4. **Keep `setChatCacheLimit` as a deprecated compatibility shim.** It delegates internally to the new
   options path (it cannot be removed immediately because of the desktop-web-off-limits constraint).
   Remove the shim once desktop-web migrates to the new path.
5. **Verification focuses on proving behavior is unchanged.** In addition to the existing
   `localFactory.test` and `public-surface.test`, add a table test that pins the routing outcome for
   every combination of environment × type × handshake.

## Alternatives

- **Keep the strategy pattern, remove only the dead implementations** — the remaining strategy is
  effectively just two direct-to-adapter branches, so the abstraction only costs, it does not pay.
  Rejected.
- **Preserve the 2-tier code (relocate only)** — there is no plan to revive it, and git history can
  restore it if needed. Preserving it only keeps alive the confusion of "maybe we'll use it someday."
  Rejected.
- **Clean up app-runtime only, leave libs/data for later** — a subsystem with no consumer would stay
  in the barrel and keep misleading new contributors. Rejected.
- **Remove `setChatCacheLimit` immediately and migrate its call site** — conflicts with the
  desktop-web-off-limits constraint. Rejected.

## Consequences

**What is gained**

- The three data-layer factories converge on one shape (all stateless assembly functions).
- The answer to "where does this type get stored" comes from one place, and exceptions like the
  handshake gate and the `profile` pin become visible as table entries. Adding a new cache type means
  there is exactly one decision point to touch.
- libs/data's public surface shrinks, which reduces the burden of the ADR-0036 refactor.

**Trade-offs accepted**

- Reviving the 2-tier would require digging through git history (no such plan exists today).
- The deprecated shim (`setChatCacheLimit`) lingers until desktop-web migrates.
- The deletion is large enough to carry review burden — the deletion commit and the restructuring
  commit are shipped separately.

**Next steps**

- [[dev-2_implement]] Phase A: write the spec from this ADR (routing table shape, the deletion list,
  the test matrix).
