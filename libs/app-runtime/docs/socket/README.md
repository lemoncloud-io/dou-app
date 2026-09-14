# socket — two slots behind one facade

`SocketManager` holds up to two `ClientSocketV2` clients at once: **relay**, on whenever a relay token
exists, and **cloud**, on only while a cloud session is active. Almost everything that talks to a
socket does not care which — gateways, sync and the UI address an **active facade** that resolves to
cloud when a cloud slot is bound and relay otherwise. Only slot lifecycle, and the handful of things
that must reach one specific server, address a `kind`.

The React layer that turns session state into slots and drives them lives in `connection/`; it is
covered here because the two halves only make sense together.

## Layout

```text
socket/                              32 source files, 21 tests
├── SocketManager.ts   775 lines   the class. Nothing else is exported from this file
├── types.ts                       SocketKind · SocketBindingConfig · SocketState · ISocketManager
├── constants.ts                   AUTH_OPTIONS · SDK_REFRESH_CYCLE_MS · DEFAULT_VERIFY_TIMEOUT_MS · INITIAL_SOCKET_STATE
├── runtime.ts                     getSocketManager — the one creation point
├── socketFailureReporter.ts       classifies and reports rejected requests
├── utils/                         annotateSocketError · getSocketErrorCode
├── auth/          17 files        → docs/auth/
└── sync/           8 files        → docs/sync/

connection/                          11 source files
├── RuntimeConnectionHost.tsx      both hosts — one component, one switch
├── SocketBinder.tsx               boots and tears down each slot
├── SocketReauthBinder.tsx         re-authenticates a slot whose identity changed
├── types.ts                       RuntimeSocketSlot · RuntimeSocketSlots
├── utils/socketRebootKey.ts       the identity key both binders must agree on
└── hooks/                         useRuntimeSocketSlots · useSocketSessionDelegate ·
                                   useRuntimeSocketState · useKindVerified · useConnectivity
```

`socket/types.ts` has **zero value exports**, which is not an accident: `socket/index.ts` does
`export * from './types'`, so a value placed there would land on the barrel every in-package consumer
imports. `constants.ts` exists to hold those values instead, and it imports no runtime module — which
is what lets `session/hooks/app/**` read `SDK_REFRESH_CYCLE_MS` without dragging the SDK in behind
`SocketManager`.

## Responsibilities

`SocketManager` owns: creating, rebuilding and destroying a client per kind; mirroring each slot's
SDK authentication flag and composing it with transport state into a broadcast `SocketState`; the
active facade; re-binding listeners across a client swap; freezing and reporting each slot's bound
cloud id; and naming the call that produced a failed request.

It does **not** own: token acquisition or renewal, expiry refresh, reconnect re-authentication or the
`auth.update` handshake — all the SDK's ([docs/auth/](../auth/README.md)); 401 detection and retry,
which no longer exist anywhere; waiting for a connection before a request; or creating a sync runtime
([docs/sync/](../sync/README.md)).

**`request` does not wait for the socket to open.** Called before connect, the SDK rejects
immediately with `503 SOCKET NOT CONNECTED`. Gating is the caller's job, through `isVerified`,
`waitUntilVerified` or `waitUntilKindVerified`.

## The shared contract

### One interface, four concerns

`ISocketManager` is a single interface with 24 members, grouped by comment banners rather than split
into four types. The split was tried and withdrawn: four interfaces were exported and recomposed on
the next line, and not one gateway ever declared the narrow slice it used — which made it a new
public surface with zero consumers, exactly the category the barrel cleanup exists to remove. When a
narrow type is genuinely needed, the repo's habit is a `Pick` at the point of use, the way
`ScopedSocketClient` and `ActiveScope`'s `BoundCidSource` do it.

| Concern                                        | Members                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slot lifecycle** — the only per-`kind` group | `ensure` · `connect` · `destroy` · `setAuthenticated` · `rebindCid`                                                                                                                                     |
| **Request and push** — active facade           | `request` · `send` · `onType` · `onSlotType` · `onMessage` · `onState` · `onError` · `disconnect`                                                                                                       |
| **Observation** — no lifecycle, no sending     | `getClient` · `getScopedClient` · `getSnapshot` · `subscribe` · `subscribeClient` · `subscribeSlotClients` · `waitUntilVerified` · `waitUntilKindVerified` · `isKindVerified` · `subscribeKindVerified` |
| **Cache attribution**                          | `getBoundCid`                                                                                                                                                                                           |

### A slot, and its bound cloud

```ts
interface SocketBindingConfig {
    url: string;
    deviceId: string;
    wssType?: 'relay' | 'cloud';
    cid?: string;
}
```

`ensure(config, kind)` reuses the slot when the config is unchanged, and otherwise destroys the
client and builds a new one — freezing `cid` as that slot's `boundCid`. That frozen value is the
whole reason the field exists: a cloud switch flips the cache cid optimistically while the outgoing
cloud's socket is still attached and still delivering frames, and those frames must not be written
under the incoming cloud's cid. `getBoundCid()` reports the **active** slot's, and `ActiveScope`
splices it into every repository read as `socketCid`.

`rebindCid(kind, cid)` re-points a slot without rebooting it — needed only for a same-wss cloud
switch, where the URL does not change so `ensure` never re-runs.

### Active facade, and the two escapes from it

`request` / `send` / `onType` / `onMessage` / `onState` / `onError` take no `kind`. A gateway does not
know which slot is active, and that is the point.

Some traffic must reach one specific server anyway — a setting whose owner sits behind relay, or a
unicast the server only delivers on the relay connection even while a cloud is up. Two escapes exist,
and they behave differently on purpose.

**`getScopedClient(kind)` returns a stable `Pick<ISocketManager, 'request' | 'send' | 'onType'>`
pinned to one slot.** It captures no client: `request` and `send` resolve `entries.get(kind)` on
every call, so a slot rebuilt underneath it is picked up rather than held stale. With the slot
unbound they **throw**. That is deliberate — a pin exists to guarantee a destination, and quietly
falling back to the active slot would send a relay-only write to a cloud.

**`onSlotType(kind, type, listener)` is the subscription counterpart, and it does not throw.** A
request finishes the moment it is made; a subscription has to outlive the slot it was registered on,
so the manager owns the entry and re-attaches it every time that slot rebinds — the same
owned-subscription machinery as active `onType`, triggered by the slot's own rebind instead of an
active-slot change. Registering against an unbound slot is a standing declaration ("attach when this
slot exists"), and the relay slot is briefly absent during boot; it waits, and it never leaks onto
the other slot. Re-binding happens in one place, `notifySlotClient`, because that is the single path
both `ensure` and `teardownEntry` pass through — and teardown notifies while the client is still
alive, so the old subscription is cleanly detached.

Verification has per-kind counterparts for the same reason: `isKindVerified(kind)` (a snapshot),
`waitUntilKindVerified(kind, timeoutMs?)` (one-shot, resolves `false` on timeout, never rejects) and
`subscribeKindVerified(kind, listener)` (fires immediately, then on every change). Anything pinned
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
slot — `(kind, client)` on bind or rebuild, `(kind, null)` just before a teardown — replaying the
currently bound slots on subscribe. For any one mutation **the slot notification comes first**, so a
per-slot attachment exists before active-facade consumers react. `SyncManager` depends on that
ordering.

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
| `unavailable` | 503 · 499     | Folded into a per-kind streak: the 1st warns, the 5th errors, the rest are silent        |
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
owns the per-kind auth delegate (`useSocketSessionDelegate`), so an app injects nothing, and it calls
`useRelaySessionKeepAlive` above the gate.

`RuntimeAuthHost` is the same component with background guest login switched off, for a console that
must not silently acquire a session. It is a second named export rather than a prop with a default
because a forgotten prop would hand a console a guest session and nothing would say so — the name is
the safeguard.

### How a slot is derived

[`useRuntimeSocketSlots()`](../../src/connection/hooks/useRuntimeSocketSlots.ts) subscribes to exactly
three signal kinds — `relay:token`, `cloud:token`, `selection` — and reads the matching narrow
snapshot. **Both have to be narrowed together**: subscribing to a subset while reading the full
context renders values from signals nobody is listening to. `identity` is excluded deliberately; boot
alone emits it twice and every login adds one, each of which used to re-render this hook and hand
both binders a new-but-equal slots object.

Four rules produce the result:

- **Each slot is gated on its own server having a token.** The relay wss is a static env value that exists before login, so gating on the URL alone would boot a socket with nothing to authenticate with. Login turns a slot on; logout turns it off.
- **`identityToken` rides beside `config`, not inside it.** `SocketBinder`'s reboot key reads only `config`, so a token refresh leaves the config stable and the socket alive, while `SocketReauthBinder` watches this field per slot.
- **The cloud slot carries no `identityToken` at all.** No two clouds share a wss host, so every cloud switch changes the URL and rebuilds the slot — there is no live connection to re-authenticate. That is an invariant, and a violation would be silent, so `SocketBinder` raises an error if a switch ever arrives on the same wss. A cloud token re-issued _without_ a switch is therefore invisible to both binders, and `renewCloudSession` re-registers explicitly.
- **The cloud slot's cid is the committed cloud**, read from the delegation token — not the selected one, which flips at the start of a switch. Using the selected value made the config describe two clouds at once during the optimistic window: the target's cid next to the outgoing cloud's URL and token.

### The two binders

`SocketBinder` manages each slot independently. A slot's config appearing calls
`bootstrapSocketConnection`; disappearing calls `manager.destroy(kind)`. The **reboot key** is
`url|deviceId|wssType` and nothing else ([`socketRebootKey.ts`](../../src/connection/utils/socketRebootKey.ts)),
and both binders read it from that one file so they cannot drift apart. `cid` is excluded because a
cid-only change is an optimistic cloud switch — rebooting there would re-freeze `boundCid` to the
target while still attached to the outgoing socket, which is precisely the cache poisoning
`boundCid` exists to prevent. The identity token is excluded because a refresh must not reboot a
healthy socket. On a real reboot the binder reads the current config, cid included, from a ref.

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
| `useKindVerified(kind)`   | Is _this_ kind verified, whatever is active — for gating a kind-pinned call |
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

- **Do not take a raw `ClientSocketV2` and hold it.** Clients are rebuilt on every config change. Use the facade, or `getScopedClient(kind)`, which re-resolves per call.
- **Do not add a silent fallback to a kind-pinned request.** Throwing is the contract; the alternative is a relay-only write landing on a cloud server with no trace.
- **Do not make a kind-pinned subscription throw when the slot is unbound.** It is a declaration, not a call, and the relay slot is legitimately absent for part of boot.
- **Do not gate a `getScopedClient` call on `waitUntilVerified`.** That waits on cloud whenever cloud is up. Use `waitUntilKindVerified(kind)`.
- **Do not put `cid` or the identity token into the reboot key.** Each exclusion has a specific failure attached, and both binders share the key.
- **Do not put a value in `types.ts`.** `socket/index.ts` re-exports it wholesale.
- **Do not branch on `connectionId`.** It is always `null`.

## Notes for implementers and tests

- `SocketManager.test.ts` mocks `createClientSocketV2` and drives a fake client. It is the biggest test in the package, and the kind-scoped cases are the ones that encode intent: a pinned request must survive a slot rebuild (lazy resolution), a pinned subscription must re-attach after a rebuild with the old one detached, registering on an unbound slot must not throw and must attach on the next `ensure`, and `destroy(kind)` must not leak a subscription onto the other slot.
- Six listener sets live on the manager. When adding one, decide first whether it is active-scoped or slot-scoped — and remember that a slot notification must precede the active one for the same mutation.
- `getSocketManager()` is a lazy process singleton with no reset seam. A test that needs a fresh manager constructs `new SocketManager()` directly.
- `utils/annotateSocketError.ts` has no test of its own; its behaviour is asserted through the facade in `SocketManager.test.ts`.
- `authUpdateAbsence.test.ts` sits in this folder but guards the whole package: it walks `src/**`, strips comments and fails if any code builds the string `'auth.update'`.

## Further reading

- [docs/auth/](../auth/README.md) — what `bootstrapSocketConnection` and `reauthenticateActiveSocket` do on these slots
- [docs/sync/](../sync/README.md) — the per-slot runtimes `subscribeSlotClients` exists for
- [docs/session/](../session/README.md) — the signals `useRuntimeSocketSlots` subscribes to
- [`libs/data`](../../../data/README.md) — the gateways that bind to the active facade, and the relay-pinned ones
