# socket — slots behind one facade

`SocketManager` holds one `ClientSocketV2` client per slot: **relay**, on whenever a relay token
exists; the **committed cloud**, on only while a cloud session is active; and a **background** slot
for every other cloud the account belongs to, up to five. The manager sets no limit on cloud slots —
how many there are is the binder's input, and which clouds get one is a policy of its own
([Background slots](#background-slots)). Almost everything that talks to a
socket does not care which — gateways, sync and the UI address an **active facade** that resolves to
the slot its owner points it at (`setActiveSlot`) — the committed cloud's, when there is one — and to
relay otherwise. Only slot lifecycle, and the handful of things that must reach one specific server,
address a slot — by its `SlotKey`, the cloud id it serves.

The React layer that turns session state into slots and drives them lives in `connection/`; it is
covered here because the two halves only make sense together.

## Layout

```text
socket/                              36 source files, 26 tests
├── SocketManager.ts   853 lines   the class. Nothing else is exported from this file
├── types.ts                       SlotKey · SocketKind · SocketBindingConfig · SocketState · SlotStatus · ISocketManager
├── constants.ts                   AUTH_OPTIONS · SDK_REFRESH_CYCLE_MS · DEFAULT_VERIFY_TIMEOUT_MS · INITIAL_SOCKET_STATE
├── runtime.ts                     getSocketManager — the one creation point
├── socketFailureReporter.ts       classifies and reports rejected requests
├── backgroundClouds.ts            the app's cloud list · holds · selectBackgroundClouds · MAX_BACKGROUND_CLOUDS
├── utils/                         slotKey (slotKeyOf · RELAY_SLOT · kindOf) · annotateSocketError · getSocketErrorCode
├── auth/          18 files        → docs/auth/
└── sync/           8 files        → docs/sync/

connection/                          17 source files
├── RuntimeConnectionHost.tsx      both hosts — one component, one switch
├── SocketBinder.tsx               reconciles the slots and the active pointer
├── SocketReauthBinder.tsx         re-authenticates a slot whose identity changed
├── types.ts                       RuntimeSocketSlot · RuntimeSocketSlots
├── utils/socketRebootKey.ts       the identity key both binders must agree on
├── utils/backgroundSlots.ts       the live reads behind background slots
├── utils/slotSignals.ts           the session signals the slot derivation re-reads on
└── hooks/                         useRuntimeSocketSlots · useSocketSessionDelegate ·
                                   useRuntimeSocketState · useSlotVerified · useCloudVerified ·
                                   useVerifiedClouds · useConnectivity · useBackgroundClouds ·
                                   useBackgroundCloudTokens
```

`socket/types.ts` has **zero value exports**, which is not an accident: `socket/index.ts` does
`export * from './types'`, so a value placed there would land on the barrel every in-package consumer
imports. `constants.ts` exists to hold those values instead, and it imports no runtime module — which
is what lets `session/hooks/app/**` read `SDK_REFRESH_CYCLE_MS` without dragging the SDK in behind
`SocketManager`.

## Responsibilities

`SocketManager` owns: creating, rebuilding and destroying a client per slot; mirroring each slot's
SDK authentication flag and composing it with transport state into a broadcast `SocketState`; the
active facade; re-binding listeners across a client swap; reporting the active slot's cloud; and
naming the call that produced a failed request.

It does **not** own: token acquisition or renewal, expiry refresh, reconnect re-authentication or the
`auth.update` handshake — all the SDK's ([docs/auth/](../auth/README.md)); 401 detection and retry,
which no longer exist anywhere; waiting for a connection before a request; or creating a sync runtime
([docs/sync/](../sync/README.md)).

**`request` does not wait for the socket to open.** Called before connect, the SDK rejects
immediately with `503 SOCKET NOT CONNECTED`. Gating is the caller's job, through `isVerified`,
`waitUntilVerified` or `waitUntilSlotVerified`.

## The shared contract

### One interface, four concerns

`ISocketManager` is a single interface with 26 members, grouped by comment banners rather than split
into four types. The split was tried and withdrawn: four interfaces were exported and recomposed on
the next line, and not one gateway ever declared the narrow slice it used — which made it a new
public surface with zero consumers, exactly the category the barrel cleanup exists to remove. When a
narrow type is genuinely needed, the repo's habit is a `Pick` at the point of use, the way
`ScopedSocketClient` and `ActiveScope`'s `BoundCidSource` do it.

| Concern                                    | Members                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slot lifecycle** — addressed per slot    | `ensure` · `connect` · `destroy` · `setActiveSlot` · `setAuthenticated` · `getSlotKeys`                                                                                                                                     |
| **Request and push** — active facade       | `request` · `send` · `onType` · `onSlotType` · `onMessage` · `onState` · `onError` · `disconnect`                                                                                                                           |
| **Observation** — no lifecycle, no sending | `getClient` · `getScopedClient` · `getSnapshot` · `subscribe` · `subscribeClient` · `subscribeSlotClients` · `waitUntilVerified` · `waitUntilSlotVerified` · `isSlotVerified` · `subscribeSlotVerified` · `getSlotStatuses` |
| **Cache attribution**                      | `getBoundCid`                                                                                                                                                                                                               |

### A slot is keyed by the cloud it serves

```ts
type SlotKey = string & { readonly __slotKey: never }; // a cid — slotKeyOf(cid), RELAY_SLOT

interface SocketBindingConfig {
    url: string;
    deviceId: string;
    wssType?: 'relay' | 'cloud';
    cid: string; // the slot's key
}
```

A slot's key is the id of the cloud it serves; the relay's is `RELAY_CLOUD_ID` (`'default'`), exported
as `RELAY_SLOT` — the same value the cache partitions under, so one server has one name. Relay versus
cloud is an **attribute** of a slot, `kindOf(key)`, derived from the key and nothing else (not from a
token: a relay token can carry a `cloudId`). It still matters, because the two kinds authenticate,
renew and expire differently; it just no longer addresses anything.

Slots used to be keyed `'relay' | 'cloud'`. "The cloud slot" named a role — whichever cloud was
committed — so nothing could say "cloud A's slot", and a write that belonged to cloud A had no address
once the user moved on. `SlotKey` is branded because the old literals still type-check as `string`: a
missed call site would name a slot that never exists, and a subscription on it would wait forever
without an error. `slotKeyOf` also throws on `'relay'`, `'cloud'` and the empty string, for callers
that cast past the brand. `'#'` is not the relay's key either: it is the relay marker in the backend's
**push payload** only, translated where a push is read.

`ensure(config)` reuses the slot keyed by `config.cid` when the config is unchanged, and otherwise
destroys it and builds a new client. Two rules hold there:

- **It touches no other slot.** Binding cloud B leaves cloud A's slot bound and, if A is active,
  active. The manager does not limit how many cloud slots exist; the binder asks for the ones the
  session needs — the committed cloud's and the background ones.
- **A config cannot claim the other server.** A config whose `wssType` disagrees with `kindOf(cid)`
  throws. The case it exists for is a cloud config that fell back to the relay's cid, which would
  otherwise replace the relay socket with a cloud one. `useRuntimeSocketSlots` no longer produces
  that fallback: with no committed cloud there is no cloud slot, and it warns.

### The active slot is a pointer

`setActiveSlot(key | null)` names the slot the facade should follow; `null` means relay. The
effective active slot is that key **while it is bound**, and relay otherwise — so the pointer can be
set before its slot exists and is honoured the moment `ensure` binds it, and destroying the pointed-at
slot falls the facade back to relay without moving the pointer. `destroy()` with no key clears it.
Every call resyncs, and so does every `ensure` and `destroy`: rebuilding the active slot in place
still re-emits the replacement client to `subscribeClient`.

The active slot used to be inferred — "the cloud slot if one is bound, else relay". That only named
something while there could be at most one cloud slot, which `ensure` enforced by tearing the other
cloud down inside the same call. Making it a pointer is what lets several clouds hold a slot at all:
the facade follows the committed cloud, and every other bound cloud slot is simply not pointed at.
The active client goes from A straight to B, never through relay.

Three log lines trace it, all `info` under `SOCKET`, each with `{ cid, kind }`: `slot bound`,
`active moved` (with `from` and the new slot's `connectCount`) and `slot torn down` (with the
`connectCount` it reached). A switch between two kept clouds reads `active moved B` and nothing else;
a switch to a cloud with no slot yet reads `slot bound B → active moved B`, followed by
`slot torn down A` only when A is not kept in the background. A reconnect storm or a relay socket
rebuilt by accident shows up as a line that should not be there.

`getBoundCid()` reports the **active** slot's key. Because it is the key, it is fixed for the slot's
whole life: a switch flips the cache cid optimistically while the outgoing cloud's socket is still
attached and still delivering frames, and those frames keep being attributed to the cloud that socket
serves. `ActiveScope` splices it into every repository read as `socketCid`. The old `boundCid` field
and `rebindCid(kind, cid)`, which re-pointed a slot for a same-wss switch, are gone — a slot cannot
change which cloud it serves.

### Active facade, and the two escapes from it

`request` / `send` / `onType` / `onMessage` / `onState` / `onError` take no slot. A gateway does not
know which slot is active, and that is the point.

Some traffic must reach one specific server anyway — a setting whose owner sits behind relay, or a
unicast the server only delivers on the relay connection even while a cloud is up. Two escapes exist,
and they behave differently on purpose.

**`getScopedClient(key)` returns a stable `Pick<ISocketManager, 'request' | 'send' | 'onType'>`
pinned to one slot.** It captures no client: `request` and `send` resolve `entries.get(key)` on
every call, so a slot rebuilt underneath it is picked up rather than held stale. With the slot
unbound they **throw**. That is deliberate — a pin exists to guarantee a destination, and quietly
falling back to the active slot would send a relay-only write to a cloud.

**`onSlotType(key, type, listener)` is the subscription counterpart, and it does not throw.** A
request finishes the moment it is made; a subscription has to outlive the slot it was registered on,
so the manager owns the entry and re-attaches it every time that slot rebinds — the same
owned-subscription machinery as active `onType`, triggered by the slot's own rebind instead of an
active-slot change. Registering against an unbound slot is a standing declaration ("attach when this
slot exists"), and the relay slot is briefly absent during boot; it waits, and it never leaks onto
the other slot. Re-binding happens in one place, `notifySlotClient`, because that is the single path
both `ensure` and `teardownEntry` pass through — and teardown notifies while the client is still
alive, so the old subscription is cleanly detached.

Verification has per-slot counterparts for the same reason: `isSlotVerified(key)` (a snapshot),
`waitUntilSlotVerified(key, timeoutMs?)` (one-shot, resolves `false` on timeout, never rejects) and
`subscribeSlotVerified(key, listener)` (fires immediately, then on every change). Anything pinned
with `getScopedClient` must gate on these — `waitUntilVerified` would wait on cloud the moment a
cloud session came up.

### State

```ts
interface SocketState {
    state: ClientSocketState; // raw transport state
    isConnected: boolean; // state === 'connected'
    isVerified: boolean; // that slot is authenticated AND connected
    connectionId: string | null;
}
```

This is the **active** slot's state, broadcast through `subscribe` and surfaced by
`useRuntimeSocketState()`. Device registration is a sync-runtime detail and deliberately not on it.

`connectionId` is **always `null`** — nothing assigns it. It is a known gap, not a value to branch on.

Two subscriptions to clients, and they are not interchangeable. `subscribeClient` fires with the
**active** slot's client and again whenever the active slot changes. `subscribeSlotClients` fires per
slot — `(key, client)` on bind or rebuild, `(key, null)` just before a teardown — replaying the
currently bound slots on subscribe. For any one mutation **the slot notification comes first**, so a
per-slot attachment exists before active-facade consumers react. `SyncManager` subscribes to the
slot notification alone: its runtimes, and the targets on them, follow slots, not the active pointer.

### Failed requests get a name, and a volume policy

Everything goes through the facade, so it is the one place that knows both the kind and the message
type. `annotateSocketError` appends `<kind>.<action>(<type>)` to the error message on the way out.
Three rules keep that safe: the status code stays at the **front** (`getSocketErrorCode` parses a
leading `[1-5]\d{2}`), the original object is rethrown rather than wrapped (stack and `errorCode`
survive, and a non-`Error` rejection passes straight through), and it is skipped when the message
already contains the type — which makes it idempotent. Without it, the SDK's
`503 SOCKET NOT CONNECTED - WebSocketTransport.send()` is identical for every caller, and a minified
production stack cannot say which request raced a closing socket.

`socketFailureReporter` turns those rejections into log entries, which they previously never produced
at all: a server's `*:error` frame settles the pending promise and calls no emitter, so whether
anything was recorded depended on who happened to catch it. The classification exists for volume, not
for interest:

| Class         | Codes         | Treatment                                                                                |
| ------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `unavailable` | 503 · 499     | Folded into a per-slot streak: the 1st warns, the 5th errors, the rest are silent        |
| `timeout`     | 408           | One `warn` each — the request was accepted and never answered, and a retry may well work |
| `server`      | anything else | One `error` each: a decision the server made about one request                           |

503 is raised per send attempt while the transport is down; 499 rejects every in-flight and queued
request at once when the socket closes. Both mean "there is no socket", which the connection-level
triggers already report better — and while the socket is down, every registered sync target fails on
every poll. **Anything that reached the server resets the streak, whatever its verdict**, including a
403: a refusal proves the socket is up, so counting it as "still down" would keep the streak alive
forever. A success that ends a streak emits one `info` naming how many were lost. A healthy device
produces nothing, and no payload or response body is ever recorded — the status and the request type
are the diagnosis; the arguments are where the personal data is.

## Usage

### Mounting the host

```tsx
<runtime.connection.RuntimeConnectionHost>{children}</runtime.connection.RuntimeConnectionHost>
```

`RuntimeHostProps` is `{ slots?, children? }`. **`slots` is normally omitted** — the host derives them
itself. It remains as an override for tests and for a host that must inject them.

The host is the single init driver: `useRelaySessionInit()` runs session initialization once and the
host renders `null` until it resolves, so no binder mounts against an unprepared session. It also
owns the per-slot auth delegate (`useSocketSessionDelegate`), so an app injects nothing, and it calls
`useRelaySessionKeepAlive` above the gate.

`RuntimeAuthHost` is the same component with background guest login switched off, for a console that
must not silently acquire a session. It is a second named export rather than a prop with a default
because a forgotten prop would hand a console a guest session and nothing would say so — the name is
the safeguard.

### How a slot is derived

[`useRuntimeSocketSlots()`](../../src/connection/hooks/useRuntimeSocketSlots.ts) subscribes to exactly
three signal kinds — `relay:token`, `cloud:token`, `selection` — and reads the matching narrow
snapshot, plus the background store's version, which moves the background slots only
([Background slots](#background-slots)). **Both have to be narrowed together**: subscribing to a subset while reading the full
context renders values from signals nobody is listening to. `identity` is excluded deliberately; boot
alone emits it twice and every login adds one, each of which used to re-render this hook and hand
both binders a new-but-equal slots object.

Four rules produce the result:

- **Each slot is gated on its own server having a token.** The relay wss is a static env value that exists before login, so gating on the URL alone would boot a socket with nothing to authenticate with. Login turns a slot on; logout turns it off.
- **`identityToken` rides beside `config`, not inside it.** `SocketBinder`'s reboot key reads only `config`, so a token refresh leaves the config stable and the socket alive, while `SocketReauthBinder` watches this field per slot.
- **No cloud slot carries an `identityToken`, committed or background.** A switch lands either on a cloud with no slot, which registers from scratch when it boots, or on a background slot whose own registered tokens the switch commits unchanged ([docs/auth/](../auth/README.md)) — either way there is no identity change on a live connection to watch for. A cloud token re-issued _without_ a switch is therefore invisible to both binders, and `renewCloudSession` re-registers explicitly.
- **The cloud slot's cid is the committed cloud**, read from the delegation token — not the selected one, which flips at the start of a switch. Using the selected value made the config describe two clouds at once during the optimistic window: the target's cid next to the outgoing cloud's URL and token.

### Background slots

Every cloud the account belongs to keeps a socket session while the user is somewhere else — another
cloud, or home. A write addressed to a cloud then has a live socket to go to whichever cloud is on
screen (and a cloud past the cap is held for the length of the write — below), and switching back to a kept cloud costs no reconnect and no token exchange. What these slots
do NOT do yet is receive: they have no sync targets, so a background cloud's cache stays as it was
until it is entered.

The pieces, and who owns each:

| Piece                                                                     | Owner                              | Does                                                                                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection.useBackgroundClouds(cids)`                                    | the app (`BackgroundCloudsRunner`) | hands over membership — the owned catalog plus the invited-cloud cache — which only the app can see                                                       |
| [`selectBackgroundClouds`](../../src/socket/backgroundClouds.ts)          | runtime                            | drops relay and the committed cloud, orders the rest by recent use (`cloudStore.getRecentClouds`, then the app's order), caps at 5, then adds held clouds |
| [`BackgroundCloudTokens`](../../src/socket/auth/backgroundCloudTokens.ts) | runtime                            | issues a cloud's tokens before its slot boots ([docs/auth/](../auth/README.md))                                                                           |
| [`readyBackgroundConfigs`](../../src/connection/utils/backgroundSlots.ts) | runtime                            | one `cloud` config per selected cloud whose cached entry is ready, URL from the cached delegation token                                                   |
| `SocketBinder`                                                            | runtime                            | binds them beside relay and the committed cloud; never makes one active                                                                                   |

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
selected as background ones for a hold. `data.runInCloud` is the only caller (`sendChatInCloud` and
the image send go through it); it takes the hold before anything awaits, so it is in place before
any switch it races with commits.

The derivation re-runs when the session signals move and when the background store announces —
the app's list changed, or a cloud's cached tokens were issued or dropped (the token cache announces
nothing on its own, so the preparer and the cloud renewer call `backgroundClouds.invalidate()`).

The debug overlay's State screen lists every bound slot through `getSlotStatuses()` — key, kind,
whether it is active, transport state, verified, and `connectCount` — because a background slot's
reconnects never reach the active `SocketState`.

### The two binders

`SocketBinder` owns every slot through **one reconcile effect**. Each render turns the slots into a
desired set — slot key → config — and a desired active slot (the cloud's key, or `null` for relay).
The effect is keyed on each desired slot's key plus its **reboot key** `url|deviceId|wssType`
([`socketRebootKey.ts`](../../src/connection/utils/socketRebootKey.ts), shared with the other binder
so the two cannot drift), and runs three steps in a fixed order:

1. **Bind** every slot that is new, or whose reboot key moved, through `bootstrapSocketConnection`.
   A reboot detaches the previous boot's SDK subscriptions first; `ensure` then rebuilds the client
   because its config differs.
2. **Point** the facade: `setActiveSlot(desired active)`.
3. **Tear down** every slot the manager holds that is not desired — read from `getSlotKeys()`, not
   only from what this binder remembers booting, because a remount starts with an empty memory.

Step 1 is finished by the time step 2 runs because `bootstrapSocketConnection` calls `ensure` before
its first `await`, so the pointer never names a slot that has not been created.

The effect's key carries the desired **active** slot too, on its own. A switch between two clouds
that both hold a slot — one committed, one in the background — leaves every slot key and reboot key
where it was; only which of them is active moves. Keyed on the slot set alone, that switch never
re-ran the reconcile and the facade stayed on the cloud the user had left.

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

Unmount detaches every boot's subscriptions and forgets them, but destroys no socket. That is what
StrictMode (desktop-web runs under it) relies on: the second mount re-bootstraps each slot, `ensure`
finds the config unchanged and reuses the client, and a boot from the first mount that resolves late
detaches itself. The unmount half is a separate `[]` effect, so a dependency change never detaches a
slot the reconcile is about to keep.

It also calls `getSyncManager()` in its render body. That looks stray and is not: a slot's sync
runtime must exist _before_ the slot binds, because the runtime owns that connection's
`device.save`, and `device.save:ok` is what opens the auth gate. It used to work by accident —
whichever code touched a repository first built the data manager, which built the socket runtime,
which built sync — and this call states the requirement instead.

`SocketReauthBinder` watches each slot's `identityToken` and calls `reauthenticateActiveSocket` when
it moves **and a reboot is not already happening**, since a reboot re-registers anyway.

### Reading connection state

| Hook                      | Answers                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `useRuntimeSocketState()` | The **active** slot's `{ state, isConnected, isVerified, connectionId }`    |
| `useSlotVerified(key)`    | Is _this_ slot verified, whatever is active — for gating a slot-pinned call |
| `useCloudVerified(cid)`   | The same, named by cloud id — a missing id is the relay                     |
| `useVerifiedClouds()`     | Every cloud whose slot is verified — for work that spans all of them        |
| `useConnectivity()`       | What to tell the **user**: `online` · `reconnecting` · `offline`            |

`useConnectivity` is a display verdict, not an auth verdict, which is why it was never folded into
`deriveAuthStatus`: it answers "what do we say", while `AuthStatus` answers "what does the runtime
do". Its truth table encodes one asymmetry — `navigator.onLine` is a **reliable negative** (`false`
proves there is no network and outranks every socket state, because a dropped link can sit in
`connected` until the next frame fails) and an **unreliable positive** (`true` only proves an
interface is up). So with the browser online, a closed socket reads as **reconnecting, not offline**:
the fault is ours, and telling the user to check their wifi sends them after the wrong thing. Boot
(`state === 'idle'`) reads as `online`, because nothing has been attempted yet.

### What not to do

- **Do not take a raw `ClientSocketV2` and hold it.** Clients are rebuilt on every config change. Use the facade, or `getScopedClient(key)`, which re-resolves per call.
- **Do not add a silent fallback to a slot-pinned request.** Throwing is the contract; the alternative is a relay-only write landing on a cloud server with no trace.
- **Do not make a slot-pinned subscription throw when the slot is unbound.** It is a declaration, not a call, and the relay slot is legitimately absent for part of boot.
- **Do not gate a `getScopedClient` call on `waitUntilVerified`.** That waits on cloud whenever cloud is up. Use `waitUntilSlotVerified(key)`.
- **Do not put the identity token into the reboot key.** A refresh would reboot a healthy socket. `cid` needs no place in it either — it is already the slot's key — and both binders share the key.
- **Do not put a value in `types.ts`.** `socket/index.ts` re-exports it wholesale.
- **Do not branch on `connectionId`.** It is always `null`.

## Notes for implementers and tests

- `SocketManager.test.ts` mocks `createClientSocketV2` and drives a fake client. It is the biggest test in the package, and the slot-pinned cases are the ones that encode intent: a pinned request must survive a slot rebuild (lazy resolution), a pinned subscription must re-attach after a rebuild with the old one detached, registering on an unbound slot must not throw and must attach on the next `ensure`, and `destroy(key)` must not leak a subscription onto the other slot.
- Six listener sets live on the manager. When adding one, decide first whether it is active-scoped or slot-scoped — and remember that a slot notification must precede the active one for the same mutation.
- `getSocketManager()` is a lazy process singleton with no reset seam. A test that needs a fresh manager constructs `new SocketManager()` directly.
- `utils/annotateSocketError.ts` has no test of its own; its behaviour is asserted through the facade in `SocketManager.test.ts`.
- `authUpdateAbsence.test.ts` sits in this folder but guards the whole package: it walks `src/**`, strips comments and fails if any code builds the string `'auth.update'`.

## Further reading

- [docs/auth/](../auth/README.md) — what `bootstrapSocketConnection` and `reauthenticateActiveSocket` do on these slots
- [docs/sync/](../sync/README.md) — the per-slot runtimes `subscribeSlotClients` exists for
- [docs/session/](../session/README.md) — the signals `useRuntimeSocketSlots` subscribes to
- [`libs/data`](../../../data/README.md) — the gateways that bind to the active facade, and the relay-pinned ones
