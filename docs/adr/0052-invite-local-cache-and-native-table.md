# ADR-0052: Invite List Local Cache — a New Native Table and Credential Separation

> Status: Accepted · Decided: 2026-08-13
> · The first real use of the deploy-skew gate created by [ADR-0051](0051-cache-storage-routing-simplification.md)
> · Absorbs the local cancel record from [ADR-0043](0043-relay-invite-cancel-reject-adoption.md) into the cache

## Context

`invite.list` is **in-memory only** today. It is only the react-query cache (`staleTime: 0`) and never
lands in the local DB, so on every cold boot the list is empty until the relay handshake finishes, and
offline it shows nothing at all. Channels and messages already treat local storage as their primary
source, so invite is the exception
([relay-invite-sender.md](../../apps/web/docs/feature/invite/relay-invite-sender.md)'s "items to
redesign").

`invite` is the **first `CacheType` ever added** in this repo, so several constraints stack up.

- **The web deploys before the app.** Sending the new type straight to native means the old app's
  `CacheCrudService` `default:` branch answers `success: true` + `null` — a **permanently empty
  cache**.
- **`code` is a credential, not an identifier.** The current rule is that it never leaves anywhere
  except the deep-link body, yet `MyInviteView` carries not just `code` but a **`deeplink` that
  embeds the whole code as `?code=<code>`.**
- **The cache can never be authoritative.** Accept and reject happen on someone else's device, and
  there is no notification packet for them.
- **Deletion is ambiguous.** A row pushed out of the `limit: 100` window and a row that was actually
  deleted server-side look identical in the response.
- **The local cancel record lives in a separate store.** `usePreferenceStore.canceledInviteIds`
  (localStorage) holds both reject-row dismissals and legacy cancel stamps, so the source of truth for
  invite state is split in two.

### This track is the first real use of the deploy-skew gate

The gate ADR-0051 built (the bridge handshake reports the app's storable types and schema version →
the web picks a storage backend accordingly) had, until now, **only ever been tested with a
hypothetical future type**. `invite` is the first real type to actually run that machine.

## Decision

### 1. Build the native table and schema migration first

Add a migration that opens an `invites` table (bumping `TARGET_VERSION` along with it), using the same
`(cid, uid, id, data)` schema as other domains, plus an `InviteDataSource`. Register `invite` in
`SUPPORTED_CACHE_TYPES` so the app reports it through the handshake.

**Do not add it to `LEGACY_NATIVE_CACHE_TYPES`.** That set is a frozen list of types every already-shipped
app can store, and `invite` does not qualify by definition. As a result, on old apps
`resolveCacheBackend('invite')` answers `'web'` and goes to IndexedDB, and once the app updates and
starts reporting, it moves to native — skew is absorbed without declaring a separate gate.

Also skip `MIN_SCHEMA_VERSION_BY_TYPE`. It uses the standard blob schema, so the web never depends on
columns or indexes that native has to materialize.

### 2. Strip the credential out of the type

Define the cache view `CacheInviteView` as `MyInviteView` with **both `code` and `deeplink` excluded.**
Do not rely on stripping them at runtime — one spread brings them back to life, and there is precedent:
a `{...query}` spread on the chat path once let a field that was not in any key leak all the way down
to storage.

Actions that need the code (reinvite, cancel) **re-fetch it from the server**, even on a cache hit.

### 3. The cache is for instant render and always revalidates

Limit this to stale-while-revalidate. Read the cache first and render it, then always fire
`invite.list` and refresh with the result. Never build a path that judges state from the cache value
alone.

> **Addendum (2026-08-18) — the `list` mirror is not the only place that writes to the cache.** This
> decision only named the revalidation (`list`) path, and the implementation mirrored only that. As a
> result the cache **trailed its own device's actions by one round trip**: an invite just issued was
> missing locally until the next `list` ran, leaving cold-boot and offline waiting screens empty, and
> an invite just canceled still claimed `pending` in the cache for that same window. So **every server
> response about an invite I own is now mirrored** — `list` + `create` + `cancel`. Decisions 2 and 3
> are unchanged: the same allowlist mapping (excluding `code`/`deeplink`) and the same cid gate apply,
> and `list` still fires every time. `accept`/`reject` are **not mirrored** — they are recipient
> commands, and the recipient's `invite.list` does not return that row, so putting it in the cache
> would create an orphan row nobody ever reads again.

### 4. Deletion is "inside the window = authoritative, outside the window = preserved"

Within the range the response covers (the `limit` window), the response is authoritative — cache rows
in that range are overwritten by the response. Rows outside the window are **preserved.** Zombie rows
can remain, but that beats an old invite that got pushed out of the window silently disappearing.
Revisit once cursor paging exists.

### 5. Absorb the local cancel record into the cache

Drop `canceledInviteIds` (localStorage) and move the dismiss state onto **a field on the cache row.**
The source of truth for invite state drops to one, and the list filter no longer has to compose two
stores.

Move existing records with a **one-time migration.** `useCanceledInviteReconcile` (the hook that emits
legacy cancel stamps as real `invite.cancel` calls) keeps its role, since that role still matters, but
switches the source it reads from to the cache.

### 6. Cache scope keeps the default `(cid, uid)`

Invite rows only render when `isDefaultCloud`
([HomePage.tsx](../../apps/web/src/app/features/home/pages/HomePage.tsx)), so whenever the cache
matters the `cid` is always `default`, and cloud switching never causes the list to go empty.

However, **reads are not gated** — `invite.list` still runs even while a cloud is active. Writing to
the cache then would pile up orphan rows in that cloud partition, so **writes also happen only when
`default`.** Using `contextOverride` to change the physical partition is not an option (the read path
ignores the override).

### Scope

**In** — adding `invite` to `CacheType` and its accompanying type map, TTL, and storage bundle; the
native table, migration, `InviteDataSource`, `SUPPORTED_CACHE_TYPES`, and bridge payload; the web
`InviteLocalDataSource` and repository wiring; absorbing the local cancel record and its migration.

**Out** — cursor paging (the real fix for the out-of-window ambiguity), push notifications for invite
state (backend request #4), exposing the `invite` cache to global search.

## Alternatives

- **Add `invite` to `LEGACY_NATIVE_CACHE_TYPES`** — sends it to native even from old apps, making it
  durable immediately. This falsifies that set's meaning ("every already-shipped app can store it")
  and creates a permanently empty cache on old apps. Rejected.
- **Put `code` in the cache and hide it at the access layer** — reinvite and cancel finish without a
  server round trip. The fact that the credential sits on disk does not change, and a single bypass of
  the hiding layer collapses the whole protection. Rejected.
- **Replace the whole cache with the response** — no zombie rows, and simple. An invite pushed out of
  the window silently disappearing defeats the very point of "visible offline." Rejected.
- **Keep the local cancel record in localStorage** — smaller diff, easy to revert. The source of truth
  for invite state stays split in two, and the list filter keeps having to compose both stores — this
  work is exactly the opportunity to remove that duplication. Rejected.
- **Pin the invite cache to global scope** — matches how the invite gateway is pinned to relay
  (`invitecloud` does this). There is no real benefit since invite rows only render on the default
  cloud, and a global pin adds one more exception to the scope rule. Rejected.
- **Defer until after ADR-0036 (data layer refactor)** — the order the original document proposed. The
  native half must ship first regardless, so deferring only delays the web side's start, and the part
  layered on the gateway is just repository wiring — judged not costly enough to defer. Proceeding
  now.

## Consequences

**What is gained**

- The invite list is visible instantly on cold boot and offline — the same local-first read every
  other domain gets.
- Credentials never touching disk is **enforced by the type.**
- The source of truth for invite state drops to one (the cache). The list filter no longer composes
  two stores.
- ADR-0051's skew gate gets its first real-type verification — old apps get web storage, new apps get
  native.

**Trade-offs accepted**

- **A deploy-order constraint now exists.** Native (table, migration, reporting) has to ship first for
  the app to store invites durably. Until then it goes to web storage, and if the OS clears the
  WebView's IndexedDB the invite cache is lost (not a real loss, since the server re-fetch recovers
  it).
- **Zombie rows outside the window can remain.** Unresolved until cursor paging exists.
- **Reinvite and cancel keep a server round trip.** The cost of not putting the code in the cache.
- The local cancel record migration stays as one-time code — remove it once it has finished emitting.

## Open questions

- The name and shape of the dismiss field (boolean vs. timestamp), and whether dismiss should be kept
  or cleared when the server puts the same invite back to `pending`.
- The cache TTL value. Other domains use 30 minutes, and invite always revalidates since its state
  changes externally — still, it needs to be decided whether expiry judgment rests on the cache TTL or
  purely on the server `state`.

## Next steps

[[dev-2_implement]] Phase A: write the spec from this ADR (table schema, `CacheInviteView` definition,
migration steps, the ripple list from adding the type, the dismiss-field migration, the test matrix).
