# sync — what keeps a cache current

The SDK ships a sync engine: a scheduler that polls, listens for push, catches up after a reconnect,
and hands the results to per-domain plans. `SyncManager` is the app-layer orchestrator around it. It
decides **how many engines exist** (one per bound socket slot), **which engine runs a target** (the
one of the cloud the target belongs to), **how long a target lives** (ref counting, with a grace
window), and **what a plan does with a frame** (write it into its own cloud's partition).

A screen never touches any of that. It mounts a hook.

Beside it, `BackgroundReceiver` keeps the clouds the user is **not** looking at current — their room
lists, last messages and read positions — with one delta a minute each. That is a different job from
a target's, and it is described under [Background receive](#background-receive).

## Layout

```text
socket/sync/                          10 source files, 9 tests
├── SyncManager.ts          436 lines  the class — 10 public methods
├── plans.ts                280 lines  createSyncPlans — the five app-domain plans
├── BackgroundReceiver.ts   285 lines  the receive loop of every bound slot that is not the active one
├── backgroundDeltas.ts                subscribeBackgroundDeltas — who hears that a background delta came back
├── types.ts                           SyncWatchEntry · SyncTargetListing · SyncRegisterOptions · SyncRuntimeOptions · SyncManagerDeps · ISyncManager · BackgroundReceiverDeps · BackgroundReceiveRepositories · BackgroundReceiveTrigger · BackgroundDelta
├── constants.ts                       UNREGISTER_GRACE_MS · BACKGROUND_RECEIVE_INTERVAL_MS · BACKGROUND_RECEIVE_DEBOUNCE_MS · BACKGROUND_PLACE_REFRESH_MS
├── refusedChannels.ts                 what the server refused, for a room to read
├── runtime.ts                         getSyncManager — the one creation point · startBackgroundReceive · refreshBackgroundClouds
├── index.ts                           the `sync` facade group
└── hooks/useSyncTarget.ts             useSyncTarget + the three named wrappers
```

`perSlotSync.test.ts` drives the real manager and the real plans over faked slots and a faked data
runtime; it is the one test that shows a target staying with its cloud end to end.
`backgroundReceiveScenario.test.ts` does the same for background receive, with the real socket
manager and the real data manager on IndexedDB: a burst of pushes on a cloud off screen becomes one
delta written into that cloud's partition, entering it continues from the cursor the loop left, and
a delta asked for by name is announced once the rows an unread count reads are in that partition.

`runtime.ts` is a separate file from `socket/runtime.ts` for one reason: `socket → socket/sync` was
an import edge, and it closed a cycle that ran back through the data layer.
[`importCycleAbsence.test.ts`](../../src/importCycleAbsence.test.ts) is what keeps it cut.

## Responsibilities

`SyncManager` owns: one `createDeviceRuntime` per bound slot; starting each cloud's targets on its
slot's runtime; the ref-counted target registry and its grace window; retiring targets when the
account changes; and a domain-agnostic `updateLocalSnapshot` pass-through.

It does **not** own: token refresh, socket bootstrap, repository merge policy, or chat prime. It does
not watch the active slot either — nothing here depends on which slot is active. (The receive loops
below do watch it: whether a cloud is on screen is exactly what decides whether its loop runs.)

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

`register(target, { cid })` increments a ref and returns a one-shot dispose. The shorthands take the
same options as a third argument — `registerJoin(id, intervalMs?, { cid })` and its siblings — and the
apps' own registrations name their cloud and build their ids from that cloud's uid
(`session.useUidInCloud(cid)`), so none of them lands on whichever cloud is selected when an effect
happens to run. There is **no public
`startSync`/`stopSync`** — `startTarget` and `stopTarget` are private, and the ref count is the only
thing that calls them. The key is `${cid}|${type}:${id}`, so two screens watching the same channel of
the same cloud share one target — and the same channel id in two clouds is two targets, with their own
ref counts and grace, because ids are unique only inside one cloud.

Each entry is tagged with the `cid` and `uid` it was registered under:

- **cid** — the cloud the target belongs to: the partition its plan writes into and the slot whose runtime runs it. A caller may name it; the default is the cloud the **session has selected** at registration, because that is the cloud whose rows the registering screen renders. It is fixed for the entry's life. A switch pre-applies the selection before the incoming slot is bound, so the home screen registers the incoming cloud's targets while the outgoing slot is still the active one — those targets simply wait for their own slot (or start at once, when that cloud already holds a background slot). That default is only right if a screen never renders one cloud's rows under another's selection, so the apps' list hooks hand out only the selected cloud's rows, filtered at render: the observer reset that swaps the list runs in an effect, one render after the selection moves, and in that render a row would register its id under the incoming cloud — whose background slot is already up to receive it. (Tagged with the active socket's cid instead, a cloud place once ran `place.get` on the relay, which answers `404 not found @doGet(sites/…)` since the relay has no such site.) A word that is not a cloud id (`'relay'`, `'cloud'`, empty) throws before anything is recorded.
- **uid** — when the caller names the cloud, the uid this account has **in that cloud** (`getUidInCloud(cid)`: the relay token's for the relay, otherwise the token that cloud's socket signs with, falling back to the identity recorded when it was issued), because every cloud gives the account its own uid. When the caller names none, the **session's** uid: such a caller built the target from the session — `join` ids used to be `<channel>@<session uid>` in the apps, which now name the cloud instead — and the two agree whenever the selected cloud is the committed one. In a switch window they do not (the session still has the outgoing cloud's uid), and the session tag is what retires that registration at the commit instead of letting its stale id outlive it. An account change **retires** the targets whose cloud no longer knows the account by that uid, rather than merely refusing to restart them. Guest-to-social promotion re-authenticates the _same_ socket, so no slot notification fires and nothing else notices; the running targets keep polling ids built from the guest's uid and the server answers each with `403 not allowed to read join`. Waiting for the hook to unmount is not enough either, because the grace below holds for 30 seconds. The retirement is immediate and bypasses the grace on purpose — the grace exists to survive a screen transition re-registering the _same_ target, and after an account change the ids are different ones. A target with a null uid is never started, and the mismatch warning is logged once per instance, because a poll-rate log is a flood.

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

**A failed cache write is logged, not retried here.** The sync library advances its own snapshot
before it calls a plan's callback and ignores what the callback returns, so a write that rejects
cannot be handed back to the plan for another try. `plans.ts` routes every one of those writes
through one helper that catches the rejection and logs it (`logger.error('SYNC', …)`) instead of
leaving an unhandled promise. Only a new chat message has a way back, through paths that already
exist: the next `chat.feed` refetch, and on desktop the room's freshness check, which refetches the
newest page when the channel record's newest `chatNo` runs ahead of the cache. A failed edit or delete
of an older message, and a failed channel, place, profile or join write, stay stale until the server
changes that record again. There is no retry queue.

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

## Background receive

A cloud the user is not looking at still has a socket (every joined cloud keeps one), but nothing on
it would otherwise ask the server anything: its screens are not mounted, so no target is
registered, and the app's own background sync only polls the cloud on screen. Its cache would stop
at the moment the user left it — the room list, the last message of each room, the read positions
an unread count is computed from.

`BackgroundReceiver` gives **every bound slot that is not the active one** a loop: the background
clouds, and the relay while a cloud is on screen. The active slot's loop exists but does nothing; the
app keeps that cloud current.

### What a loop asks

One thing: `channel.sync` since its cursor, through **that cloud's scoped graph**
(`getScopedRepositories(cid)`). `channel.sync` spans the whole cloud, and each room in its answer
carries the room's last message, its latest `chatNo` and this account's `$join` — which is
everything a room list and an unread count need. The rows land in that cloud's partition, under the
uid the account has there, and so does the cursor.

Beside it, at most once every ten minutes and on its first delta, the loop re-reads the cloud's
place list (`user.mysite`): a room is listed under its place, so a list that never learned a new
place would hide that place's rooms. A failed place read is retried on the next delta.

Nothing else. Not `user.profile`, not the profile delta, not per-room targets, and not chat bodies —
a room is read when it is opened, and opening it makes its cloud the active one. The `chat.sync`
payload is the message itself, but applying it would mean running the chat plan for rooms no screen
has asked for.

### When

| Trigger                                           | Why                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The slot turns verified (a rising edge)           | a new connection, a reconnect, or a re-authentication — whatever arrived while it was down is still owed                                                                                                                                                                                          |
| Every 60 seconds while verified                   | the same minute the apps' own background sync polls the cloud on screen at                                                                                                                                                                                                                        |
| A `chat.sync` push on that slot, debounced 300 ms | the server announcing a message; a burst of them is one delta                                                                                                                                                                                                                                     |
| The slot stops being the active one               | after the 300 ms debounce, if it was never on screen since its slot bound and has not received for a full interval — the relay a cloud boots over, say; otherwise on the next tick. Debounced because the binder moves the pointer off a cloud and tears down a slot it does not keep in one pass |
| `refreshBackgroundClouds()`                       | the app's foreground signal: timers froze while the app was suspended, and pushes went nowhere                                                                                                                                                                                                    |
| `refreshBackgroundClouds(cid)`                    | the app heard of a message for that one cloud another way — a push — which its socket was not sent (see below). Debounced like a push, and it re-reads the place list too; the others are not asked                                                                                               |

One delta runs at a time per cloud. A trigger that lands while one is in flight asks for exactly one
more once it finishes, so a push that arrives mid-request is not lost and a storm of them is not a
storm of requests.

**The cost** is one `channel.sync` per background cloud per minute, plus at most one per burst of
pushes, plus a `user.mysite` every ten minutes — against the ping the socket already sends. With the
cap of five background clouds and the relay, the timer sends at most six a minute per device, plus
one for each cloud held outside the cap for a write in flight. At boot every one of them verifies at
once and asks for its delta and its place list together: up to a dozen requests in the first second.
A loop whose slot is rebuilt mid-request drops that request's result instead of racing the new
loop's.

`refreshBackgroundClouds` and `subscribeBackgroundDeltas` are the app-facing pieces. apps/web calls
the first from its foreground wake kick, beside `recoverUnverifiedSockets`, inside the same throttle,
and with a cloud id when a push names a cloud off screen. desktop-web does neither yet: its own
background sync has no foreground trigger either, and a desktop window is not suspended the way a
WebView is.

### Hearing that a delta came back

`subscribeBackgroundDeltas(listener)` hears every background delta that was answered, as
`{ cid, requestedAt }`. It exists for one kind of consumer: something that learned of a message
before that cloud's cache did, and holds a mark only the cache can retire. apps/web's cross-cloud
push mark is that consumer — a push arrives, the mark goes on, the app asks that cloud now, and the
mark comes off with the first delta that can be relied on to carry the message.

`requestedAt` is when the answered request was **sent**, not when it came back, because that is the
only moment that answers "can this delta hold the message?": a request sent before the push landed
may have been answered without it. A request folded into one already in flight (see above) goes
out afterwards with its own time, so a kick is never answered by the earlier request's reply.

An announcement is made under the same condition as the cursor write — the loop still owns its slot
and the account in that cloud has not changed. A failed delta announces nothing.

A delta asked for by name (`'kick'`) also re-reads the cloud's place list, outside its ten-minute
turn, and is announced only once **both** have answered — a failed place read means no
announcement. The reason is the consumer: a list filters out rooms whose place it does not know,
so a message into a place the cache has not learned yet would be in storage and on no screen, and
the mark waiting on the announcement would come off with nothing to show for it. A kick folded into
a run already in flight, or into a pending push debounce, keeps its kind. The listener set
lives outside the receiver, so a subscriber keeps hearing across the connection host restarting the
receiver, and a listener that throws is logged rather than reported as a failed delta.

### Handing a cloud over

The loop and the app read **the same cursor** — `channel-sync:<cid>` in that cloud's own partition.
So a switch onto a cloud whose loop has been running finds its rooms already cached and its cursor
already advanced; the app's first delta there asks for what changed since the loop's last answer, not
for the whole list. The loop stops the moment the pointer arrives. Leaving a cloud starts its loop,
and the clock for its first tick starts at the moment it left: the app kept it current until then.

At the moment of a switch the loop's last delta and the app's first one can overlap. Both write the
same rows idempotently; the worst case is that the older answer writes the cursor last and the next
delta repeats a few seconds of changes.

The cursor has to reach the right partition for any of this to hold. The local data sources are
shared by every graph and, left to themselves, fall back to the selected cloud — which is why
`SyncMetaRepository` hands its own graph's `cid`/`uid` down on every call. Before it did, a cursor
written through cloud A's graph while cloud B was on screen landed in B's partition, and entering A
found none.

**Guards.** A loop with no uid in its cloud asks nothing: there is no partition to write into. If the
account changes while a delta is on its way, the rows are written (under the context the request
captured) but the cursor is left alone, and the next delta asks again. A failed delta leaves the
cursor where it was and is logged once per failing streak — at one request a minute, a cloud that is
down would otherwise log forever.

### What the server has not confirmed

Two backend questions decide how current this can be, and neither is answered by the protocol types:

- whether `chat.sync` is sent to a member who is not looking at that room — without it, a
  background cloud learns of a message on the next tick, within a minute;
- whether `channel.sync` carries a `$join` that another device's read has moved — without it, an
  unread count shrinks only when that cloud is entered.

The loop is correct either way; what changes is how soon.

**Measured on the dev servers (2026-09-29), one account on two devices.** With the receiving device
on another cloud, messages sent into a room of the background cloud from the account's other
device produced **no** `chat.sync` on the background socket: the receive log shows only `verified`,
`interval` and `foreground` triggers, never `push`, and each message reached the cache on the next
60-second tick (about 40–45 seconds after it was sent). The same deltas carried the room's `$join`
moved by the sending device. So for the account's own other devices the answer to the first
question is no and to the second is yes. Whether another **member's** message is pushed to a
background socket was not measured — that needs a second account in the same cloud — and until it
is, a minute is the latency to plan for.

## Usage

### Registering from a screen

```tsx
const { prime, retryPrime } = runtime.sync.useChatSync(channelId); // register + prime
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
const off = getSyncManager().registerChannel(channelId, undefined, { cid: 'cloud-a' });
const offA = getSyncManager().register({ type: 'channel', id: channelId }, { cid: 'cloud-a' });
// No cid: the cloud selected when this runs — only for a caller that cannot know its cloud.
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

`useChatSync` returns where the prime stands, `{ prime, retryPrime }`. A cold room's cache reads
empty until its first page is written, so a screen cannot tell "no messages yet" from "not loaded
yet" by the list alone:

- `pending` — the slot is not verified yet, or the cache read or first page is in flight.
- `ready` — the cache already held the room, or the first page was written. The list observer
  re-reads after the write resolves, so a screen still gives an empty list a moment to fill.
- `failed` — the cache read or the first page threw. `retryPrime` runs the prime again.

The status is per room and cloud: opening another room starts it at `pending`. Callers that only
need the sync (a sidebar preview) ignore it.

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
