# ADR-0053: Redesign the Cache Deploy-Skew Gate as Per-Domain Contract Versions

> Status: Accepted · Decided: 2026-08-14
> · Replaces the judgment criteria of the skew gate created by [ADR-0051](0051-cache-storage-routing-simplification.md)
> · Replaces the `createWebInviteCloudStorage` retention from [ADR-0051](0051-cache-storage-routing-simplification.md) Decision 1
> · A follow-up after [ADR-0052](0052-invite-local-cache-and-native-table.md) first ran that gate for real
> · Reclaims the web→native migration bridge from [ADR-0030](0030-app-runtime-cold-db-migration-and-invite-cloud-recovery.md)

## Context

ADR-0051 gathered "where does this cache type get stored" into one place,
[cacheStorageRouting.ts](../../libs/app-runtime/src/data/cacheStorageRouting.ts), and
[nativeCacheSupport.ts](../../libs/app-runtime/src/data/nativeCacheSupport.ts) owns the deploy-skew
gate, one axis of that judgment. The gate today is **a combination of three different mechanisms**:

- **`LEGACY_NATIVE_CACHE_TYPES`** — a frozen set of 8 types that every already-shipped app can store.
  Checked before the report, so even apps that never report (old versions) get these types on native.
- **`supportedCacheTypes`** — the **name list** the app sends in the handshake
  ([CacheCrudService.ts](../../apps/mobile/src/app/services/cache/CacheCrudService.ts)'s
  `SUPPORTED_CACHE_TYPES`). A type not in the legacy set is only turned on through this list.
- **`cacheSchemaVersion` + `MIN_SCHEMA_VERSION_BY_TYPE`** — the **global** SQLite `PRAGMA user_version`
  target the app sends, and the per-type floor the web requires against that global value.

### The trigger — the on → off → on question

This started from the question: "if a domain (say `profile`) is disabled as a cache type and
reintroduced in a later version, won't a user still on the first version see the newest web decide
it's 'usable' and go ahead anyway?" Investigation confirmed the scenario is real, and the cause is not
an isolated bug but the structure of the judgment criteria itself.

### Flaw 1 — `supportedCacheTypes` is a switch pointed at the future, not the past

A v1 app is already in a user's hands and will say "I support `profile`" forever, no matter how the
list changes in v2. Yet the usual reason to disable a domain is that **v1's own native storage logic
is wrong** — a target the app's own list can never reach by construction.

Removing it from the list does the opposite of what was intended. For the legacy 8, the web never
even sees the report, so the off signal never gets delivered, and apps caught in between fall into
`CacheCrudService`'s `default:` branch, answering `success: true` + `null` — a **permanent empty
cache** with no error. For non-legacy types the off does actually take effect, but on reintroduction
v1 and v3 send the identical string `'profile'`, so the web cannot tell them apart.

### Flaw 2 — the judgment criterion is a global counter, so it carries no domain-specific meaning

In `MIN_SCHEMA_VERSION_BY_TYPE['profile'] = 12`, the 12 has nothing to do with profile. It may have
been bumped by some other domain's migration entirely. Since `TARGET_VERSION` is
`Math.max(...Object.keys(MIGRATIONS)) + 1`
([schema.ts:293](../../apps/mobile/src/app/database/sqlite/schema.ts)), an unrelated change pushes up
every domain's floor together.

A derived symptom: to exclude only old-version apps without any schema change, you have to add a
**no-op migration just to bump the number.** You end up touching the physical DB just to install a
gate.

### Flaw 3 — a physical-DB concept is used to negotiate a logical contract

`cacheSchemaVersion` is literally `PRAGMA user_version`. But what actually needs asking is "does this
app treat profile the way the web expects it to" — a **contract**, a different layer entirely. This
confusion is also the root of the next flaw.

### Flaw 4 — the app's report is not honest

[useBaseBridge.ts:27](../../apps/mobile/src/app/webview/hooks/useBaseBridge.ts) sends a compile-time
constant:

```ts
cacheSchemaVersion: TARGET_VERSION,
```

Meanwhile [SqliteDatabase.ts](../../apps/mobile/src/app/database/sqlite/SqliteDatabase.ts)'s
`initTables` swallows failures in a `catch`, and the real `user_version` never leaves that function.
In other words, even if a migration fails, the app reports **the version it intended, not the version
it reached.** This does not show up today because migrations are all `CREATE TABLE IF NOT EXISTS`, but
it is a latent lie as long as the gate trusts this value.

### Flaw 5 — the gate does not assume its failure mode differs by domain

The current code treats the gate's misjudgment as safe — _"an early read is never WRONG, only
conservative."_ If the gate is wrong, it only falls back to web storage instead of native, and the
domain refills from a server resync. **This premise is false for exactly one type: `invitecloud`.**

`invitecloud` has no server list API, making it **the one type where the cache itself is
authoritative**
([invitedCloudDurability.ts:56](../../libs/app-runtime/src/data/invitedCloudDurability.ts) —
_"the only local-only cache type (no server list API)"_). Moving its storage does not leave rows
unfilled — it makes them **vanish.** The one recovery path is
`issueCloudDelegationToken(cloudId)`, but that `cloudId` lived inside the row that was lost, and
`recoverInvitedCloudIfMissing` only runs reactively when a push names that cid — it cannot revive the
list.

That is why the web→native transition needed a separate, one-time migration bridge,
`migrateInvitedCloudsIntoNativeStore`. In other words, for this domain a storage move is not an event
the gate can absorb on its own — it presupposes a separate task that carries the data across.

Without this axis, version policy ends up domain-agnostic, and casually raising `invitecloud`'s floor
silently wipes out old users' invite clouds.

### The migration bridge has been running three weeks and it is time to reclaim it

The seed flag (`chatic-invitecloud-cold-seeded`) first landed in `1ea458a1` (2026-07-24), and this
migration lives in the **web bundle**, not the app binary — it runs the moment a user opens the app
once, independent of app-store updates. Three weeks in, the active-user tail is judged effectively
exhausted.

### Now is the cheapest time to change this

`MIN_SCHEMA_VERSION_BY_TYPE` is **still empty.** There is zero precedent of a version gate ever having
been set in production, so there is nothing existing to migrate. With ADR-0052 having just added
`invite`, and more domains due to follow, changing the baseline now is the cheapest it will ever be.

## Decision

### 1. The app reports per-domain contract versions

Add an optional field to the handshake payload
([system.ts](../../libs/app-messages/src/types/model/system.ts)'s `OnWebAppReadyPayload`):

```ts
// libs/app-messages — only the type is shared. Each side declares its own value.
export type CacheDomainVersions = Partial<Record<CacheType, number>>;

cacheDomainVersions?: CacheDomainVersions;
```

The app declares the version it has **implemented**; the web declares the version it **requires**.
Neither side imports the same constant — sharing values would turn this from a negotiation into
nothing.

### 2. Fold the three mechanisms into one comparison

The app's version number is read as the **max of three sources.** This absorbs the `supportedCacheTypes`
list and the frozen set into the contract version map, and the global `cacheSchemaVersion` judgment
disappears.

```ts
// The frozen 8 are guaranteed version 1. An old app that only reports names is also read as version 1.
const legacyVersion = (type: CacheType) => (LEGACY_NATIVE_CACHE_TYPES.has(type) ? 1 : 0);
const reportedByName = (type: CacheType) => (support?.types.has(type) ? 1 : 0);

const appVersion = (type: CacheType) =>
    Math.max(support?.domainVersions[type] ?? 0, reportedByName(type), legacyVersion(type));

export const isNativeCacheTypeUsable = (type: CacheType): boolean =>
    appVersion(type) >= (REQUIRED_DOMAIN_VERSION[type] ?? 1);
```

**`reportedByName` makes the transition harmless.** Because the web deploys before the app, most apps
a new web meets have not yet sent `cacheDomainVersions` and only send `supportedCacheTypes`. If only
the new field were read, those apps' `invite` would drop to version 0 and a domain already writing
happily to native would get pushed back to web storage — a pure regression. Converting a name-only
report to version 1 means routing does not change by even one case at the moment of transition.

`LEGACY_NATIVE_CACHE_TYPES` also **stays, and its meaning does not change** — it is not the default
for a missing report, it is a **floor.** The guarantee the current code gets from checking the legacy
set before the report,

> The report can only ever ADD types, never take one away.

is preserved as-is by `Math.max`. Even if a wiring bug or a truncated payload drops a domain from the
app's report, the legacy 8 are never pushed off native. As flaw 5 shows, if this guarantee breaks for
`invitecloud`, a single accidental missing report leads straight to losing the invite cloud.

**Every domain starts at version 1.** The version number answers "which edition of this domain's
contract is this," not when the domain was added or what the global schema number is. `invite` is the
most recently added domain, but its contract has never changed even once, so it is version 1. Version
2 only shows up once the contract actually changes and old-version apps genuinely need to be excluded.

### 3. Exclude locally-authoritative domains from the gate

A floor blocks **accidental** non-reporting but not an **intentional** floor raise (floor 1 with
required 2 still gets pushed off). Name domains where server reconstruction is impossible separately,
and forbid setting a floor on them at all.

```ts
// Domains with no server list API, where the cache itself is authoritative. Moving storage makes
// data disappear and a server resync cannot recover it — never route these through the gate.
const LOCAL_AUTHORITY_CACHE_TYPES: ReadonlySet<CacheType> = new Set(['invitecloud']);
```

`invitecloud`'s version is **pinned at 1 and never raised.** A test pins that no domain in this set
ever appears in `REQUIRED_DOMAIN_VERSION`.

The domain classification is as follows.

| Category               | Domains                                                       | If the gate misjudges                 | Version policy            |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------- | ------------------------- |
| Server-reconstructible | channel · chat · user · join · site · profile · meta · invite | Durability drops, recovers via resync | Can be raised             |
| Locally authoritative  | **invitecloud**                                               | **Lost, unrecoverable**               | Pinned at 1, never raised |

`invite` sits on the top row because ADR-0052 fixed it as stale-while-revalidate, so `invite.list`
always revalidates. `meta` is a sync cursor, so losing it costs only one full resync.

### 4. Moving storage for a locally-authoritative domain requires a migration bridge as a precondition

Even so, if it must move, a one-time migration bridge like `migrateInvitedCloudsIntoNativeStore` is a
**precondition**, not a follow-up fix. A change that flips routing without a bridge is forbidden for
domains in this set.

### 5. Remove the web→native migration bridge

As noted in Context, this is reclaimed on the judgment that three weeks in the web bundle has
exhausted the active-user tail.

**Removed** — `migrateInvitedCloudsIntoNativeStore`, `useInvitedCloudMigration`, `SEED_FLAG_KEY` and
`hasSeeded`/`markSeeded`
([invitedCloudDurability.ts](../../libs/app-runtime/src/data/invitedCloudDurability.ts)) ·
`createWebInviteCloudStorage`
([localFactory.ts:70](../../libs/app-runtime/src/data/factories/localFactory.ts) — since its only
consumer disappears, ADR-0051 Decision 1's "keep it" is reversed here) · the barrel export
([index.ts:59](../../libs/app-runtime/src/index.ts)) · the call site
([InvitedCloudDurabilityRunner.tsx:28](../../apps/web/src/app/runtime/InvitedCloudDurabilityRunner.tsx)) ·
the corresponding describe block in `invitedCloudDurability.test.ts` and the export list in
`public-surface.test.ts`.

**Kept** — `recoverInvitedCloudIfMissing`, `syncInvitedCloudName`, `useInvitedCloudNameSync`. These are
not migrations but ongoing recovery/sync, and `recoverInvitedCloudIfMissing` in particular grows in
importance as the **only safety net** left once the bridge is pulled up.

The localStorage value `chatic-invitecloud-cold-seeded` remains but is harmless since no code reads it
any more. No separate cleanup is done — cleanup code would just be new one-time code.

As a result of this removal, **the web↔native migration bridge no longer exists.** The bridge Decision
4 requires will have to be written fresh going forward.

### 6. Define what a version number means — raising it means staying compatible with the old web

Since the comparison is one-directional (`>=`), "this version or later" can be expressed but "not too
new" cannot. Given the web deploys ahead of the app, it is rare for the app to be newer (it can happen
on a web rollback), and rather than enforce this mechanically, it is fixed as a discipline:

> **A change that raises the version number must stay compatible with the old web.** A change that
> breaks the old web is not a version bump — it is a new `CacheType`.

### 7. Treat `SUPPORTED_CACHE_TYPES` (and its successor, the app-side version map) as append-only

Removing an existing domain from the app's list is forbidden. If a domain needs to be excluded, do it
only through a **web-side lever** (except that Decision 3's locally-authoritative domains cannot be
excluded through either lever):

- **Normal path** — raise `REQUIRED_DOMAIN_VERSION[type]` to draw the floor. It only increases
  monotonically, so there is nothing to undo, and the on→off→on concept does not exist here at all.
- **Emergency path** — `WEB_PINNED_CACHE_TYPES`. Turns a type off everywhere immediately with only a
  web deploy, when an app release cannot be waited for. `profile` actually used this path during the
  native writer's uid-overwrite bug, and it was dropped once the fixed app shipped. Keep it only as a
  stopgap (it downgrades native durability to IndexedDB).

### 8. Make the app's report measurement-based

The domain version is derived **from actual DB state after the migration has succeeded** — never a
re-exported compile-time constant. Splitting by domain actually makes measuring easier, since the
judgment unit is a table.

`cacheSchemaVersion` keeps being sent (it has debugging/logging value) but **is not read for the
routing judgment.**

### 9. Backward compatibility — cover both directions

**Old web + new app** — a cached old web bundle still reads `supportedCacheTypes`/`cacheSchemaVersion`,
so the app keeps sending all three fields. Removing the old fields is a separate item.

**New web + old app** — the far more common pairing given the web-first-deploy structure, handled by
Decision 2's `reportedByName`. Converting a name-only report to version 1 means routing does not
change at the moment of transition. This no-change is pinned by a test — the full matrix of type ×
report shape must produce the same `resolveCacheBackend` result before and after the transition.

### Scope

**In** — the `CacheDomainVersions` type and handshake field, `AppBridgeHost` wiring, the app-side
domain version map and its measurement-based derivation, the web's `REQUIRED_DOMAIN_VERSION` and the
rewritten `isNativeCacheTypeUsable` (keeping the floor's meaning), introducing
`LOCAL_AUTHORITY_CACHE_TYPES` and a test pinning that its domains are never gated, removing
`MIN_SCHEMA_VERSION_BY_TYPE`, removing the web→native migration bridge (Decision 5's list), updating
the routing table tests, updating
[cache-storage-routing.md](../../libs/app-runtime/docs/data/cache-storage-routing.md) and
`libs/app-runtime/docs/data/invite-cloud-durability.md`.

**Out** — removing the `supportedCacheTypes`/`cacheSchemaVersion` fields (after the backward-compat
window ends), whether `WEB_PINNED_CACHE_TYPES` survives, recovery strategy for SQLite migration
failure itself (only report honesty is covered here), a server list API for `invitecloud` (were one to
exist, the whole local-authority classification would dissolve, but that is backend work), merging with
the ADR-0036 data layer refactor.

## Alternatives

- **Keep the status quo — `MIN_SCHEMA_VERSION_BY_TYPE` is enough** — the routing **outcome** is
  identical. It is already per-domain judgment, and drawing a floor can exclude old-version apps. But
  the threshold value is global and carries no meaning, the no-op-migration trick remains, and the
  contract stays tied to the physical DB version. Now, while the map is empty, is the cheapest time to
  move — waiting only raises the migration cost. Rejected.
- **Turn a domain off by removing it from `SUPPORTED_CACHE_TYPES`** — the approach that triggered this
  ADR. It cannot reach past apps, it is void for legacy types, and it creates a permanently empty
  cache for in-between versions. Rejected.
- **Adopt `WEB_PINNED_CACHE_TYPES` on/off as the normal path** — a web-only deploy takes effect
  instantly with zero app skew. But it also turns off newer versions along with old ones and gives up
  native durability, and being a boolean state leaves the reintroduction distinguishing problem intact.
  **Adopted only partially, as the emergency kill switch.**
- **Report a min/max range per domain** — mechanically closes the gap left by one-directional `>=`.
  Over-engineered at the current scale; the discipline in Decision 6 achieves the same effect.
  Rejected.
- **Keep the version number as a shared constant in `libs/app-messages`** — no drift. But if both sides
  see the same value there is no negotiation left (the app must state what it implemented, the web
  what it requires). Only the type is shared. Rejected.
- **Give up on reusing names (`profile` → `profile2`)** — simplest, least room for error. But the
  `CacheType` union accumulates tombstones, and data migration stays one-time code per domain. Version
  numbers achieve the same effect, so rejected (though per Decision 6, this path is still the right
  answer for a change that **breaks the old web**).
- **Treat `LEGACY_NATIVE_CACHE_TYPES` as the default for non-reporting rather than a floor** — a single
  version number settles every judgment, the simplest possible rule. But a report would then be able
  to **lower** the legacy judgment, and a single wiring bug or truncated payload would send
  `invitecloud` to web storage and lose the invite cloud. It loses the guarantee the current code gets
  from checking legacy first. Rejected — this was the draft's original choice, later reversed.
- **Put `invitecloud` in the gate like every other domain** — no exception set, uniform rules. But the
  gate's failure mode for this domain alone is not "recoverable degradation" but "unrecoverable loss,"
  so uniformity itself is the risk. Rejected.
- **Keep the web→native migration bridge** — upkeep cost is close to zero (one effect plus one
  localStorage read), and it keeps rescuing the tail of users who haven't opened the app in three
  weeks. But dead, no-plan-to-revive code keeps alive `createWebInviteCloudStorage`, a routing-bypass
  path, and its existence blurs Decisions 3 and 4. Reclaimed on the judgment that the active-user tail
  is exhausted — the risk is left in the Consequences section.

## Consequences

**What is gained**

- The on→off→on state transition disappears. Only a monotonically increasing version number remains,
  eliminating the reintroduction risk at the root.
- Version numbers become self-describing — "profile contract v2," not "global ≥ 12." An unrelated
  domain's migration no longer pushes up the threshold.
- The gate mechanism drops from three to one. Adding a new cache type means one declaration point.
- No more no-op migrations needed just to install a gate — the logical contract is separated from the
  physical DB.
- The hole where the app lies on migration failure is closed at the same time (Decision 8).
- **`invitecloud`'s special status is written into the code.** Until now, "the cache is authoritative"
  was only implied by a comment and the bridge's existence, never reflected in gate policy.
  `LOCAL_AUTHORITY_CACHE_TYPES` and the classification table make that knowledge reviewable.
- Dead one-time code (the migration bridge) disappears along with the routing-bypass path it was
  holding onto (`createWebInviteCloudStorage`), restoring ADR-0051's single decision point: "storage is
  decided by `resolveCacheBackend`."

**Trade-offs accepted**

- The handshake field grows to three for a while (two old + one new) — duplication for the backward-
  compat window.
- The app side now faces a "raise the version or not" judgment on every change. Today it only had to
  add a name to a list. Decision 6's discipline is enforced only by documentation and review, not by
  the type system.
- **Removing the migration bridge is a one-way move.** A user who has not opened the app in three
  weeks has their invite cloud sitting in IndexedDB, unread. Reviving the code would recover it, but
  once the OS clears WebView's IndexedDB, that is no longer possible — the durability gap is exactly
  why it was moved to native in the first place. Accepted on the basis of active-user exhaustion, but
  this judgment rests on elapsed time, not measurement.
- Once the bridge is pulled, `recoverInvitedCloudIfMissing` is the only safety net left. It is
  reactive — it only runs when a push names the cid — so it does not recover the list. This gap stays
  open until a server list API exists.
- Measurement-based derivation (Decision 8) can add a DB query to the boot-critical path — this breaks
  boot-optimization 4.4's current property that "handshake constants never open SQLite."

## Open questions

- **The concrete method and cost of measurement-based derivation.** Whether to check table existence
  (`PRAGMA table_info` or a `sqlite_master` query) on every boot, or memoize the `initTables` result
  for reuse. Tied directly to the last item in Trade-offs.
- **What to report on migration failure.** Drop only that domain to 0, or report the last successfully
  reached version.
- **Whether `WEB_PINNED_CACHE_TYPES` survives.** Decision 7 keeps it as the emergency path, but if a
  version floor can replace most of its uses, the case for keeping it weakens. This has to account for
  the fact that locally-authoritative domains cannot use this lever either (sending them to web storage
  is itself a loss).
- **Whether to back the migration-bridge removal with measurement.** The only basis right now is
  elapsed time (three weeks). One option is to log "found a row to migrate" once before removal and
  confirm it stays at zero — cheap with ADR-0097's unified logging. Whether to wait for confirmation or
  remove immediately is still open.
- **Whether a server list API could exist for `invitecloud`.** If it does, the whole local-authority
  classification dissolves and Decisions 3 and 4 become unnecessary. Needs backend confirmation.

## Next steps

[[dev-2_implement]] Phase A: write the spec from this ADR (handshake payload definition, where the
app-side version map lives and how it is measured, the rewritten `isNativeCacheTypeUsable` that keeps
the floor's meaning, introducing `LOCAL_AUTHORITY_CACHE_TYPES` and its gate-exclusion test, the
migration-bridge removal list and the resulting update to `invite-cloud-durability.md`, the test matrix
for domain × report presence × version combinations).
