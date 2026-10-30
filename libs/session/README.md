# @chatic/session

**The session's state, and nothing that acts on it.** Three stores hold the tokens, the selected
cloud and site, and who the user is; a typed signal announces every write; derived contexts answer
the common questions; and the scope gives the three views of "which cloud are we operating as". It
was cut out of `@chatic/app-runtime` as the bottom layer of that package (ADR-0253): everything
there reads from it, and it reads nothing there.

Logging in, switching cloud, renewing a credential and ending a session are not here. Those are the
use cases in `@chatic/auth` — [its session doc](../auth/docs/session/README.md) — and
they are the only writers of these stores.

## Who imports it

`@chatic/app-runtime` and the modules cut from it that sit above this one — `@chatic/transport`,
`@chatic/sync` and `@chatic/auth`. **Apps do not**: they read the session through
`runtime.session`, which publishes readers and no writers. The barrel sells the raw stores
(`cloudStore`, `relayStore`, `identityStore`) because the use cases above have to write them; keeping
apps off this package is what keeps those writers out of reach.

Production code imports the barrel only. A test in app-runtime, transport, sync or auth may name a file —
`jest.mock('@chatic/session/store/stores', …)` — because mocking the barrel would leave this
package's own internal imports on the real module. The root eslint config closes both forms to
everything else, and each importing package's own config re-opens the barrel and, in tests only,
the deep form.

## Layout

```text
libs/session/src/
├── index.ts                 the package barrel
├── store/    13 files ·  7 tests  relay · cloud · identity tokens, selection, derived contexts, credential freshness
└── scope/     3 files ·  1 test   ActiveScope — the three views, and the DataContextProvider
```

`store/index.ts` re-exports only `contextStore`, `contexts`, `signal` and `types` — what a reader
needs. The package barrel adds the raw stores, `configureSessionStore`,
`msUntilExpiration`, `credentialFreshness` and the scope, for the runtime modules that write or
measure the session.

## Responsibilities

**The store decides nothing.** It persists, it derives, and it announces. It does not know that a
socket, a repository or a use case exists. Nothing in this package can import the runtime above it
— the package graph refuses the cycle — and [`eslint.config.mjs`](./eslint.config.mjs) also
rejects `../scope` and `@chatic/config` from anywhere under `src/store/**`. Opening any of those
would make the store a participant in the flow it is supposed to merely record.

**[`store/configure.ts`](./src/store/configure.ts) is the one exempt file**, and it
exists to keep the exemption to one file: it reads `@chatic/config` at boot and hands `relayStore`
two endpoint **resolvers**. Functions, not values — a deeplink override (`?_backend=`) can be
captured after module load and still be picked up, because every access re-resolves. Until
`initAppRuntime()` runs them, `relayStore.getBackend()` and `getWss()` **throw**, with a message
naming that function. A loud failure beats a request going out to an empty host.

**`credentialFreshness` sits in `store/`, not with the use cases in app-runtime.** It answers "how long is left on this
server's credential" by reading the stores and nothing else, and the HTTP transport and the socket
auth status both ask it. Both sit below the use cases in app-runtime, so the reader lives here,
beside `expiry.ts`.

**`scope/` owns the answer to "which cloud/site/user are we operating as"** and implements
`@chatic/data`'s `DataContextProvider`. It never judges — the judgement (`isForeignContext`) is a
pure function owned by [`libs/data`](../data/README.md), because most of its call sites are
inside `data`, which is a leaf and cannot import this package.

## The shared contract

### Three stores, and what they persist

Each store is a class taking `(storage, signal)` in its constructor — so a test can build one over a
fake storage — and each is exported only as a singleton alongside its `I*Store` interface. The
implementation classes are not exported.

| Store           | Interface        | Keys                                                                                                                                                                                                                           |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `relayStore`    | `IRelayStore`    | `chatic-relay-token` · `chatic-relay-selected-site-id`                                                                                                                                                                         |
| `cloudStore`    | `ICloudStore`    | `chatic-cloud-delegation-token` · `chatic-cloud-token` · `chatic-selected-cloud-id` · `chatic-selected-place-id` · `chatic-cloud-token-cache` · `chatic-cloud-identities` · `chatic-recent-clouds` · `chatic-reclaimed-clouds` |
| `identityStore` | `IIdentityStore` | `chatic-delegator-id` · `chatic-device-id`                                                                                                                                                                                     |

The keys stay in the file of the store that reads and writes them rather than moving to a shared
`constants.ts`: a storage key is that class's persistence contract, and nothing else may touch it.

`IIdentityStore` has exactly three members — `getDelegatorId`, `setDelegatorId`, `setDeviceId`.
**There is no `getDeviceId`**: the device id is read back through the derived identity context, not
off the store.

`cloudStore` answers for more than the committed cloud. `getCloudTokenOf(cid)` is the store's own
token while `cid` is committed and the cache entry otherwise; `peekCachedCloudTokens(cid)` reads the
cache with no expiry margin (the served read, `getCachedCloudTokens`, deletes what it refuses to
serve, and a socket still signing with that token must not lose it); `dropCachedCloudTokens(cid)`
forgets one cloud's entry and `clearCachedCloudTokens()` every cloud's. The identity map —
`getCloudIdentity` · `setCloudIdentity` · `getCloudIdentities` · `clearCloudIdentities` — records
which uid this account has in each cloud and outlives the tokens. It is what a reader of another
cloud's cache partition addresses that partition by. The recent-cloud order — `recordCloudUse` ·
`getRecentClouds` · `clearRecentClouds`, most recent first, at most 20 — is written by every
successful switch and decides which clouds keep a background socket session when there are more of
them than the cap ([app-runtime docs/connection/](../app-runtime/docs/connection/README.md#background-slots)). The reclaim records —
`getReclaimedFor` · `setReclaimedFor` · `clearReclaimedClouds` — map an owned cloud the device also
cached as invited to the relay user it was last re-issued for, so the owned-cloud reclaim asks
`delegate-cloud` once per account rather than on every trigger
([auth docs/socket/](../auth/docs/socket/README.md#an-owned-cloud-held-as-its-invitee)).

**Leaving the committed cloud is not the end of the account**, so `clearSession` clears the committed
session and the selection and keeps the rest: the token cache (the other clouds' background sessions
sign from it, and the cloud just left usually becomes one of them), the identities, the recent order
and the reclaim records. Only `relaySession.clearAndRedirect` clears them.

[`jsonSlot.ts`](./src/store/jsonSlot.ts) is what each token slot is built on. It
memoizes by raw string, so re-reading an unchanged token reuses the parse — building the relay
context used to parse the same token three times.

### One signal, four kinds

```ts
export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';
```

`relay:token` and `cloud:token` are separate because the two refresh loops are: a relay refresh
arriving while a cloud session is active must not re-derive cloud-scoped consumers.

**Every write emits its kind.** This is the table
[`store/writeSignals.test.ts`](./src/store/writeSignals.test.ts) locks:

| Write                                                                                  | Emits                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `relayStore.saveRelayToken` · `clearToken`                                             | `relay:token`                                |
| `cloudStore.saveDelegationToken` · `saveCloudToken`                                    | `cloud:token`                                |
| `relayStore.saveSelectedSiteId` · `clearSelectedSite`                                  | `selection`                                  |
| `cloudStore.saveSelectedCloudId` · `saveSelectedSiteId` · `clearSelectedSite`          | `selection`                                  |
| `cloudStore.clearSession`                                                              | `cloud:token` + `selection`, in one batch    |
| `identityStore.setDelegatorId` · `setDeviceId`                                         | `identity`                                   |
| `setSessionAuthenticated` · `setSessionIdentityState` · `markSessionInitialized`       | `identity`                                   |
| `rebuildSessionIdentity`                                                               | `identity`, **only when the identity moved** |
| `clearRelaySession`                                                                    | `relay:token` + `identity`, in one batch     |
| `cloudStore.setCachedCloudTokens` · `dropCachedCloudTokens` · `clearCachedCloudTokens` | **nothing**                                  |
| `cloudStore.setCloudIdentity` · `clearCloudIdentities`                                 | **nothing**                                  |
| `cloudStore.recordCloudUse` · `clearRecentClouds`                                      | **nothing**                                  |
| `cloudStore.setReclaimedFor` · `clearReclaimedClouds`                                  | **nothing**                                  |

The last four rows are the legitimate exceptions and their names say so: the per-cloud token cache,
the identity map, the recent order and the reclaim records change no observable session state. The
reclaim records are read only by the reclaim, inside the run that writes them. A uid moves only with a
new account, which announces itself through the relay token, and the recent order is written inside
a switch's commit batch, which already announces `cloud:token` + `selection`. The background socket
slots do derive from the token cache; they are told through their own store
(`backgroundClouds.invalidate`), not a session signal. `rebuildSessionIdentity` is the one gated writer — it compares
five fields (`userId`, `delegatorId`, `isInitialized`, `isAuthenticated`, `error`) and stays silent
when none moved, because it is called after every token writeback.

**A use case is one fan-out.** `sessionSignal.batch(fn)` collects the emits inside `fn` and flushes
once after it returns; it nests, and only the outermost batch flushes. Before this existed, one cloud
switch fired eight payload-less broadcasts and seven inconsistent intermediate states were
observable.

**Invalidators are eager, listeners are deferred**, and the split matters. A listener is external
fan-out — a React re-render — and collapsing those is what a batch is for. An invalidator drops the
derived-context cache, and code _inside_ the batch reads that cache, so deferring it would make
`switchTo` return a snapshot of the cloud it just left.

### Derived contexts, and the three caches behind them

[`contextStore.ts`](./src/store/contextStore.ts) assembles the three shapes a consumer
actually reads — `getGlobalSessionContext()`, `getSessionAuthSnapshot()`, `getSocketSlotContext()` —
and keeps one cache per shape. A single `sessionSignal.registerInvalidator` drops all three. Identity
state is seeded on first read rather than at module load, so importing the store does no work.

[`contexts.ts`](./src/store/contexts.ts) is the read-only face of that:
`getIdentityContext`, `getActiveServerContext`, `getCloudSessionSnapshot`, `getSocketSlotContext`,
`getGlobalSessionContext`, and `getCommittedCloudId()` — which is nothing but
`cloudStore.getDelegationToken()?.cloudId ?? null`, the source of the `committed` scope view.

`getUidInCloud(cloudId)` answers a question the identity context cannot: which uid this account has
in a given cloud, committed or not. The relay's is the relay token's; a cloud's is the uid of the
token its socket signs with (`getCloudTokenOf`), falling back to the recorded cloud identity once
that token is gone. `IdentityContext.userId` answers for the active token only, and every cloud gives
the account a different uid. The sync registry and the scoped repository graphs read it, and apps
read it as `session.getUidInCloud` / `session.useUidInCloud(cid)` wherever they build an id or match
"is this me" for a named cloud — a join id `<channel>@<uid>` built from the session uid is wrong for
every cloud but the committed one.

### The scope: three views that are supposed to disagree

[`ActiveScope`](./src/scope/ActiveScope.ts) takes three readers in its constructor and
exposes three getters. There is exactly one instance, built by `DataManager`.

| View        | Source                                          | Behaviour                                                   |
| ----------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `selected`  | `deriveSelectedContext()` — read from the store | Flips at the _start_ of a switch, before any token exchange |
| `bound`     | `SocketManager.getBoundCid()`                   | Observed. This class never assigns it                       |
| `committed` | the delegation token's `cloudId`                | Frozen through the optimistic window                        |

Their disagreement is optimistic switching: the cache partition must follow the target immediately so
observers re-subscribe, while the socket is still attached to the cloud it is leaving. Collapsing
them brings back cross-cloud cache poisoning.

`getContext()` composes `selected` with `socketCid` **per call, never cached**, so a socket rebind
takes effect on the very next repository read. When nothing is bound it **omits** `socketCid` rather
than setting it to `null` — `isForeignContext` reads an absent `socketCid` as "no one to disagree
with". `setContext()` is a deliberate no-op: honouring a pushed value is what produced the render lag
this class replaced, where a descendant hook subscribed under a cid the provider had not caught up
to yet and never received the post-commit write.

`deriveSelectedContext()` returns `{ cid, uid }` and **no `sid`** (ADR-0085). A site is something a
caller names as an argument; seeding it from the ambient session is what let a write race a site
switch — tagged for one site, sent under another's session.

## Usage

### Adding a store write

1. Put it on the `I*Store` interface first. The interface is the contract; the class is an implementation detail that is never exported.
2. Emit the `SessionSignalKind` the write moves, in the store method itself. A writer that does not emit is invisible to every reader.
3. If it is a pure cache write that changes nothing observable, emit nothing — and say so in the method name, the way `setCachedCloudTokens` does.
4. Add the row to [`writeSignals.test.ts`](./src/store/writeSignals.test.ts). That file is the table above; if the two disagree, the table is wrong.
5. If a use case performs several writes, wrap it in `sessionSignal.batch()` so subscribers see one change.

### What not to do

- **Do not import `scope/` from anything under `store/`.** Lint will stop you, and the reason is not style: a store that can call a use case can be re-entered mid-write.
- **Do not read `@chatic/config` outside `store/configure.ts`.** Take the value as an injected function. Beyond the layering, `import.meta` breaks ts-jest under `module: commonjs`, and these tests run there.
- **Do not collapse the three scope views**, and do not add `sid` back into `deriveSelectedContext`. Both have a specific failure attached (cache poisoning; a write tagged for the wrong site).
- **Do not push a context into the scope.** `setContext` is a no-op on purpose. If a caller needs a different partition for one call, it passes `contextOverride` to the repository method.
- **Do not add a second source for local session state.** Anything derivable belongs in `contextStore`; a parallel `localStorage` entry diverges and then two answers exist.

## Notes for implementers and tests

- Each store takes its storage in the constructor, so a test builds one over a fake `StorageLike` rather than mocking a module. That is what `writeSignals.test.ts` and `contextStore.test.ts` do.
- `sessionSignal` is a process singleton. A test that asserts fan-out counts must unsubscribe, because listeners survive between cases.
- `msUntilExpiration` lives in `store/expiry.ts`, not with the use cases in app-runtime, because the store needs it too and cannot import anything above it. Its `null` means "unmeasurable", which is explicitly **not** stale.
- The identity context is seeded lazily. A test that asserts the initial state must read it once before asserting no signal fired.
- `relayStore.getBackend()` throws until `configureSessionStore()` has run, so any test touching relay endpoints has to call it (or inject resolvers) first.

## How to verify

```bash
npx tsc -b libs/session/tsconfig.json
npx jest --config libs/session/jest.config.js
cd libs/session && npx eslint src
```

The two absence gates in app-runtime (`refreshAbsence.test.ts`, `authUpdateAbsence.test.ts`) scan this
package too, and app-runtime's suite is the real consumer test: it drives these stores through every
use case.
