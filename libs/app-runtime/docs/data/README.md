# data — assembling the repository graph

[`libs/data`](../../../data/README.md) has no opinion about which storage engine backs a cache, which
socket a gateway talks to, or what the current cache scope is. This folder supplies all three: it
builds the three data-source bundles, injects the scope, and hands the result to `createRepositories`.
The output is what `useRuntimeRepositories()` returns.

It owns nothing about _reading_ data. Streams, merges and cursors are the data layer's; sync timing
is [docs/sync/](../sync/README.md)'s.

## Layout

```text
data/                              17 source files, 8 tests
├── DataManager.ts                two public methods. Everything is built in the constructor
├── runtime.ts                    configureDataRuntime · getDataRuntime · getDataManager · getRepositories
├── types.ts                      IDataManager · CacheAssemblyOptions
├── cacheStorageRouting.ts        resolveCacheBackend — the one routing decision
├── nativeCacheSupport.ts         what the installed shell says it can store
├── invitedCloudDurability.ts     the one domain the server cannot re-list
├── outbox.ts                     the offline chat outbox — a machine, not a policy
├── index.ts                      the `data` facade group
├── factories/                    socketFactory · localFactory · httpFactory
└── hooks/                        useRuntimeRepositories · useGlobalCacheSearch ·
                                  useInvitedCloudNameSync · useRegisterDeviceTokenMutation · queryKeys
```

`factories/localFactoryFallback.test.ts` has no source file of its own: it covers the web-fallback
log inside `localFactory.ts` and lives apart because it needs the bridge mocked.

## Responsibilities

### `DataManager` — two methods, one constructor

```ts
interface IDataManager {
    getRepositories(): DataRepositories;
    getContext(): DataContext;
}
```

**`ensure(context)` and `destroy()` are gone.** They had already become no-ops once the scope moved
to read-time derivation, and a method that accepts a context while ignoring it invites a caller to
believe pushing one works. Clearing the _session_ is the logout path's job; the scope follows it.
`RuntimeDataBinder`, which used to push that context on every session render, was deleted with them —
so there is no mount point left to revive it from. Reviving the commit brings back the render lag
where an observer subscribed under a stale cid and never received the post-commit write.

The constructor builds everything once, in order: the socket data sources, the local ones (with the
app's cache options), the HTTP ones, an `ActiveScope`, and then the repositories with that scope as
their `DataContextProvider`. `getSocketManager()` is resolved **per call, never captured** — the
runtime is assembled lazily, so holding an instance from construction time either pins a manager that
does not exist yet or misses a rebuild.

**Local data sources receive only the selected scope**, without `socketCid`. Their job is to build a
cache partition key (`${type}:${cid}:${uid}:${id}`); deciding whether a write belongs to the cloud the
socket is actually attached to is the repository layer's, and that is what `ActiveScope.getContext()`
splices `socketCid` in for.

### The three factories

Each returns only the interfaces a repository consumes; no gateway instance escapes.

- **`socketFactory`** builds the socket gateway bundle over `SocketManager`. Most entries bind to the active facade; the auth and invite gateways are pinned to relay with `getScopedClient('relay')`, and `device` is a routed trio (`{ active, relay, cloud }`) so the one relay-only device write can name its destination without every caller learning about routing. The auth bundle has **no `update` slot** — building an `auth.update` packet is the SDK's job alone.
- **`httpFactory`** builds five HTTP data sources over the gateways in [docs/http/](../http/README.md): auth, user, cloud, subscription, report.
- **`localFactory`** materializes `resolveCacheBackend`'s verdict as an adapter and wires nine storages — `channel`, `chat`, `inviteCloud`, `invite`, `join`, `profile`, `site`, `user`, `meta`. It holds the package's only module-level mutable state, a shared `IndexedDBDatabase`, because a database connection is a physical shared resource.

`localFactory` also produces two side outputs. It logs **one line per boot** naming the domains a
native shell could not hold, so "why is this app re-downloading everything" is answerable from the
client — and nothing at all on a plain browser, where web storage is not a fallback. And it records a
**routing fingerprint**, which is what stops a sync cursor outliving the storage it described; both
are in [cache-storage-routing.md](./cache-storage-routing.md).

### Boot policy

```ts
initAppRuntime({ data: { repositories, cache } });
```

`configureDataRuntime` registers the app's policy **before** the runtime singleton is built. Calls
**merge** per key, so one app can register `repositories` and another `cache` without either knowing
about the other. A call that arrives after the runtime exists is **ignored with a warning** rather
than throwing or rebuilding — the graph is assembled once in a constructor, so there is nothing to
apply it to.

`CacheAssemblyOptions` has exactly one field, `maxChatsPerChannel`. Unset means unbounded, which is
what every client did before and still does unless it opts in. It only bites on web storage; inside a
native shell chat always routes to SQLite.

### The four hooks

| Hook                               | Returns                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `useRuntimeRepositories()`         | The repository graph, bound to the current scope                         |
| `useGlobalCacheSearch()`           | `{ search, resolveContext }` — a search across every cloud's partition   |
| `useInvitedCloudNameSync()`        | Fills in an invited cloud's name once its socket verifies. Native only   |
| `useRegisterDeviceTokenMutation()` | The one REST call the runtime still owns — sold through the `push` group |

`cloudsKeys` is the only query key left here, because the runtime is one of the things that
invalidates it — `useLogin` does, right after a login — while the apps invalidate it after their own
cloud-changing actions. The other REST hooks went down to the app layer, where their only
consumers were screens and react-query was the whole cache; keeping a catalogue copy per app is
deliberate duplication, and what is shared is the repository call.

### The offline outbox

`createChatOutbox(options)` is a **machine, and activation is the app's opt-in** — `apps/web` never
constructs one, so this export cannot change behaviour by existing.

```ts
interface ChatOutbox {
    start(): void;
    stop(): void; // deactivates; the queue is kept
    setReady(ready: boolean): void; // pass `isConnected && isVerified`
    enqueue(input: OutboxEnqueueInput): void;
    remove(id: string): void;
    pending(channelId?: string): readonly OutboxEntry[];
    flush(): Promise<void>;
}
```

The guarantee is **at-least-once, in order, per channel** — not exactly-once, because the wire carries
no idempotency key. What shapes the rest:

- **One attempt per ready transition.** That is structural, not a setting: there is no attempt counter and no backoff timer, so a flapping connection cannot turn into a send storm.
- **Queues are per channel**, each with its own promise chain, and concurrent drains collapse into one.
- **Dequeue is by identity, never by position** — an entry removed while a drain is in flight must not shift the one being sent.
- **`hasLanded` is asymmetric.** `true` is strong; `false` only means "could not find it", so the entry is resent.
- **A failed send retires the entry** and leaves the row marked failed, where the user can retry it deliberately.

### Invited clouds

An invited cloud is the one domain with no server list API: if the row leaves the cache there is
nothing to restore it from. Two functions defend it, both best-effort and both idempotent:

- `recoverInvitedCloudIfMissing(cloud, cid)` — when a push names a cloud that is not in the cache, re-issue the relay delegation token and rebuild the endpoint from it. No name is written; the connection fills that in later. Since the one-time web-to-native migration was removed, this is the **only** recovery path left, and it is reactive: it repairs a cloud a push happens to name, never the list.
- `syncInvitedCloudName(cloud, cid)` — a delegation token carries no name, so the authoritative one is read with `cloud.get` once the socket verifies. This is the only source for it.

The gap that remains is real and needs a backend change: a store wiped completely (a reinstall, a
full cache clear) with no push carrying a cid has no recovery path. That is the price of the
single-source rule, which is itself deliberate — a second parallel registry diverges, and then two
answers exist with no way to tell which is right.

## Usage

```ts
// React
const { channel, chat } = runtime.data.useRuntimeRepositories();

// Outside React — the same graph, resolved synchronously
const repos = getRepositories();
```

Everything else about using a repository — subscribing with `observe*`, refreshing, writing —
belongs to [`libs/data`](../../../data/README.md).

### What not to do

- **Do not add a direct-gateway escape hatch.** Every read and write goes through a repository, and gateway instances stay inside `data/` and `http/`.
- **Do not revive `ensure`/`destroy` on `DataManager`.** The scope is derived at read time; a setter that ignores its argument is worse than no setter.
- **Do not capture `getSocketManager()` at construction.** Resolve it per call.
- **Do not put a routing branch in a factory, an adapter or an app.** `resolveCacheBackend` is the one decision point, and a second one drifts from it invisibly.
- **Do not call `configureDataRuntime` after first repository access.** It is silently ignored (with a warning), which reads as "my policy does nothing".
- **Do not give the outbox a retry timer.** One attempt per ready transition is the guarantee, and a timer turns a flapping socket into a send storm.

## Notes for implementers and tests

- The factories are stateless functions — receive, assemble, return. Module-level mutable state is allowed only for a physical shared resource (the IndexedDB connection) and for the runtime singletons.
- `createLocalDataSources` accepts an injected `cacheStorageFactory`. Injecting one leaves the routing fingerprint empty, which **disables** the cursor check — fine in a test, but it means a fingerprint test has to use the real factory.
- `nativeCacheSupport` exports `LOCAL_AUTHORITY_CACHE_TYPES` and `REQUIRED_DOMAIN_VERSION` for its own tests only; neither is on the package barrel, and `REQUIRED_DOMAIN_VERSION` is empty in production.
- `setNativeCacheSupport` must run before the data runtime is built — `apps/web` calls it from `main.tsx`. A report arriving later cannot move a routing decision that has already been made, and `resetNativeCacheSupport()` is the test seam.
- `localFactory.test.ts` asserts a full type × environment matrix rather than individual cases, so a routing change cannot slip in as a side effect of something else.

## Further reading

- [cache-storage-routing.md](./cache-storage-routing.md) — where a cache type lands, and the version negotiation behind it
- [docs/session/](../session/README.md) — `ActiveScope`, the thing injected into every repository
- [docs/http/](../http/README.md) — the gateways `httpFactory` builds over
- [docs/sync/](../sync/README.md) — what writes into these repositories without a screen asking
- [`libs/data`](../../../data/README.md) · [`libs/db`](../../../db/README.md) — the repository layer and the storage engines
