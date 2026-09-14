# sync — what keeps a cache current

The SDK ships a sync engine: a scheduler that polls, listens for push, catches up after a reconnect,
and hands the results to per-domain plans. `SyncManager` is the app-layer orchestrator around it. It
decides **how many engines exist** (one per bound socket slot), **which of them targets follow** (the
active one only), **how long a target lives** (ref counting, with a grace window), and **what a plan
does with a frame** (write it to a repository, unless it came from the wrong cloud).

A screen never touches any of that. It mounts a hook.

## Layout

```text
socket/sync/                      7 source files, 3 tests
├── SyncManager.ts   421 lines  the class — 10 public methods, 16 private
├── plans.ts         228 lines  createSyncPlans — the five app-domain plans
├── types.ts                    SyncWatchEntry · SyncRuntimeOptions · SyncManagerDeps · ISyncManager
├── constants.ts                UNREGISTER_GRACE_MS
├── runtime.ts                  getSyncManager — the one creation point
├── index.ts                    the `sync` facade group
└── hooks/useSyncTarget.ts      useSyncTarget + the three named wrappers
```

`runtime.ts` is a separate file from `socket/runtime.ts` for one reason: `socket → socket/sync` was
an import edge, and it closed a cycle that ran back through the data layer.
[`importCycleAbsence.test.ts`](../../src/importCycleAbsence.test.ts) is what keeps it cut.

## Responsibilities

`SyncManager` owns: one `createDeviceRuntime` per bound slot; moving targets when the active slot
changes; the ref-counted target registry and its grace window; retiring targets when the account
changes; and a domain-agnostic `updateLocalSnapshot` pass-through.

It does **not** own: token refresh, socket bootstrap, repository merge policy, or chat prime.

### Runtimes follow the slot; targets follow the active slot

Two different lifetimes, and conflating them broke things:

- **A runtime is per slot** (`subscribeSlotClients`). It owns that connection's connect-driven `device.save` and its keepAlive / reconnect / rotation controllers, so it has to live as long as the slot — not as long as the slot is _active_. An active-only runtime stopped the relay runtime the moment a cloud came up, so a relay reconnect produced a connection with no device linked: relay-pinned writes failed with `400 no device linked`, and the auth gate, which waits for `device.save:ok`, stopped relay re-authentication with them.
- **Targets are on the active slot only** (`subscribeClient`). On an active change the previous runtime stops its targets but keeps running, and the registry is replayed onto the new one.

The ordering that makes the replay safe is `SocketManager`'s: for one mutation the slot notification
fires before the active notification, so the runtime a replay lands on always exists.

**Plans are built per runtime, never shared.** Two schedulers can be live at once and a plan instance
holds snapshot state.

## The shared contract

### The registry

`register(target)` increments a ref and returns a one-shot dispose. There is **no public
`startSync`/`stopSync`** — `startTarget` and `stopTarget` are private, and the ref count is the only
thing that calls them. The key is `${type}:${id}`, so two screens watching the same channel share one
target.

Each entry is tagged with the `cid` and `uid` it was registered under, and both are checked before it
starts:

- **cid** — on a replay, a target only starts when its cid matches the new client's `boundCid`. A socket that outlived its cloud must not resume the previous cloud's polling.
- **uid** — an account change **retires** the previous account's targets rather than merely refusing to restart them. Guest-to-social promotion re-authenticates the _same_ socket, so no client swap happens and nothing else notices; the running targets keep polling ids built from the guest's uid and the server answers each with `403 not allowed to read join`. Waiting for the hook to unmount is not enough either, because the grace below holds for 30 seconds. The retirement is immediate and bypasses the grace on purpose — the grace exists to survive a screen transition re-registering the _same_ target, and after an account change the ids are different ones. The mismatch warning is logged once per instance, because a poll-rate log is a flood.

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

`createSyncPlans(getBoundCid)` returns exactly five, in this order: `ChannelSyncPlan`,
`PlaceSyncPlan`, `ProfileSyncPlan`, `ChatSyncPlan`, `JoinSyncPlan`. Each callback writes through a
repository — `cacheWrite`, `cacheWriteMany`, `cacheDelete`.

**`DeviceSyncPlan` is not one of them.** `createDeviceRuntime` injects its own and owns
`device.save`; these five ride along as `extraSyncPlans`.

`ChatSyncPlan` is the shape apart. It has `onApply` (a new-message delta, ascending) and `onUpdate`
(a change to a `chatNo` already resolved — `hidden: true` is a deletion, anything else an edit) and
deliberately **no `onRemove`**: chat history is kept. Every other plan spreads
`resetSnapshotOnConnected: false`, so a reconnect resumes from its baseline instead of refetching
everything.

**Every callback is wrapped by a cross-cloud guard.** A frame whose data context disagrees with the
socket's `boundCid` is dropped before it reaches a repository, and the drop is counted by the
observation aggregator rather than logged per frame. Without it, a socket that outlived its cloud
writes the previous cloud's rows into the current cloud's partition and the screen flickers between
two places.

`getBoundCid` arrives as a function argument rather than an import — `plans.ts` reading
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
through to the runtime — it knows nothing about the snapshot's shape, and chat prime is currently its
only caller.

Per domain the baseline is `{ tick }` for device, an `updatedAt`-shaped value for
channel / place / profile / join, and `{ id, lastNo, minNo, messages }` for chat.

## Usage

### Registering from a screen

```tsx
runtime.sync.useChatSync(channelId); // register + prime
runtime.sync.useChannelSync(channelId);
runtime.sync.usePlaceSync(placeId);
```

Each registers on mount and disposes on unmount, and each re-runs on two things: the target key
(`type:id:intervalMs`) and the **account**. The uid is a dependency even though it is not in the key
— a target is tagged with the uid it was registered under and stops syncing when that no longer
matches, so without re-running the registration would sit blocked for the rest of the mount, turning
a visible 403 storm into an invisible dead sync.

The generic `useSyncTarget` is not on the package barrel: every app consumer picks one of the three
named targets. It is on the in-package `socket/` barrel, which is how the three wrappers reach it.

Outside React, `getSyncManager().register*` does the same and returns the dispose:

```ts
const off = getSyncManager().registerChannel(channelId);
off();
```

The manager's ten public methods are `register`, the six typed sugars
(`registerDevice`/`Channel`/`Chat`/`Place`/`Profile`/`Join`), `updateLocalSnapshot`, `listTargets` and
`destroy`.

### Priming a room

`ChatSyncPlan.run` is a no-op — chat is event-driven — so registering a chat target loads nothing by
itself. `useChatSync` therefore does two things, and they are both required:

1. Read the durable chat cache, take its highest `chatNo`, and call `updateLocalSnapshot`. The cache _is_ the cursor; there is no separate meta cursor for chat.
2. Fetch a first page **only when the cache is cold**. The plan never backfills past history, so a cold room renders nothing without it.

Both are gated on `isVerified`, which is what makes them re-run after a reconnect or a
re-authentication — that gate replaced an earlier re-prime driven by the manager's replay path.
Registration and prime are safe to overlap: chat rows merge idempotently by `chatNo`, so it does not
matter whether a message arrived by push or by page.

### What not to do

- **Do not call `createDeviceRuntime` outside this module.** One runtime per slot is the contract, and a second one means two schedulers polling the same targets.
- **Do not build a plan instance and share it between runtimes.** Plans hold snapshot state and relay and cloud can both be live.
- **Do not fetch through a gateway and skip `updateLocalSnapshot`.** The next reconnect will refetch everything you just fetched.
- **Do not put domain knowledge into `SyncManager`.** Chat prime lives in the chat hook precisely because it needs a chat policy and a repository; the manager stays domain-agnostic so a new domain is a plan, not a branch.
- **Do not register from a component and expect it to survive the route.** Registration belongs to whatever screen owns the data; observation can live wherever it likes.
- **Do not remove the grace window** to make a test deterministic. Advance timers past it instead — the window is the fix for a measured write storm.

## Notes for implementers and tests

- `SyncManagerDeps` is an injection seam for every collaborator: `buildSyncPlans`, `getUid`, `subscribeSession`, `createRuntime`, `buildTargetKey`, `runtimeOptions`. `SyncManager.test.ts` builds one over fakes rather than mocking the SDK.
- The grace window uses real timers, wrapped in `unrefTimer` so a pending stop cannot keep a Node process (or a jest run) alive.
- `getSyncManager()` is a lazy singleton over `getSocketManager()`, with no reset seam. Construct `new SyncManager(fakeManager, deps)` in a test.
- `SyncManager` subscribes to three things in its constructor — slot clients, the active client, and the session signal — and each has a matching unsubscribe held for `destroy()`. A fourth subscription needs the same treatment.
- The uid is read per call and never captured. The whole job of that reader is to notice a change.

## Further reading

- [plans.md](./plans.md) — what the SDK scheduler underneath does, and the behaviours only its source shows
- [docs/socket/](../socket/README.md) — `subscribeSlotClients`, the ordering guarantee, and `boundCid`
- [`libs/data`](../../../data/README.md) — the repositories every plan callback writes through, and the scope guards the cross-cloud filter uses
