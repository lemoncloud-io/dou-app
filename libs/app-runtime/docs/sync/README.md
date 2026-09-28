# sync — what keeps a cache current

The SDK ships a sync engine: a scheduler that polls, listens for push, catches up after a reconnect,
and hands the results to per-domain plans. `SyncManager` is the app-layer orchestrator around it. It
decides **how many engines exist** (one per bound socket slot), **which engine runs a target** (the
one of the cloud the target belongs to), **how long a target lives** (ref counting, with a grace
window), and **what a plan does with a frame** (write it into its own cloud's partition).

A screen never touches any of that. It mounts a hook.

## Layout

```text
socket/sync/                      8 source files, 5 tests
├── SyncManager.ts   421 lines  the class — 10 public methods, 12 private
├── plans.ts         257 lines  createSyncPlans — the five app-domain plans
├── types.ts                    SyncWatchEntry · SyncTargetListing · SyncRegisterOptions · SyncRuntimeOptions · SyncManagerDeps · ISyncManager
├── constants.ts                UNREGISTER_GRACE_MS
├── refusedChannels.ts          what the server refused, for a room to read
├── runtime.ts                  getSyncManager — the one creation point
├── index.ts                    the `sync` facade group
└── hooks/useSyncTarget.ts      useSyncTarget + the three named wrappers
```

`perSlotSync.test.ts` drives the real manager and the real plans over faked slots and a faked data
runtime; it is the one test that shows a target staying with its cloud end to end.

`runtime.ts` is a separate file from `socket/runtime.ts` for one reason: `socket → socket/sync` was
an import edge, and it closed a cycle that ran back through the data layer.
[`importCycleAbsence.test.ts`](../../src/importCycleAbsence.test.ts) is what keeps it cut.

## Responsibilities

`SyncManager` owns: one `createDeviceRuntime` per bound slot; starting each cloud's targets on its
slot's runtime; the ref-counted target registry and its grace window; retiring targets when the
account changes; and a domain-agnostic `updateLocalSnapshot` pass-through.

It does **not** own: token refresh, socket bootstrap, repository merge policy, or chat prime. It does
not watch the active slot either — nothing here depends on which slot is active.

### Runtimes follow the slot, and so do targets

- **A runtime is per slot** (`subscribeSlotClients`). It owns that connection's connect-driven `device.save` and its keepAlive / reconnect / rotation controllers, so it has to live as long as the slot — not as long as the slot is _active_. An active-only runtime stopped the relay runtime the moment a cloud came up, so a relay reconnect produced a connection with no device linked: relay-pinned writes failed with `400 no device linked`, and the auth gate, which waits for `device.save:ok`, stopped relay re-authentication with them.
- **A target runs on the runtime of its own cloud's slot**, and only there. When that slot binds, the cloud's registered targets start on the new runtime; when it is torn down, they go down with it and their registry entries wait for the next slot of the same cloud. The active pointer moving changes nothing: a switch from A to B does not stop A's targets or start them on B.

Targets used to follow the active slot: on every active change the outgoing runtime stopped all its
targets and the whole registry was replayed onto the incoming one. That only worked while a target's
cloud and the active slot's cloud were the same thing, and the switch window — selection flipped,
old slot still active — needed a guard at every step to keep one cloud's targets off the other's
socket. Once a target names its cloud and runs on that cloud's slot, there is no window to guard.

A slot binding drops that cloud's **grace-period** entries (refs 0) instead of starting them.
Starting one would restart polling for a screen that has already left; leaving it in place is worse —
a re-registration would take the merge path, which does not start, so that target would never run on
the new runtime.

**Plans are built per runtime, never shared, and built for that slot's cloud.** Two schedulers can
be live at once and a plan instance holds snapshot state; `buildSyncPlans(slot)` gets the slot's key
so its plans know which cloud they write for.

## The shared contract

### The registry

`register(target, { cid })` increments a ref and returns a one-shot dispose. There is **no public
`startSync`/`stopSync`** — `startTarget` and `stopTarget` are private, and the ref count is the only
thing that calls them. The key is `${cid}|${type}:${id}`, so two screens watching the same channel of
the same cloud share one target — and the same channel id in two clouds is two targets, with their own
ref counts and grace, because ids are unique only inside one cloud.

Each entry is tagged with the `cid` and `uid` it was registered under:

- **cid** — the cloud the target belongs to: the partition its plan writes into and the slot whose runtime runs it. A caller may name it; the default is the cloud the **session has selected** at registration, because that is the cloud whose rows the registering screen renders. It is fixed for the entry's life. A switch pre-applies the selection before the incoming slot is bound, so the home screen registers the incoming cloud's targets while the outgoing slot is still the active one — those targets simply wait for their own slot (or start at once, when that cloud already holds a background slot). That default is only right if a screen never renders one cloud's rows under another's selection, so the apps' list hooks hand out only the selected cloud's rows, filtered at render: the observer reset that swaps the list runs in an effect, one render after the selection moves, and in that render a row would register its id under the incoming cloud — whose background slot is already up to receive it. (Tagged with the active socket's cid instead, a cloud place once ran `place.get` on the relay, which answers `404 not found @doGet(sites/…)` since the relay has no such site.) A word that is not a cloud id (`'relay'`, `'cloud'`, empty) throws before anything is recorded.
- **uid** — when the caller names the cloud, the uid this account has **in that cloud** (`getUidInCloud(cid)`: the relay token's for the relay, otherwise the token that cloud's socket signs with, falling back to the identity recorded when it was issued), because every cloud gives the account its own uid. When the caller names none, the **session's** uid: such a caller built the target from the session — an app's `join` ids are `<channel>@<session uid>` — and the two agree whenever the selected cloud is the committed one. In a switch window they do not (the session still has the outgoing cloud's uid), and the session tag is what retires that registration at the commit instead of letting its stale id outlive it. An account change **retires** the targets whose cloud no longer knows the account by that uid, rather than merely refusing to restart them. Guest-to-social promotion re-authenticates the _same_ socket, so no slot notification fires and nothing else notices; the running targets keep polling ids built from the guest's uid and the server answers each with `403 not allowed to read join`. Waiting for the hook to unmount is not enough either, because the grace below holds for 30 seconds. The retirement is immediate and bypasses the grace on purpose — the grace exists to survive a screen transition re-registering the _same_ target, and after an account change the ids are different ones. A target with a null uid is never started, and the mismatch warning is logged once per instance, because a poll-rate log is a flood.

Remembered channel refusals (`refusedChannels`) are cleared when the **session's** uid changes. A
refusal is keyed by channel id alone, and ids repeat across clouds and accounts; the session uid
changes with both, so it is the one signal that covers them.

`UNREGISTER_GRACE_MS` is **30 seconds**. A screen transition unregisters the old screen's target and
registers the next one's milliseconds apart, and stopping immediately makes the scheduler discard the
target **and its snapshot** — so every re-registration cost one immediate poll plus one
"everything changed" cache write, because there was no snapshot to compare against. That is what a
2026-08 audit found behind 228 `save:channel` and 632 `save:join` writes. Re-registering inside the
window merges into the live target through the ordinary `register` path: no restart, no re-poll. The
window is wide enough for a room-to-home round trip and narrow enough that a left channel does not
poll in the background for long — and a target in grace keeps its idle backoff, so the residual cost
is a request or two.

### The five plans

`createSyncPlans(slot)` returns exactly five, in this order: `ChannelSyncPlan`, `PlaceSyncPlan`,
`ProfileSyncPlan`, `ChatSyncPlan`, `JoinSyncPlan`. Each callback writes through a repository —
`cacheWrite`, `cacheWriteMany`, `cacheDelete` — of the **slot's own cloud's scoped graph**
(`getDataManager().getScopedRepositories(cid)`), under that graph's context: that cloud, and the uid
this account has there. Not the selected cloud's graph: a frame from a slot is data of that slot's
cloud whatever the screen is showing. See [docs/data/](../data/README.md#scoped-repository-graphs)
for what a scoped graph is.

**`DeviceSyncPlan` is not one of them.** `createDeviceRuntime` injects its own and owns
`device.save`; these five ride along as `extraSyncPlans`.

`ChatSyncPlan` is the shape apart. It has `onApply` (a new-message delta, ascending) and `onUpdate`
(a change to a `chatNo` already resolved — `hidden: true` is a deletion, anything else an edit) and
deliberately **no `onRemove`**: chat history is kept. Every other plan spreads
`resetSnapshotOnConnected: false`, so a reconnect resumes from its baseline instead of refetching
everything.

**There is no cross-cloud frame guard any more.** Plans used to write into the selected partition
and drop any frame whose socket's cloud disagreed with it — during a switch, with the selection
flipped and the outgoing socket still attached, that kept the outgoing cloud's rows out of the
incoming cloud's partition, but it also lost them, and it only worked while targets ran on the active
slot alone. A plan now writes through its own slot's cloud's graph, so a frame and the partition it is
written into cannot disagree. What keeps that true is the graph itself: `DataManager.test.ts` pins
that a scoped graph is never the app graph and that its context names its own cloud.

The slot's cloud arrives as `createSyncPlans`'s argument rather than an import — `plans.ts` reading
`socket/runtime` is what closed the cycle this module was split to cut.

### `updateLocalSnapshot` is the bridge, and it is domain-agnostic

A registered target and a direct gateway call are two different things, and the word "sync" is used
for both:

|                               | Who triggers it              | What it is                                                                    |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `register*` / a sync plan     | the scheduler, automatically | Poll, push and reconnect catch-up, maintained for as long as it is registered |
| a gateway's `.sync` / `.feed` | the app, explicitly          | One cursor-based delta or page                                                |

They do not connect on their own. A manual fetch updates the cache; it does **not** move the plan's
baseline, so the next `onConnected` or push catches up from zero and writes everything again.
`updateLocalSnapshot(target, snapshot)` is what closes that. `SyncManager` passes it straight
through to the runtime of the target's cloud slot — `updateLocalSnapshot(target, snapshot, { cid })`,
the selected cloud by default, a no-op while that slot is not bound. It knows nothing about the
snapshot's shape.

Per domain the baseline is `{ tick }` for device, an `updatedAt`-shaped value for
channel / place / profile / join, and `{ id, lastNo, minNo, messages }` for chat.

## Usage

### Registering from a screen

```tsx
runtime.sync.useChatSync(channelId); // register + prime
runtime.sync.useChannelSync(channelId);
runtime.sync.usePlaceSync(placeId);
```

Each registers on mount and disposes on unmount, under the **selected cloud**, and each re-runs on
three things: the target key (`type:id:intervalMs`), the selected cloud, and the **uid in that
cloud**. The cloud is a dependency because a component that stays mounted across a switch renders the
next cloud's rows, so its target has to become the next cloud's too — the new registration waits for
that cloud's slot, the old one leaves through the grace window. The uid is a dependency even though
it is not in the key — a target is tagged with the uid it was registered under and stops syncing when
that no longer matches, so without re-running the registration would sit blocked for the rest of the
mount, turning a visible 403 storm into an invisible dead sync.

The generic `useSyncTarget` is not on the package barrel: every app consumer picks one of the three
named targets. It is on the in-package `socket/` barrel, which is how the three wrappers reach it.

Outside React, `getSyncManager().register*` does the same and returns the dispose:

```ts
const off = getSyncManager().registerChannel(channelId); // the selected cloud
const offA = getSyncManager().register({ type: 'channel', id: channelId }, { cid: 'cloud-a' });
off();
offA();
```

The manager's ten public methods are `register`, the six typed sugars
(`registerDevice`/`Channel`/`Chat`/`Place`/`Profile`/`Join`), `updateLocalSnapshot`, `listTargets` and
`destroy`.

### Priming a room

`ChatSyncPlan.run` is a no-op — chat is event-driven — so registering a chat target loads nothing by
itself. `useChatSync` therefore does two things, and they are both required:

1. Read the durable chat cache, take its highest `chatNo`, and call `updateLocalSnapshot`. The cache _is_ the cursor; there is no separate meta cursor for chat.
2. Fetch a first page **only when the cache is cold**. The plan never backfills past history, so a cold room renders nothing without it.

Both are about the target's cloud: they are gated on **that cloud's slot** being verified
(`useSlotVerified`), not on the active slot, which is what makes them re-run after that slot's
reconnect or re-authentication; the cache read and the first page go through its scoped graph; and
the baseline goes to its runtime. That gate replaced an earlier re-prime driven by the manager's
replay path.
Registration and prime are safe to overlap: chat rows merge idempotently by `chatNo`, so it does not
matter whether a message arrived by push or by page.

### What not to do

- **Do not call `createDeviceRuntime` outside this module.** One runtime per slot is the contract, and a second one means two schedulers polling the same targets.
- **Do not build a plan instance and share it between runtimes.** Plans hold snapshot state and relay and cloud can both be live.
- **Do not write a frame through `getRepositories()`.** That graph follows the selection; a plan's frame belongs to its slot's cloud.
- **Do not fetch through a gateway and skip `updateLocalSnapshot`.** The next reconnect will refetch everything you just fetched.
- **Do not put domain knowledge into `SyncManager`.** Chat prime lives in the chat hook precisely because it needs a chat policy and a repository; the manager stays domain-agnostic so a new domain is a plan, not a branch.
- **Do not register from a component and expect it to survive the route.** Registration belongs to whatever screen owns the data; observation can live wherever it likes.
- **Do not remove the grace window** to make a test deterministic. Advance timers past it instead — the window is the fix for a measured write storm.

## Notes for implementers and tests

- `SyncManagerDeps` is an injection seam for every collaborator: `buildSyncPlans`, `getUid(cid)`, `getSessionUid`, `getCid`, `subscribeSession`, `createRuntime`, `buildTargetKey`, `runtimeOptions`. `SyncManager.test.ts` builds one over fakes rather than mocking the SDK.
- The grace window uses real timers, wrapped in `unrefTimer` so a pending stop cannot keep a Node process (or a jest run) alive.
- `getSyncManager()` is a lazy singleton over `getSocketManager()`, with no reset seam. Construct `new SyncManager(fakeManager, deps)` in a test.
- `SyncManager` subscribes to two things in its constructor — slot clients and the session signal — and each has a matching unsubscribe held for `destroy()`. A third subscription needs the same treatment.
- The uids and the selected cid are read per call and never captured. The whole job of those readers is to notice a change.

## Further reading

- [plans.md](./plans.md) — what the SDK scheduler underneath does, and the behaviours only its source shows
- [docs/socket/](../socket/README.md) — `subscribeSlotClients` and slot keys
- [docs/data/](../data/README.md) — the scoped repository graph every plan writes through
- [`libs/data`](../../../data/README.md) — the repositories every plan callback writes through
