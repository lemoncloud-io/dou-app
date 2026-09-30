# data — assembling the repository graph

[`libs/data`](../../../data/README.md) has no opinion about which storage engine backs a cache, which
socket a gateway talks to, or what the current cache scope is. This folder supplies all three: it
builds the three data-source bundles, injects the scope, and hands the result to `createRepositories`.
The output is what `useRuntimeRepositories()` returns.

It owns nothing about _reading_ data. Streams, merges and cursors are the data layer's; sync timing
is [docs/sync/](../sync/README.md)'s.

## Layout

```text
data/                              21 source files, 13 tests
├── DataManager.ts                the app graph, plus one scoped graph per cloud on demand
├── runtime.ts                    configureDataRuntime · getDataRuntime · getDataManager · getRepositories
├── types.ts                      IDataManager · CacheAssemblyOptions
├── cacheStorageRouting.ts        resolveCacheBackend — the one routing decision
├── nativeCacheSupport.ts         what the installed shell says it can store
├── cloudChat.ts                  sendChatInCloud · getCloudRepositories — writes named by cloud
├── invitedCloudDurability.ts     the one domain the server cannot re-list
├── clearLocalCaches.ts           the settings "clear cache" — every known cloud, minus what only this device holds
├── syncCursorWatermark.ts        retires the cursors a clear could not reach, on the next boot
├── outbox.ts                     the offline chat outbox — a machine, not a policy
├── index.ts                      the `data` facade group
├── factories/                    socketFactory · localFactory · httpFactory
└── hooks/                        useRuntimeRepositories · useGlobalCacheSearch ·
                                  useInvitedCloudNameSync · useRegisterDeviceTokenMutation · useSendImages ·
                                  queryKeys
```

`factories/localFactoryFallback.test.ts` has no source file of its own: it covers the web-fallback
log inside `localFactory.ts` and lives apart because it needs the bridge mocked.

## Responsibilities

### `DataManager` — the app graph, and a graph per cloud

```ts
interface IDataManager {
    getRepositories(): DataRepositories; // the app graph — follows the selection
    getContext(): DataContext;
    getScopedRepositories(cid: string): DataRepositories; // pinned to one cloud
    getScopedContext(cid: string): DataContext;
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

### Scoped repository graphs

`getScopedRepositories(cid)` is a second repository graph pinned to one cloud, built on first use and
kept for the session. It exists for work that belongs to a cloud other than — or independently of —
the selected one: the sync plans, each writing its slot's frames; the background receive loops, each
asking its cloud's delta ([docs/sync/](../sync/README.md#background-receive)); chat prime's cache read
and first page; and every chat send (below). Apps reach it as `data.getCloudRepositories(cid)`.

| Part          | App graph (`getRepositories`)               | Scoped graph (`getScopedRepositories(cid)`)                       |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Context       | `ActiveScope`: selected cloud + session uid | `{ cid, uid: getUidInCloud(cid), socketCid: cid }`, read per call |
| Socket        | the active facade                           | `getScopedClient(slotKeyOf(cid))` — that cloud's slot only        |
| Local sources | built once in the constructor               | **the same instances**                                            |
| HTTP sources  | built once in the constructor               | the same instances                                                |

**The local sources are shared, not copied**, because an observer is registered on a data-source
instance: a write through a scoped graph has to reach the instance a screen subscribed through, or
the screen never wakes. The partition is not the instance's to decide either way — every operation
picks its storage from the context it runs under, so one shared instance serves every cloud's
partition. That holds only where the repository hands its context down: a shared local source left
to itself falls back to the **selected** cloud. `SyncMetaRepository` did not, and a cursor written
through cloud A's graph while B was selected landed in B's partition; it now names its graph's
`cid`/`uid` on every call, and a new repository over a shared local source has to do the same.

**`socketCid` is the cloud itself**, because every socket call the graph makes goes through that
cloud's slot; `acceptsAnswer` therefore never refuses an answer on a scoped graph. The uid is the one
this account has in that cloud, read live — it can land after the graph exists, and a context with no
uid names no partition, so the graph's cache operations are no-ops until it does.

Two things it deliberately is not:

- **Not the app graph when `cid` is the active cloud.** Handing the app graph back would make the active slot's frames follow the selection again during a switch, which is what the scoped graph exists to stop.
- **Not evicted when the cloud's slot goes.** It is one small object per cloud visited, like the storage-per-partition memo underneath, and nothing in it is tied to one socket: its socket client resolves the slot on each call. Repository-instance state is its own — the only such state is the channel leave guard, and a background receive loop's `syncChannels` does read it. A leave made through the app graph is therefore not seen by that cloud's scoped graph: a loop delta already in flight when the user leaves a room can write the room back until the next delta prunes it. The window is one request long, and it opens only for a cloud that just stopped being a background one — the user has to be in it to leave a room — so the guard is not shared.

HTTP still follows the committed session on both graphs; nothing that writes through a scoped graph
calls it.

### Writes addressed to a cloud

A chat send is two moments on the app graph: the optimistic row's partition is read when the call
starts, and the socket when the request goes out, after that row has been written. Both follow the
selection, so a switch landing between them left the row in the cloud the user pressed send in and
sent the message to the one they moved to — and nothing refused it, because `sendChat` has no
`acceptsAnswer` check to fail. When the outgoing cloud's slot was then torn down, the request died
with it.

`data.runInCloud(cid, work)` names the cloud once, up front, and runs `work` against that cloud's
graph; `data.sendChatInCloud(cid, payload)` is the text send on top of it, and the image send (a row,
an upload, then the send) runs inside one `runInCloud` so the hold covers the whole sequence
([image-send.md](./image-send.md) — `data.useSendImages`, the one image send every shell runs):

- It sends through `getScopedRepositories(cid)`, so the row, the uid it is stamped with and the socket are all that cloud's. Failure is the repository's usual contract: the row stays in `cid`'s partition marked failed, and the error is rethrown.
- It **holds** the cloud's socket slot for as long as the work is in flight ([docs/socket/](../socket/README.md#holding-a-slot-for-a-write)), and releases it on settle — success or failure. The ack is the last thing that needs the socket, and every later send takes its own hold, so there is no grace period to tune.
- The cloud is the caller's to name, and it is the cloud of the row the user was looking at — the channel row for a new message, the failed message's own `cid` for a retry. The selected cloud is the wrong answer: it moves before the session does, so during a switch it names the cloud the user is going to, not the one they pressed send in.

A cloud with no slot bound fails the send at once rather than waiting for one, and the hold does not
open one for it: at the moment of the press the cloud on screen always has a slot, so an unbound one
means the session is not ready, and a failed row the user can retry says so better than a message
that sits pending.

Reactions, edits, deletes and read markers still go through the app graph. They are the same shape
of write, and moving them is the same change made again.

### The three factories

Each returns only the interfaces a repository consumes; no gateway instance escapes.

- **`socketFactory`** builds the socket gateway bundle over a socket client — the active facade by default, one slot's `getScopedClient(key)` for a scoped graph. The auth and invite gateways are pinned to relay with `getScopedClient(RELAY_SLOT)` whichever client is passed, and `device` is a routed pair (`{ active, relay }`) so the one relay-only device write can name its destination without every caller learning about routing. `upload` rides the passed client like the other cloud domains — an image message's uploads go to the cloud it is sent in. The auth bundle has **no `update` slot** — building an `auth.update` packet is the SDK's job alone.
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
    setReady(cid: string, ready: boolean): void; // pass whether that cloud's slot is verified
    enqueue(input: OutboxEnqueueInput): void; // { id, cid, channelId, payload }
    remove(id: string): void;
    pending(cid?: string): readonly OutboxEntry[];
    flush(): Promise<void>;
}
```

The guarantee is **at-least-once, in order, per channel** — not exactly-once, because the wire carries
no idempotency key. What shapes the rest:

- **An entry carries the cloud it was written in**, because its failed row sits in that cloud's partition and its channel id means nothing anywhere else. Queues are keyed by `(cid, channelId)`, and readiness is per cloud: one cloud's socket being down holds back its own queue and no other. A cloud with no slot keeps its entries until it has one — the outbox never opens a socket to resend.

- **One attempt per ready transition.** That is structural, not a setting: there is no attempt counter and no backoff timer, so a flapping connection cannot turn into a send storm.
- **Queues are per channel within a cloud**, each with its own promise chain, and concurrent drains collapse into one.
- **Dequeue is by identity, never by position** — an entry removed while a drain is in flight must not shift the one being sent.
- **`hasLanded` is asymmetric.** `true` is strong; `false` only means "could not find it", so the entry is resent.
- **A failed send retires the entry** and leaves the row marked failed, where the user can retry it deliberately.

### Invited clouds

An invited cloud is the one domain with no server list API: if the row leaves the cache there is
nothing to restore it from. Two functions defend it, both best-effort and both idempotent:

- `recoverInvitedCloudIfMissing(cloud, cid)` — when a push names a cloud that is not in the cache, re-issue the relay delegation token and rebuild the endpoint from it. No name is written; the connection fills that in later. Since the one-time web-to-native migration was removed, this is the **only** recovery path left, and it is reactive: it repairs a cloud a push happens to name, never the list.
- `syncInvitedCloudName(cloud, cid)` — a delegation token carries no name, so the authoritative one is read with `cloud.get` once the socket verifies. This is the only source for it.

The gap that remains is real and needs a backend change: a store wiped completely (a reinstall, the
OS clearing app data) with no push carrying a cid has no recovery path. That is the price of the
single-source rule, which is itself deliberate — a second parallel registry diverges, and then two
answers exist with no way to tell which is right.

### Clearing the cache

`clearLocalCaches()` is the settings screen's "clear cache". It empties the local cache of every cloud
this device holds a partition for and leaves sessions and tokens alone — it is not a logout.

- **Which clouds.** The relay, every cloud in the recorded identity map (`getRecordedCloudIds`), and the committed cloud. A partition is keyed by the uid the account has in that cloud, and `recordCloudIdentity` stores one for every cloud a token was ever minted for, so that map reaches clouds that are neither on screen nor in any catalog. Each is cleared through its scoped graph, under its own uid. Rows left by an account the device is no longer signed in to are out of reach: no identity names their uid, so nothing names the partition.
- **Which domains.** Everything the server refills for what is on screen: `channel`, `chat`, `join`, `place` (`site`), `profile`, `user`. `chat` qualifies although rows before a room's `joinedNo` are never served again, because they were never shown either — the join-window gate hides them — and `join` is cleared and refilled with it. Two are kept because the cache is the only copy — `cloud` (`invitecloud`, above) and `invite`, whose `dismissedAt` only this device writes. Clearing it would bring back every dismissed invite.
- **Cursors last, and again on the next boot.** `syncMeta` is cleared per cloud once that cloud's data clears have settled: a cursor over an emptied store makes the next sync fetch only the delta and never fill the gap. That still leaves a sync that read its `since` before the clear and answers after it — it saves a fresh cursor over the empty store, and the 60-second poll then keeps that cursor's TTL alive for as long as the app is open. So the sweep also calls `requestSyncCursorReset()`, and the next boot's `initAppRuntime` turns that into a watermark: every cursor saved before that boot reads as 0, a full re-sync (`syncCursorWatermark`). The old page stamps its cursors before it unloads, so the watermark is always later than the one the race writes. It is a watermark rather than a second sweep at boot because a sweep there would build the data runtime before the native shell has reported which cache types it can store, and fix the routing wrongly for the session.
- **Not kept.** An unsent chat (`chat_no: 0`) lives only in the `chat` slot and goes with it. The dialog says so rather than the sweep picking rows out of a domain.
- **Failures are counted, not thrown.** One domain's clear failing does not stop the rest; the result carries the count and the caller decides. apps/web reloads on a clean sweep and stays put with an error on a partial one, so a retry can repeat it.

## Usage

```ts
// React
const { channel, chat } = runtime.data.useRuntimeRepositories();

// Outside React — the same graph, resolved synchronously
const repos = getRepositories();

// One cloud's graph, whichever cloud is selected
const cloudA = runtime.data.getCloudRepositories('cloud-a');

// A chat send, to the cloud of the row the user pressed send in
await runtime.data.sendChatInCloud(channel.cid, { channelId: channel.id, content });

// A write of several requests, all to that cloud, its socket held until the last one settles
await runtime.data.runInCloud(channel.cid, async ({ chat }) => {
    /* create the row, upload, send */
});
```

Everything else about using a repository — subscribing with `observe*`, refreshing, writing —
belongs to [`libs/data`](../../../data/README.md).

### What not to do

- **Do not add a direct-gateway escape hatch.** Every read and write goes through a repository, and gateway instances stay inside `data/` and `http/`.
- **Do not revive `ensure`/`destroy` on `DataManager`.** The scope is derived at read time; a setter that ignores its argument is worse than no setter.
- **Do not capture `getSocketManager()` at construction.** Resolve it per call.
- **Do not put a routing branch in a factory, an adapter or an app.** `resolveCacheBackend` is the one decision point, and a second one drifts from it invisibly.
- **Do not call `configureDataRuntime` after first repository access.** It is silently ignored (with a warning), which reads as "my policy does nothing".
- **Do not send a chat through `useRuntimeRepositories().chat.sendChat`.** It follows the selection, and a switch in flight splits the write across two clouds. Use `sendChatInCloud` with the cloud of the row on screen.
- **Do not give the outbox a retry timer.** One attempt per ready transition is the guarantee, and a timer turns a flapping socket into a send storm.

## Notes for implementers and tests

- The factories are stateless functions — receive, assemble, return. Module-level mutable state is allowed only for a physical shared resource (the IndexedDB connection) and for the runtime singletons.
- `createLocalDataSources` accepts an injected `cacheStorageFactory`. Injecting one leaves the routing fingerprint empty, which **disables** the cursor check — fine in a test, but it means a fingerprint test has to use the real factory.
- `nativeCacheSupport` exports `LOCAL_AUTHORITY_CACHE_TYPES` and `REQUIRED_DOMAIN_VERSION` for its own tests only; neither is on the package barrel, and `REQUIRED_DOMAIN_VERSION` is empty in production.
- `setNativeCacheSupport` must run before the data runtime is built — `apps/web` calls it from `main.tsx`. A report arriving later cannot move a routing decision that has already been made, and `resetNativeCacheSupport()` is the test seam.
- `@chatic/data` builds one storage per `(cid, uid)` partition, on first use, so the factory also runs after assembly. `createLocalDataSources` therefore records each type's backend the first time it builds that type and reuses it for every later partition — without that, a partition first reached after a late handshake would put `invite` on SQLite while the rest of the session, and the next boot, read IndexedDB (ADR-0112).
- `localFactory.test.ts` asserts a full type × environment matrix rather than individual cases, so a routing change cannot slip in as a side effect of something else.

## Further reading

- [cache-storage-routing.md](./cache-storage-routing.md) — where a cache type lands, and the version negotiation behind it
- [image-send.md](./image-send.md) — `useSendImages`: the pending row, the file memory, retry and leftovers
- [docs/session/](../session/README.md) — `ActiveScope`, the thing injected into every repository
- [docs/http/](../http/README.md) — the gateways `httpFactory` builds over
- [docs/sync/](../sync/README.md) — what writes into these repositories without a screen asking
- [`libs/data`](../../../data/README.md) · [`libs/db`](../../../db/README.md) — the repository layer and the storage engines
