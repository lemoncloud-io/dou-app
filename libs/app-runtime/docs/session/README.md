# session — the hub every other layer reads from

The session is what the rest of this package is derived from: which tokens exist, which cloud and
site are selected, who the user is. Four folders own one thing each, and the direction of every edge
is fixed — `hooks → auth → store` and `scope → store`, never back.

Nothing in this folder authenticates a socket or renews a credential. That is
[docs/auth/](../auth/README.md); this folder holds the state it reads and writes.

## Layout

```text
session/                              53 source files, 23 tests
├── store/    12 files ·  4 tests  relay · cloud · identity tokens, selection, derived contexts
├── auth/      9 files ·  7 tests  login · cloud entry · teardown · the SDK delegate's material
├── scope/     3 files ·  1 test   ActiveScope — the three views, and the DataContextProvider
├── hooks/    28 files · 11 tests  the React surface: 5 app · 8 auth · 5 actions · 5 readers
└── index.ts                       the `session` facade group
```

`store/index.ts` deliberately re-exports only `contextStore`, `contexts`, `signal` and `types`.
`stores.ts` (the three raw stores), `jsonSlot.ts`, `expiry.ts` and `configure.ts` are not on it — a
consumer reads a derived context; only the use cases inside this hub touch a raw store, and they do
it by concrete path. There is no `auth/index.ts` at all.

## Responsibilities

**The store decides nothing.** It persists, it derives, and it announces. It does not know that a
socket exists, that a repository exists, or that its sibling folders exist —
[`eslint.config.mjs`](../../eslint.config.mjs) rejects an import of `**/socket/**`, `**/data/**`,
`**/http/**`, `../auth`, `../hooks`, `../scope` or `@chatic/config` from anywhere under
`src/session/store/**`. Opening any of those would make the store a participant in the flow it is
supposed to merely record.

**[`store/configure.ts`](../../src/session/store/configure.ts) is the one exempt file**, and it
exists to keep the exemption to one file: it reads `@chatic/config` at boot and hands `relayStore`
two endpoint **resolvers**. Functions, not values — a deeplink override (`?_backend=`) can be
captured after module load and still be picked up, because every access re-resolves. Until
`initAppRuntime()` runs them, `relayStore.getBackend()` and `getWss()` **throw**, with a message
naming that function. A loud failure beats a request going out to an empty host.

**`auth/` runs the use cases, and it does not reach the network directly.** Login, token exchange,
site selection and teardown all go through `getRepositories().auth` (ADR-0036). No file here holds a
gateway. It is not React, so it uses the synchronous `getRepositories()` accessor rather than the
`useRuntimeRepositories` hook.

**`scope/` owns the answer to "which cloud/site/user are we operating as"** and implements
`@chatic/data`'s `DataContextProvider`. It never judges — the judgements (`isForeignContext`,
`isCidActive`) are pure functions owned by [`libs/data`](../../../data/README.md), because most of
their call sites are inside `data`, which is a leaf and cannot import this package.

## The shared contract

### Three stores, and what they persist

Each store is a class taking `(storage, signal)` in its constructor — so a test can build one over a
fake storage — and each is exported only as a singleton alongside its `I*Store` interface. The
implementation classes are not exported.

| Store           | Interface        | Keys                                                                                                                                                                    |
| --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relayStore`    | `IRelayStore`    | `chatic-relay-token` · `chatic-relay-selected-site-id`                                                                                                                  |
| `cloudStore`    | `ICloudStore`    | `chatic-cloud-delegation-token` · `chatic-cloud-token` · `chatic-selected-cloud-id` · `chatic-selected-place-id` · `chatic-invited-clouds` · `chatic-cloud-token-cache` |
| `identityStore` | `IIdentityStore` | `chatic-delegator-id` · `chatic-device-id`                                                                                                                              |

The keys stay in the file of the store that reads and writes them rather than moving to a shared
`constants.ts`: a storage key is that class's persistence contract, and nothing else may touch it.

`IIdentityStore` has exactly three members — `getDelegatorId`, `setDelegatorId`, `setDeviceId`.
**There is no `getDeviceId`**: the device id is read back through the derived identity context, not
off the store.

[`jsonSlot.ts`](../../src/session/store/jsonSlot.ts) is what each token slot is built on. It
memoizes by raw string, so re-reading an unchanged token reuses the parse — building the relay
context used to parse the same token three times.

### One signal, four kinds

```ts
export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';
```

`relay:token` and `cloud:token` are separate because the two refresh loops are: a relay refresh
arriving while a cloud session is active must not re-derive cloud-scoped consumers.

**Every write emits its kind.** This is the table
[`store/writeSignals.test.ts`](../../src/session/store/writeSignals.test.ts) locks:

| Write                                                                            | Emits                                        |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| `relayStore.saveRelayToken` · `clearToken`                                       | `relay:token`                                |
| `cloudStore.saveDelegationToken` · `saveCloudToken`                              | `cloud:token`                                |
| `relayStore.saveSelectedSiteId` · `clearSelectedSite`                            | `selection`                                  |
| `cloudStore.saveSelectedCloudId` · `saveSelectedSiteId` · `clearSelectedSite`    | `selection`                                  |
| `cloudStore.clearSession`                                                        | `cloud:token` + `selection`, in one batch    |
| `identityStore.setDelegatorId` · `setDeviceId`                                   | `identity`                                   |
| `setSessionAuthenticated` · `setSessionIdentityState` · `markSessionInitialized` | `identity`                                   |
| `rebuildSessionIdentity`                                                         | `identity`, **only when the identity moved** |
| `clearRelaySession`                                                              | `relay:token` + `identity`, in one batch     |
| `cloudStore.setCachedCloudTokens`                                                | **nothing**                                  |

The last row is the one legitimate exception and its name says so: writing the per-cloud token cache
changes no observable session state. `rebuildSessionIdentity` is the one gated writer — it compares
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

[`contextStore.ts`](../../src/session/store/contextStore.ts) assembles the three shapes a consumer
actually reads — `getGlobalSessionContext()`, `getSessionAuthSnapshot()`, `getSocketSlotContext()` —
and keeps one cache per shape. A single `sessionSignal.registerInvalidator` drops all three. Identity
state is seeded on first read rather than at module load, so importing the store does no work.

[`contexts.ts`](../../src/session/store/contexts.ts) is the read-only face of that:
`getIdentityContext`, `getActiveServerContext`, `getCloudSessionSnapshot`, `getSocketSlotContext`,
`getGlobalSessionContext`, and `getCommittedCloudId()` — which is nothing but
`cloudStore.getDelegationToken()?.cloudId ?? null`, the source of the `committed` scope view.

### The scope: three views that are supposed to disagree

[`ActiveScope`](../../src/session/scope/ActiveScope.ts) takes three readers in its constructor and
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

### The use cases

Each is a class with a single exported singleton; the class itself stays private.

| Singleton              | Methods                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaySession`         | `initialize` · `persistDeviceId` · `loginGuestByDevice` · `loginUser` · `loginByOAuthCode` · `loginBySocialToken` · `loginByToken` · `clearAndRedirect` · `registerLogoutCallback` |
| `cloudSession`         | `switchTo` · `clearStores` · `applySelectedSite`                                                                                                                                   |
| `sessionAuthAdapter`   | `getAuthRegistration(kind)` · `signAuth(kind, target?)` · `commitRefreshedToken(kind, view)`                                                                                       |
| `credentialFreshness`  | `timeToExpiry(owner, now?)` · `isStale(owner, now?)`                                                                                                                               |
| `logoutStorageSweeper` | `sweep()`                                                                                                                                                                          |

Two more are plain functions because they are shared by two callers with different policies:
`issueCloudTokens(cloudId, { allowCache })` and `reissueCommittedCloudTokens()` in
[`cloudTokens.ts`](../../src/session/auth/cloudTokens.ts). **The cache flag is the whole point.**
Entering a cloud may replay a cached exchange; renewing in place must not, because the cached copy is
the one that is expiring. For the same reason a cloud writeback refreshes the cache too — a cache
left behind the live token makes the _next_ entry restore a credential that was already replaced.

`relaySession.clearAndRedirect()` clears both relay and cloud stores and redirects to `/?logout=1`.
It performs no server-side logout; notifying the sockets is
[`logoutSession`](../auth/README.md)'s job, one layer up. `logoutStorageSweeper.sweep()` is the other
half of that flag: on the next document load it wipes the `@`-prefixed storage namespace, preserving
only the i18n key and `@chatic/config.*`, then drops `chatic-oauth-provider` from both storages.
Without it, tokens belonging to the account that just signed out survive the redirect.

[`authActions.ts`](../../src/session/auth/authActions.ts) is an adapter, not a naming layer: three
apps call `registerUserWithInviteCode` / `fetchInviteInfoWithCode` with positional arguments and the
repository takes an object. Keeping that translation in one place is its entire reason to exist.

### The React surface

| Folder                   | Count | Names                                                                                                                                                             |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/session/readers/` | 5     | `useGlobalSession` · `useSessionAuth` · `useSessionIdentity` · `useSessionSelection` · `useRuntimeProfile`                                                        |
| `hooks/session/actions/` | 5     | `useSiteSwitch` · `useSwitchCloudSession` · `useLogoutCloudSession` · `useSessionLogout` · `useInviteFlow`                                                        |
| `hooks/auth/`            | 8     | `useLogin` · `useLoginRelaySocial` · `useLoginRelayGuestByDevice` · `useRegisterUser` · `useRegisterUserV2` · `useFindAlias` · `useVerifyAlias` · `useInviteInfo` |
| `hooks/app/`             | 5     | `useRelaySessionInit` · `useRelaySessionKeepAlive` · `useDynamicDeviceId` · `useSessionStalenessGuard` · `useCloudCredentialGuard`                                |

The first three readers are `useSyncExternalStore(subscribeSessionSignal, …)`; `useSessionSelection`
derives from `useGlobalSession`. Twenty of these 23 are on the package barrel; the three that are not
are `useRegisterUser` (superseded by `useRegisterUserV2`, still reachable in-package) and
`useRelaySessionInit` / `useRelaySessionKeepAlive`, which belong to the host rather than to an app.
`useRuntimeProfile` is on the barrel but reached by concrete path, because
`hooks/session/index.ts` publishes only the other four readers.

The two guards in `hooks/app/` take an app-supplied policy and are documented with the renewal they
drive — [docs/auth/](../auth/README.md#the-two-guards).

[`hooks/mutationKeys.ts`](../../src/session/hooks/mutationKeys.ts) holds `SWITCH_SITE_MUTATION_KEY`
and `SWITCH_CLOUD_MUTATION_KEY`. They are public so an app can observe a switch in flight globally —
`apps/web` uses them to stop periodic background sync while one is running.

## Usage

### Reading the session

```ts
// In React — subscribes to the signal, re-renders only on the kinds it needs.
const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
const { userId, isAuthenticated } = runtime.session.useSessionIdentity();

// Outside React — the same derived contexts, read synchronously.
const { cloud, identity } = getGlobalSessionContext();
```

### Adding a store write

1. Put it on the `I*Store` interface first. The interface is the contract; the class is an implementation detail that is never exported.
2. Emit the `SessionSignalKind` the write moves, in the store method itself. A writer that does not emit is invisible to every reader.
3. If it is a pure cache write that changes nothing observable, emit nothing — and say so in the method name, the way `setCachedCloudTokens` does.
4. Add the row to [`writeSignals.test.ts`](../../src/session/store/writeSignals.test.ts). That file is the table above; if the two disagree, the table is wrong.
5. If a use case performs several writes, wrap it in `sessionSignal.batch()` so subscribers see one change.

### What not to do

- **Do not import a sibling folder from `store/**`.\*\* Lint will stop you, and the reason is not style: a store that can call a use case can be re-entered mid-write.
- **Do not read `@chatic/config` from `session/**`.** Take the value as an injected function. Beyond the layering, `import.meta`breaks ts-jest under`module: commonjs`, and this hub's tests run there.
- **Do not collapse the three scope views**, and do not add `sid` back into `deriveSelectedContext`. Both have a specific failure attached (cache poisoning; a write tagged for the wrong site).
- **Do not push a context into the scope.** `setContext` is a no-op on purpose. If a caller needs a different partition for one call, it passes `contextOverride` to the repository method.
- **Do not add a second source for local session state.** Anything derivable belongs in `contextStore`; a parallel `localStorage` entry diverges and then two answers exist.

## Notes for implementers and tests

- Each store takes its storage in the constructor, so a test builds one over a fake `StorageLike` rather than mocking a module. That is what `writeSignals.test.ts` and `contextStore.test.ts` do.
- `sessionSignal` is a process singleton. A test that asserts fan-out counts must unsubscribe, because listeners survive between cases.
- `msUntilExpiration` lives in `store/expiry.ts`, not in `auth/utils/`, because the store needs it too and the lint rule bans `store → auth`. Its `null` means "unmeasurable", which is explicitly **not** stale.
- The identity context is seeded lazily. A test that asserts the initial state must read it once before asserting no signal fired.
- `relayStore.getBackend()` throws until `configureSessionStore()` has run, so any test touching relay endpoints has to call it (or inject resolvers) first.

## Naming history (2026-09)

Old names still appear in source comments and in sibling modules' docs.

| Old                                        | Now                                              |
| ------------------------------------------ | ------------------------------------------------ |
| `intent` (the first scope view)            | `selected` · `deriveSelectedContext`             |
| `RelayCore` · `CloudCore` · `IdentityCore` | `IRelayStore` · `ICloudStore` · `IIdentityStore` |
| `logoutRelaySession()`                     | `relaySession.clearAndRedirect()`                |
| `logoutCloudSession()` (the store half)    | `cloudSession.clearStores()`                     |
| `RuntimeBinding` / `useRuntimeBinding`     | `RuntimeSocketSlots` / `useRuntimeSocketSlots`   |

The last two rows are the same change: the global names `logoutSession` and `logoutCloudSession` now
belong exclusively to the [socket-notifying versions](../auth/README.md#ending-a-session), because
those are the ones an app should reach for.

## Further reading

- [docs/auth/](../auth/README.md) — what consumes `sessionAuthAdapter` and `credentialFreshness`, and the policy that ends a session
- [docs/socket/](../socket/README.md) — how `useRuntimeSocketSlots` turns this state into two socket slots
- [docs/data/](../data/README.md) — what `ActiveScope` is injected into
- [`libs/data`](../../../data/README.md) — `DataContextProvider`, `scopeGuards`, and `contextOverride`
