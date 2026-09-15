# cache storage routing

Two stores exist for a cached row. Inside a native shell there is the app's SQLite, reached over the
bridge, which survives the OS clearing WebView data. Everywhere else — and sometimes inside the shell
too — there is the WebView or browser's own IndexedDB. **One function decides which, for every type,
and nothing else may branch on it.**

```ts
export const resolveCacheBackend = (type: CacheType): CacheBackend => {
    if (!isNativeApp()) return 'web'; // 1. no shell, no other store to reach
    if (WEB_PINNED_CACHE_TYPES.has(type)) return 'web'; // 2. pinned, with a reason
    if (!isNativeCacheTypeUsable(type)) return 'web'; // 3. the shell cannot be trusted with it
    return 'native'; // 4. the durable one
};
```

[`localFactory.getCacheStorage`](../../src/data/factories/localFactory.ts) materializes that verdict
as an adapter and does nothing else: `web` builds an IndexedDB adapter (carrying the chat cap, which
the adapter ignores for other types), `native` builds the bridge adapter. Global cache search follows
the environment directly — on native it searches SQLite, because that is the source of truth and web
storage there holds only the exceptions.

## The pin table is empty, and it is a stopgap

`WEB_PINNED_CACHE_TYPES` has no entries today. `profile` was in it while the native writer stamped
the scope's `uid` over the profile _owner's_ `uid`, collapsing every member of a place onto one key so
a list read returned a single profile and everyone else lost their name and photo. The serializer was
fixed, that release shipped, and the entry came out — **an entry leaves this table when its reason
ships a fix.**

Pinning trades native durability for a store the OS can clear, so it only ever applies to data the
server can re-derive. That rules out the local-authority domain outright: sending those rows to web
storage is not a downgrade, it is a loss.

## Check 3: the web ships before the app

The web bundle deploys ahead of the installed app, so **the web can know a `CacheType` the app has
never heard of.** Writing one anyway is worse than an error: the native handler's `default:` arm
answers `success: true` with `null`, which reads as a cache that is simply always empty — forever, and
silently.

The negotiation that prevents it is a version per domain, declared independently on each side:

- **The app reports the editions it has actually implemented.** Measured, not intended: it reads the `user_version` its migrations actually reached and includes only the domains whose table exists at that version. Migrations run in a single transaction, so one failing step rolls everything back and the reached version alone determines which tables exist — no table-by-table query is needed.
- **The web declares the edition it requires**, in `REQUIRED_DOMAIN_VERSION`. Empty in production: unspecified means "edition 1 is enough".
- **The web compares.** `appVersion(type)` is the **maximum of three sources** — the reported domain version, 1 if the type was reported by name at all, and 1 if it is in the frozen legacy set. Native is used when that reaches the required version.

Types, not values, are shared between the two sides. If both imported one constant the comparison
would be an identity rather than a negotiation.

**The legacy set is a floor, not a default.** Eight types — `channel`, `chat`, `user`, `join`, `site`,
`invitecloud`, `profile`, `meta` — are in every shipped app, so a wiring bug or a truncated payload
that omits them must not push them off native storage. Reporting can add; it cannot subtract.

Versions **only go up**. Excluding a domain means raising the required version, never removing it from
a list — a list an entry can leave and re-enter produces an on-off-on transition, and a user stuck on
the first edition is then indistinguishable from one on the third.

## One domain is exempt from the check entirely

`invitecloud` has no server list API, so the cache _is_ the record. For every other domain a wrong
verdict costs durability and a re-sync; for this one it costs the data. It is excluded at the type
level: `REQUIRED_DOMAIN_VERSION`'s key type subtracts it, so naming it there does not compile, and
the lookup always falls through to "edition 1 is enough". The pin lever must not be pointed at it
either.

Moving that domain's storage at all requires writing a migration bridge **first**. The one that
existed was removed once it had run for weeks and exhausted its active users; there is no bridge
today, and adding one is a precondition rather than a follow-up. See
[README.md](./README.md#invited-clouds) for what defends the domain in the meantime.

The other domains are safe to move because the server refills them. `invite` is one of them because
its list call always revalidates; `meta` is one because it holds sync cursors, and losing those costs
a single full re-sync.

## Moving a domain retires its cursors

`meta` is the awkward case: it is a cursor **about other domains**. Move a domain's storage and the
cursor survives, still claiming "synced up to T" over a store that is empty — so the next sync asks
only for the delta after T and the gap never fills.

That is closed in code rather than by discipline. Each cursor is written with the **routing
fingerprint** in force at the time, and a read whose fingerprint differs falls back to `0`, a full
re-sync. The fingerprint is assembled from the decisions actually made as the storages are built, so
a cache type added later is covered without anyone updating a list. Cursor kinds are composed as
strings at the call site (`channel-sync:${cid}`), so a kind-to-domain mapping table would silently
miss later additions — the fingerprint therefore covers **every** domain. The price is
over-invalidation: an unrelated domain's routing change retires the cursors too. One full re-sync is
the same cost a TTL expiry already imposes routinely.

## Raising a domain's edition

1. **App first.** Raise the domain's version and ship. Add a migration only if the change actually needs one — the point of separating the logical edition from the physical schema number is that a no-op migration is never needed just to move a gate.
2. **Web second**, once the new app has spread: set `REQUIRED_DOMAIN_VERSION[domain]`.
3. Older apps route that one domain to web storage and the server refills it. Nothing else is affected.
4. Doing it in the other order sends **every** user's copy of that domain to web storage for a while. That is a delay, not an incident — except for the local-authority domain, which has no such slack.

The comparison is one-directional (`>=`), so it can express "this edition or newer" and cannot
express "not too new". The discipline that covers the gap: **a version bump must stay compatible with
older web bundles. If it would break one, make a new `CacheType` instead.**

There is one emergency lever — the pin table turns a domain off for every app version with a web
deploy alone — and it is a stopgap with the durability cost above.

## Verifying a change here

- `localFactory.test.ts` fixes the routing table as a full **type × environment** matrix, plus a **report-shape × type** matrix (nothing reported / names only / names and versions / a partial migration). That second matrix asserts the verdicts are unchanged for a shell that reports nothing, which is the safety condition of the whole design: an old app must route exactly as it did before the negotiation existed.
- `nativeCacheSupport.test.ts` fixes the gate itself — the floor holds when a shell omits a legacy type, a reported version is honoured, a shortfall routes to web, and the local-authority domain stays native under every report shape.
- The fingerprint is checked from both ends: the cursor read drops to `0` on a mismatch (in `libs/data`), and `localFactory.test.ts` asserts the fingerprint differs between environments and is derived from the storages actually built rather than a hand-kept list.

## Further reading

- [README.md](./README.md) — the factories that consume this verdict, and the invited-cloud defences
- [`libs/db`](../../../db/README.md) — the two adapters behind `web` and `native`
- [`libs/data`](../../../data/README.md) — the cache partition key, and the sync-cursor data source that reads the fingerprint
