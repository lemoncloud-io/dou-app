# connection — the controller, the slots it derives, the binders, and the sockets as screens read them

`connection/` keeps the socket manager in line with the session, with no React in it. From the
session's state the **connection controller** derives which slots should exist — relay, the committed
cloud, a background slot per other joined cloud — and two binders reconcile the manager with that. It
also keeps the background clouds' tokens ready and their receive loops running. The manager itself,
its slots, the active facade and their contract are `@chatic/transport`'s:
[its socket doc](../../../transport/docs/socket/README.md).

The React side is a host that starts and stops the controller, and hooks that read the sockets
through the engine's `connection` (below): [app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md).

## Layout

```text
connection/
├── connectionController.ts    createConnectionController — the two halves, and when each re-runs
├── socketSlots.ts             deriveSocketSlots · hasRelaySlot — session → slots
├── SocketBinder.ts            reconciles the slots and the active pointer
├── SocketReauthBinder.ts      re-authenticates a slot whose identity changed in place
├── types.ts                   RuntimeSocketSlot · RuntimeSocketSlots
├── socketRebootKey.ts         the identity key both binders must agree on
├── backgroundSlots.ts         the live reads behind background slots
├── slotSignals.ts             the session signals the slot derivation re-reads on
└── runtimeConnection.ts       RuntimeConnection · createCoreRuntimeConnection — the sockets as screens read them
```

`testing/connection.ts` (`@chatic/runtime-core/testing/connection`) is fake sockets for a test of anything
that reads or drives them through the engine.

## Usage

### The controller

```ts
// `engine` is the RuntimeEngine createRuntime returned (README § The engine).
const controller = engine.connectionController({ deviceId: () => currentDeviceId() });
const stopBackground = controller.startBackground(); // from the moment the host exists
const stopSockets = controller.startSockets(); // once the session is initialised
```

`@chatic/app-runtime`'s host is the one caller on the web; it is in runtime-core so that the native
process, which renders nothing, can run the same connections. The controller has two halves, each
returning its own stop, because they start at different moments:

| Half              | Starts                          | Does                                                                                                                                         |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `startBackground` | when the host mounts            | keeps the background clouds' tokens ready (`BackgroundCloudTokens`) and runs their receive loops (`@chatic/sync`'s `startBackgroundReceive`) |
| `startSockets`    | once session init has completed | derives the slots, binds them (`SocketBinder`) and re-authenticates a slot whose identity changed in place (`SocketReauthBinder`)            |

The background half needs no initialised session: before a relay session exists there is nothing to
prepare or receive for, and the preparer is handed an empty list. The socket half does: binding
against an unprepared session would register with credentials that are about to be replaced.

`deviceId` is a function, read on every pass. A page's id comes partly from what the phone shell
injects into the page, so the controller asks each time rather than fixing the value it was made with.

**When it re-runs.** The socket half re-derives the slots whenever one of the three slot signals
moves (`relay:token`, `cloud:token`, `selection`) or the background store announces (the app's list or
a cloud's cached tokens changed). The background half re-checks on the same two sources, and at once
when the manager reports a slot binding or going away — a cloud whose slot was just torn down is the
preparer's again.

**One pass per burst.** A session change arrives as several signals in a row — a cloud switch moves
the selection and then the cloud's tokens — and a pass between two of them would see half a switch.
Both halves therefore run once per burst, in a microtask after the last signal (`coalesced` in
`connectionController.ts`). When this ran inside React, the same batching came from React rendering
once for several store updates. The first pass of `startSockets` is not deferred: the sockets are
binding by the time it returns.

**A host that renders runs the socket pass in its own commit.** A screen that reacts to the same
change — a cloud switch — renders and runs its effects in React's commit, and React schedules that
commit as soon as anything above the host hears the signal: ahead of the controller's microtask. A
screen's effect would then read the active slot before the pass had moved it. So the controller
announces each due pass synchronously (`subscribeSocketPass`, `getSocketPassVersion`), and the host
re-renders in that same commit and runs it (`flushSockets`) from an effect ordered before the
screens'. Whichever runs first — the host's flush or the microtask — does the pass; the other finds
nothing due. A platform with no renderer leaves it to the microtask.

**A throw is logged, not lost.** The binder, the re-auth and the background check each run guarded:
what one throws is logged as `[ConnectionController] … failed`, and the re-auth still runs when the
binder threw. The binder remembers a pass only once its reconcile has gone through, so a reconcile
that threw halfway is run again by the next pass with the same slots. A start that throws on its
first step undoes its subscriptions and rethrows.

**Stop and start again.** A stop detaches every boot's SDK subscriptions and forgets them, but
destroys no socket; a later `startSockets` builds fresh binders, which re-bootstrap each slot, and
`ensure` reuses every client whose config is unchanged. A pass queued before the stop is dropped.
That is what a remounted host — React StrictMode's mount → unmount → mount among them — relies on.

**The sync engine first.** `startSockets` calls `getSyncManager()` before it binds anything. A slot's
sync runtime must exist _before_ the slot binds, because the runtime owns that connection's
`device.save`, and `device.save:ok` is what opens the auth gate. It used to work by accident —
whichever code touched a repository first built the data manager, which built the socket runtime,
which built sync — and this call states the requirement instead.

### How a slot is derived

[`deriveSocketSlots(deviceId)`](../../src/connection/socketSlots.ts) reads the session's narrow slot
snapshot (`getSocketSlotContext`), the committed cloud id, and the ready background clouds. The
snapshot carries exactly what the three slot signals move, and the controller re-derives on exactly
those three: **both have to be narrowed together** — subscribing to a subset while reading the full
context derives from values no subscription re-reads on. `identity` is excluded deliberately; boot
alone emits it twice and every login adds one, each of which would hand both binders a new-but-equal
slots object.

Four rules produce the result:

- **Each slot is gated on its own server having a token.** The relay wss is a static env value that exists before login, so gating on the URL alone would boot a socket with nothing to authenticate with. Login turns a slot on; logout turns it off.
- **`identityToken` rides beside `config`, not inside it.** `SocketBinder`'s reboot key reads only `config`, so a token refresh leaves the config stable and the socket alive, while `SocketReauthBinder` watches this field per slot.
- **No cloud slot carries an `identityToken`, committed or background.** A switch lands either on a cloud with no slot, which registers from scratch when it boots, or on a background slot whose own registered tokens the switch commits unchanged ([auth docs/socket/](../../../auth/docs/socket/README.md)) — either way there is no identity change on a live connection to watch for. A cloud token re-issued _without_ a switch is therefore invisible to both binders, and `renewCloudSession` re-registers explicitly.
- **The cloud slot's cid is the committed cloud**, read from the delegation token — not the selected one, which flips at the start of a switch. Using the selected value made the config describe two clouds at once during the optimistic window: the target's cid next to the outgoing cloud's URL and token.

`hasRelaySlot(deviceId)` is the first rule on its own: whether there is a relay session to mint
background clouds' tokens from.

### Background slots

Every cloud the account belongs to keeps a socket session while the user is somewhere else — another
cloud, or home. A write addressed to a cloud then has a live socket to go to whichever cloud is on
screen (and a cloud past the cap is held for the length of the write — below), and switching back to a kept cloud costs no reconnect and no token exchange. These slots have no sync
targets — no screen of theirs is mounted — but they do receive: a receive loop keeps each background
cloud's room list, last messages and `$join` current with one `channel.sync` a minute, so entering a
kept cloud finds its list already cached ([libs/sync](../../../sync/README.md#background-receive)).

The pieces, and who owns each:

| Piece                                                                         | Owner                               | Does                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connection.useBackgroundClouds(cids)`                                        | the app (`BackgroundCloudsRunner`)  | hands over membership — the owned catalog plus the invited-cloud cache — which only the app can see                                                                                                                                  |
| `connection.useReclaimOwnedClouds(cids, alsoInvited)`                         | each app (`BackgroundCloudsRunner`) | hands over the owned catalog, and the owned clouds also cached as invited; an owned cloud held as an invitee is re-issued as the owner ([auth docs/socket/](../../../auth/docs/socket/README.md#an-owned-cloud-held-as-its-invitee)) |
| [`selectBackgroundClouds`](../../../transport/src/socket/backgroundClouds.ts) | transport                           | drops relay and the committed cloud, orders the rest by recent use (`cloudStore.getRecentClouds`, then the app's order), caps at 5, then adds held clouds                                                                            |
| [`BackgroundCloudTokens`](../../../auth/src/socket/backgroundCloudTokens.ts)  | the controller's background half    | issues a cloud's tokens before its slot boots ([auth docs/socket/](../../../auth/docs/socket/README.md))                                                                                                                             |
| [`readyBackgroundConfigs`](../../src/connection/backgroundSlots.ts)           | the slot derivation                 | one `cloud` config per selected cloud whose cached entry is ready, URL from the cached delegation token                                                                                                                              |
| `SocketBinder`                                                                | the controller's socket half        | binds them beside relay and the committed cloud; never makes one active                                                                                                                                                              |

**The cap is five** — the largest subscription tier's allowance of owned clouds, so an account that
only owns clouds never reaches it. Invited clouds are not bounded by any plan; past five in total,
the cap keeps the clouds entered most recently. Each background session costs one socket and a
token issue per lifetime (two HTTP calls); the cap is what bounds that per device.

**Moving between background and committed is the same slot.** Its key is the cloud and its reboot
key `url|deviceId|wssType` does not change, so `ensure` reuses the client. Leaving a cloud for home
leaves it bound too, so going home is not signing out.

**A slot torn down with its session still good is signed off first.** When a cloud slot leaves the
desired set while the relay stays, `SocketBinder` asks `hasLiveJoinedSession(cid)` — still in the
app's list, cached tokens still usable — and, if so, sends that socket `auth.logout` before
destroying it: the cloud was pushed past the cap, and its server should hear the session end rather
than time it out. A cloud no longer joined, or whose session already expired, has nothing to sign
off from; a relay logout has already notified every slot. `logoutCloudSession` covers exactly the
opposite case for the cloud it leaves, so no socket is notified twice.

### Holding a slot for a write

A write addressed to a cloud needs that cloud's socket until its ack comes back, and neither the cap
nor the joined list knows a write is in flight: a switch can push the cloud out of the selection, and
a cloud the account has just left is not in the app's list at all. `backgroundClouds.hold(cid)`
covers that gap. It returns a release, and until the release is called:

- **the cloud is selected whatever the cap and the list say** — appended after the capped selection rather than competing for a place in it, so holding one cloud for the length of a send never tears another's slot down;
- **only a slot that is bound is kept** — a hold opens none. The write that took it goes out at once, so a slot booted for it would arrive after that write had already failed, and be torn down again as the hold ended;
- **`logoutCloudSession` does not sign it off** on the way home, because a logout on that socket would unauthenticate it under the ack. The cost is one case: a held cloud that is no longer in the app's list is then never told `auth.logout` — once the hold ends, the binder tears its slot down without signing off, as it does for any cloud not joined — and closing the socket is what ends that session.

Holds are reference-counted — two sends to one cloud overlap, and the first to settle must not free
the slot the second is waiting on — and the first hold and the last release announce like any other
change to the store. The relay and the committed cloud have slots of their own and are never
selected as background ones for a hold. `runInCloud` (`data/cloudChat.ts`) is the only caller
(`sendChatInCloud` and the image send go through it); it takes the hold before anything awaits, so
it is in place before any switch it races with commits.

The token cache announces nothing on its own, so the preparer and the cloud renewer call
`backgroundClouds.invalidate()` when they issue or drop a cloud's tokens — that announcement is what
re-runs the derivation.

The debug overlay's State screen lists every bound slot through `getSlotStatuses()` — key, kind,
whether it is active, transport state, verified, and `connectCount` — because a background slot's
reconnects never reach the active `SocketState`.

### The two binders

`SocketBinder` owns every slot through **one reconcile**. Each pass turns the slots into a desired
set — slot key → config — and a desired active slot (the cloud's key, or `null` for relay). A pass is
skipped when nothing that decides a slot moved: each desired slot's key plus its **reboot key**
`url|deviceId|wssType` ([`socketRebootKey.ts`](../../src/connection/socketRebootKey.ts), shared with
the other binder so the two cannot drift), the desired active slot, and the delegate. Otherwise it
runs three steps in a fixed order:

1. **Bind** every slot that is new, or whose reboot key moved, through `bootstrapSocketConnection`.
   A reboot detaches the previous boot's SDK subscriptions first; `ensure` then rebuilds the client
   because its config differs.
2. **Point** the facade: `setActiveSlot(desired active)`.
3. **Tear down** every slot the manager holds that is not desired — read from `getSlotKeys()`, not
   only from what this binder remembers booting, because a restarted controller starts with an empty
   memory.

Step 1 is finished by the time step 2 runs because `bootstrapSocketConnection` calls `ensure` before
its first `await`, so the pointer never names a slot that has not been created.

The skip check carries the desired **active** slot too, on its own. A switch between two clouds that
both hold a slot — one committed, one in the background — leaves every slot key and reboot key where
it was; only which of them is active moves. Keyed on the slot set alone, that switch never
reconciled and the facade stayed on the cloud the user had left.

Several clouds hold connections at once, by design, from the same device id. That is a change: until
background slots, step 1 was also what kept a switch from ever having two clouds connected — B's
`connect` came after the `await`, and A was gone by then.

A bootstrap that fails is forgotten, so the next reconcile tries that slot again. Until it binds, the
pointer names an unbound slot and the facade stays on relay; the binder logs that alongside the
failure.

This replaced two independent `useSocketSlot` effects, one per role, whose relative order across a
switch was whatever React ran first — and a guard that reported a cloud switch arriving on the same
wss host as an unsupported case. With slots keyed by the cloud, a different cloud is a different
slot whatever its URL, so the guard had nothing left to detect and is gone.

`cid` is not in the reboot key because it is already the slot's key. The identity token is not in it
because a refresh must not reboot a healthy socket.

`SocketReauthBinder` watches each slot's `identityToken` and calls `reauthenticateActiveSocket` when
it moves **and a reboot is not already happening**, since a reboot re-registers anyway. Its first pass
only records what it saw. Each pass runs the binder first and the re-auth second, over the same slots.

### The sockets as screens read them

`engine.connection` (`RuntimeConnection`) is everything the React surface asks of the sockets; app-runtime
reaches the socket manager no other way. Its snapshot is plain data — `active`, the active slot's socket
state, and `verifiedSlots`, every bound slot that is verified, in slot order — and keeps the same objects
until something in it changes: `active` is the manager's own snapshot, and the verified list is rebuilt
only when the set differs. It re-reads on the active slot's changes, on each slot's verified changes,
and once more after a slot's teardown has finished (a teardown is announced while the slot is still
bound). Every subscriber shares one subscription to the manager, attached with the first and let go
with the last, so a socket event costs one pass however many screens read the sockets. A request
observer (`observeRequests`) returns its stop; a newer one replaces it.

The rest, by how each would cross the bridge (the contract lists them):

| Crossing | Members                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| call     | `waitUntilVerified` · `slotStatuses` · `reconnect` · `recoverUnverified` · `recoverOnResume` · `setBackgroundClouds` · `setOwnedClouds` |
| stream   | `onServerEvent` (one type, from one slot or the active one) · `observeRequests` (request samples)                                       |
| local    | `requestOnSlot` (a request of any type) · `onServerMessage` (every frame) — never cross: what crosses is a domain result                |

`setOwnedClouds` keeps the lists and re-issues an owned cloud held as an invitee on a list change and
again on each cloud token commit (`cloud:token`) — an invite entry can be committed after the catalog
arrived, and no list change follows it. `requestOnSlot` is what the relay account's screens use while a
cloud is on screen: they do not go through a repository, whose cache is read under the live scope.

The sync engine has the same seam, `engine.sync` (`RuntimeSync`, `sync/runtimeSync.ts`): a target
registration that stands until it is dropped, the cache's baseline, and the targets for a debug screen.

### What not to do

- **Do not put the identity token into the reboot key.** A refresh would reboot a healthy socket. `cid` needs no place in it either — it is already the slot's key — and both binders share the key.
- **Do not run a pass per signal.** A pass between two signals of one session change sees half of it; go through the controller's coalescing.
- **Do not drop the host's flush.** Without it the pass runs after the screens' effects on every change but the first.
- **Do not take a raw `ClientSocketV2` and hold it** in the controller or a binder. Clients are rebuilt on every config change; [the socket doc](../../../transport/docs/socket/README.md#what-not-to-do) has the rest of the manager's rules.

## Further reading

- [app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md) — the host that starts and stops this controller, and the hooks that read connection state
- [`@chatic/transport` socket doc](../../../transport/docs/socket/README.md) — the manager these binders drive, slot keys, the active pointer, state and failure reporting
- [auth docs/socket/](../../../auth/docs/socket/README.md) — what `bootstrapSocketConnection` and `reauthenticateActiveSocket` do on these slots
- [libs/sync](../../../sync/README.md) — the per-slot runtimes, and the background receive loop
- [`libs/session`](../../../session/README.md) — the signals the slot derivation re-reads on
