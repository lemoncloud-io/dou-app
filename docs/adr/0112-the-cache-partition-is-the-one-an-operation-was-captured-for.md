# ADR-0112: The cache partition is the one an operation was captured for, not whichever is current

> Status: Accepted · Decided: 2026-09-23 · Implemented: `fix/data-scope-storage`
> · Scope: `libs/data/src/local/**` · `libs/data/src/repositories/**` ·
> `libs/app-runtime/src/data/factories/localFactory.ts` · `libs/db/README.md` (docs only)
> · Lifts the limitation [ADR-0070](./0070-app-runtime-session-hub.md) decision 7 recorded —
> `contextOverride` "not a means of changing the physical partition"
> · Related: [ADR-0085](./0085-sid-is-a-value-not-a-cache-scope-axis.md) (the observer scope is the
> storage partition, `{cid, uid}`) · [ADR-0053](./0053-per-domain-cache-contract-versions.md)
> (per-domain storage routing, which the routing fingerprint guards)
> · The module docs are [libs/data/docs/local](../../libs/data/docs/local/README.md#which-partition-an-operation-touches)
> and [libs/data/docs/repositories](../../libs/data/docs/repositories/README.md#context-and-scope)

## Context

`libs/data` states one rule about scope and repeats it in three documents: capture the context at
request time, so that a late response cannot poison a scope that has since switched. Repositories
did capture it — `getRequestContext()` before the await — and handed the snapshot down to local as
`contextOverride`.

The snapshot never reached storage. The `CacheStorage` port has no scope parameter; every adapter
resolves its partition by asking its context provider at call time; and `createCacheStorages`
handed every adapter the **live** provider. So the override decided the observer key and the `cid`
stamped on a merged row, and the partition was whatever the session pointed at when the write
landed.

Run on the real IndexedDB adapter (`fake-indexeddb`, real repositories and local data sources,
only the socket faked):

- A place list requested by user `me` on cloud A, answered after a cloud-and-account switch, was
  written into **cloud B under the other user**, each row stamped `cid: A`. Cloud A got nothing.
- A `channel.sync` for cloud A that answered after a switch back to cloud B wrote A's channel into
  B, then ran its stale prune against B and **deleted B's channels**. B's sync cursor still said
  "synced" and is re-saved on every poll, so a delta sync never brought them back.
- An observer pinned to a target cloud by an override read the live partition, not the pinned one.
- A leave purge confirmed after a switch would clear a same-id channel in the cloud switched to —
  chat history, which cannot be fetched again once gone.
- `withContext(snapshot)` pinned the repositories and nothing under them.

None of this showed in tests. The shared in-memory storage had no partitions at all, and the one
repository test for this race asserted the override passed to a mock — the question "what did it
ask for", not "where did the row go". Meanwhile the symptoms were being patched one repository at a
time: a foreign-socket check at five sites with three different timings, a relay-only write gate in
invites whose comment records that the override is ignored, and a read-time filter hiding a place
row that had already been written into the wrong partition.

## Decision

### 1. A cache slot hands out the storage for a scope

`createCacheStorages` returns, per slot, a `ScopedCacheStorage` whose `forScope(context)` gives the
storage for that context's partition. It builds one adapter per partition on first use, with a
**snapshot** provider holding only `cid` and `uid`, and reuses it afterwards. The memo is keyed by
the resolved partition (`resolveScopedContext`), so contexts that land in the same partition share
an instance: every context for `invitecloud`, and every uid-less context.

Every local data source resolves the operation's effective context — the override when the caller
captured one, the provider's current context otherwise — **once, when the operation starts**
(`resolveContext`), and uses it for the storage, the `cid` it stamps and the keys it re-emits. A
read-merge-write can no longer read one partition, write another and wake a third scope's observers.

### 2. The adapters do not change

An adapter still reads its provider at call time and still skips every operation when there is no
`uid`. What changed is the provider it is handed: a fixed scope instead of the session. The storage
engine keeps knowing only how to store.

### 3. The foreign-socket guard judges the captured context

During a cloud switch `cid` flips before the old socket rebinds, and an answer from that socket
belongs to the outgoing cloud. `BaseRepository.acceptsAnswer(requestContext, source)` is now the one
judgement, and it is made on the captured context. Two of the five existing sites asked the live
context after the await; with the answer written to the captured partition, that question is
backwards both ways — it dropped a good answer to a request sent just before a switch, and accepted
one sent during the window once the socket had rebound.

### 4. Assembly still builds one storage per slot

`createCacheStorages` builds the storage for the assembly-time scope immediately. The assembler's
routing fingerprint and its native-fallback report count factory calls during assembly; a fully lazy
slot would have switched the fingerprint check off.

### 5. Routing is decided once per type, not once per adapter

With one adapter per partition, the assembler's factory also runs after assembly, whenever the
session first reaches another account or cloud. `app-runtime`'s factory now records the backend it
chose for each type the first time and reuses it for every later partition. Left to decide again,
`invite` — the one type whose routing depends on the shell's capability handshake — would split: the
assembly-time partition on web storage, a partition first reached after the handshake on SQLite, and
the next boot, assembling before the handshake, reading web storage again, where that partition's
local-only dismissals are not. One decision per type is also what the fingerprint describes.

## Alternatives

- **A scope argument on every `CacheStorage` method.** The most explicit shape, and the natural one
  if an adapter ever has to serve several scopes from one instance. Rejected for now: it changes the
  port every adapter in `libs/db` implements, and the native bridge path behind them, to deliver a
  guarantee the slot can give with the adapters untouched.
- **Keep the live provider and check at every write site.** This is the pattern that was spreading.
  It can only drop a late answer, never put it where it belongs, and every new write path has to
  remember it — the five sites had already drifted into three timings.
- **An ambient "current operation" scope around each call.** Browsers and the WebView have no async
  context propagation, and interleaved awaits would leak one operation's scope into another's.
- **Swap the shared holder's context for the duration of a call.** Already tried for the invited
  cloud slot, and removed after other data sources read the swapped value mid-await and wrote into
  the wrong cloud (the note on `resolveScopedContext`).

## Consequences

- A late answer is written into the partition it was requested for and wakes that scope's observers.
  If the screen has moved on, nothing on it changes — which is the point.
- An observer pinned by an override reads its pinned partition, not the provider's current one.
- One adapter instance exists per partition the session has touched; the memo is not evicted. After
  assembly the factory is called once more per new partition; it reuses the type's assembly-time
  backend and records nothing new, so the fingerprint keeps describing where every partition's rows
  go.
- Four earlier decisions give "the read path ignores the override" as one of their reasons —
  ADR-0052 (the invite write gate), ADR-0062 (the MY page reads the relay account from its token),
  ADR-0088 (global search reads through its own source), and ADR-0094. That premise no longer holds.
  Each decision stands on its other reasons for now: the default repositories still follow the live
  scope, and search still reads every cloud at once. Revisiting them is not decided here.
- Every local suite now runs on one shared fixture, `createPartitionedMemoryStorage` — the
  production `createScopedCacheStorage` over in-memory maps — instead of a per-suite map with no
  partitions. A suite about merging or keys runs on real partitions too, and one that spies on a
  storage call spies on `slot.forScope(context)`, the instance the data source uses.

**Not decided here:**

- The foreign-socket window is still unguarded for chat, profile, join and user reads and for every
  optimistic mutation. New guard sites need labels in `ForeignDropSource` (`libs/logger`), and an
  optimistic commit needs a decision about its pending row first.
- The cloud list (`invitecloud`) stays one device-wide partition, readable by the next account on
  the device; the native `invite_clouds` table has no `cid`/`uid` columns to partition by.
- Sync cursors are read and written under the live scope when the app calls `getSyncedAt` /
  `setSyncedAt`. Their kind strings (`channel-sync:<cid>`) keep one cloud's cursor from answering for
  another, but name no account: a sync in flight while a guest is promoted to an account on the same
  cloud, with no reload, saves the guest's cursor into the new account's partition, and that
  account's first delta starts too late. That was already so before this change — then the guest's
  rows went there too — and fixing it means the cursor travels with the captured scope, which
  changes how apps call `syncMeta`.
- `withContext` now pins storage too, and still has no production caller.
