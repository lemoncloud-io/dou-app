# socket — slots behind one facade

`SocketManager` holds one `ClientSocketV2` client per slot: **relay**, on whenever a relay token
exists; the **committed cloud**, on only while a cloud session is active; and a **background** slot
for every other cloud the account belongs to, up to five. The manager sets no limit on cloud slots —
how many there are is the binder's input, and which clouds get one is a policy of its own
([background slots](../../../app-runtime/docs/connection/README.md#background-slots)). Almost everything that talks to a
socket does not care which — gateways, sync and the UI address an **active facade** that resolves to
the slot its owner points it at (`setActiveSlot`) — the committed cloud's, when there is one — and to
relay otherwise. Only slot lifecycle, and the handful of things that must reach one specific server,
address a slot — by its `SlotKey`, the cloud id it serves.

This is the manager's side. The React layer that turns session state into slots and drives them is
app-runtime's `connection/` — [its doc](../../../app-runtime/docs/connection/README.md) covers the
host, the slot derivation and the binders.

## Layout

```text
socket/                              14 source files, 10 tests
├── SocketManager.ts   1039 lines   the class. Nothing else is exported from this file
├── types.ts                       SlotKey · SocketKind · SocketBindingConfig · SocketState · SlotStatus · SocketRequestSample · ISocketManager
├── constants.ts                   AUTH_OPTIONS · SDK_REFRESH_CYCLE_MS · DEFAULT_VERIFY_TIMEOUT_MS · INITIAL_SOCKET_STATE
├── runtime.ts                     getSocketManager — the one creation point
├── devicePlatform.ts              resolveSocketDevice — the platform and name `device.save` sends
├── socketFailureReporter.ts       classifies and reports rejected requests
├── socketVerifyTrace.ts           observeSocketVerify — the `socket_verify` sample · the resume-kick marks SocketManager reads
├── backgroundClouds.ts            the app's cloud list · holds · selectBackgroundClouds · MAX_BACKGROUND_CLOUDS
├── linkState.ts                   isLinkKnownDown — is the link down, browser flag and verified slots together
└── utils/                         slotKey (slotKeyOf · RELAY_SLOT · kindOf) · annotateSocketError · getSocketErrorCode · errorCodeLedger · closeReason (classifySocketClose · APP_CLOSE_REASON · SocketCloseReason)
```

`socket/types.ts` has **zero value exports**, which is not an accident: the package barrel does
`export * from './socket/types'`, so a value placed there would land on the barrel every runtime
module imports. `constants.ts` exists to hold those values instead, and it imports no runtime module.

The authentication wiring on these slots stays in app-runtime's `socket/auth/`
([docs/auth/](../../../app-runtime/docs/auth/README.md)), and the sync runtimes on them are
[`@chatic/sync`](../../../sync/README.md)'s.

## Responsibilities

`SocketManager` owns: creating, rebuilding and destroying a client per slot; mirroring each slot's
SDK authentication flag and composing it with transport state into a broadcast `SocketState`; the
active facade; re-binding listeners across a client swap; reporting the active slot's cloud; and
naming the call that produced a failed request.

It does **not** own: token acquisition or renewal, expiry refresh, reconnect re-authentication or the
`auth.update` handshake — all the SDK's ([docs/auth/](../../../app-runtime/docs/auth/README.md)); 401 detection and retry,
which no longer exist anywhere; waiting for a connection before a request; or creating a sync runtime
([libs/sync](../../../sync/README.md)).

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

### What a socket says about its device

Every client is created with a `device` seed, and the SDK sends it as `device.save` on each connect.
The server files the device by its `platform` — `ios` · `android` are mobile, `macos` · `windows` ·
`linux` desktop, `web` a browser — and that is what my device list shows. Until this was decided per
shell, every client sent `web`, so phones and desktops were listed as browsers.

`resolveSocketDevice` decides it from what the shell injected, read straight off `window` when the
client is created:

| Shell                       | `CHATIC_APP_PLATFORM` | `platform` sent                                   | `name` sent                               |
| --------------------------- | --------------------- | ------------------------------------------------- | ----------------------------------------- |
| Mobile                      | `ios` · `android`     | that value                                        | none                                      |
| Desktop (Electron)          | `desktop`             | `macos` · `windows` · `linux` from the user agent | none                                      |
| Browser, or any other value | absent                | `web`                                             | `<browser> · <OS>`, e.g. `Chrome · macOS` |

- It reads the globals, not device-utils' `deviceInfoStore`: the store is filled by a React hook on
  mount, and the first socket can be created before that hook runs. The shells inject the globals
  before the page's own script.
- **The apps send no name.** The server keeps a sent `name` on every save, overwriting the row's label,
  and neither shell injects anything a person would recognise: the mobile shell's
  `CHATIC_APP_DEVICE_MODEL` is `DeviceInfo.getDeviceId()` — `iPhone17,1` on iOS, the board codename
  (`panther`) on Android — and the desktop shell's is Node's `process.platform` (`darwin`). Without a
  name the server labels a new row from the user agent. Naming a phone after its model needs the shell
  to inject a readable one first. A browser the user agent does not identify sends no name either.
- The virtual shell (`yarn local`) injects the mobile shell's globals, so it reports `ios` or
  `android`, like the phone it stands in for.

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

### How long a request takes: `setRequestObserver`

`setRequestObserver(observer)` hands every request made through the manager — the active facade's
and every scoped client's — to `observer` as it settles: its `type`, the slot's `kind`, its `outcome`
(`ok`, or the status it was rejected with as `getSocketErrorCode` reads it, else `error`) and its round trip on the page's
monotonic clock. With no observer, a request reads no clock. The web sets one to record
`socket_request` samples; the sampling and the caps are the web's (`observeSocketRequests`).

Requests the SDK sends on its own — `device.save`, `auth.update`, `auth.switch`, a sync plan's
catch-up — do not pass through the manager and are not seen.

A request rejected with **499** also carries `closeReason`: why the socket closed under it. The SDK
rejects every in-flight and queued request with 499 at the moment a socket closes, so this is what
splits the 499 share by cause. See the next section.

### Why a socket closed: `closeReason`

`onState` says only that a slot moved to `closed`. The code and the reason are on the SDK transport's
own `close` event, which every close goes through, so `bindCloseDiagnostics` subscribes to it per slot
and keeps the last one on the slot's entry, named by `classifySocketClose` (`utils/closeReason.ts`):

| `closeReason`     | What closed it                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `pong_timeout`    | the SDK keep-alive: a ping every 30 s, closed after two missed 10 s timeouts                          |
| `wake_recovery`   | the foreground kick recycling a slot that was not verified                                            |
| `wake_probe`      | the foreground liveness probe recycling a slot that read verified but did not answer                  |
| `service_restart` | the SDK reconnect controller's `restart()`, which its connection rotation calls (about every 100 min) |
| `destroyed`       | the app tore the slot down — a cloud switch, a logout, a rebind                                       |
| `server`          | the far end closed with a close frame                                                                 |
| `transport`       | the connection ended without one (network lost, the OS killed the socket), or no close was seen       |
| `other`           | this client closed it for a reason not above                                                          |

- **Local or remote.** The transport emits the same event for both. A known reason string names the
  close outright. For the rest, a close this client asked for passes through `closing` first and a
  remote one goes straight from `connected` to `closed`, so the slot remembers whether it saw
  `closing`.
- **The order is what makes it right.** The client subscribes to the transport's `close` in its
  constructor, ahead of the manager, and rejects its requests there; the manager's listener then
  records the reason, and the rejections reach the facade's `catch` a microtask later. No newer
  connection can reset the reason in between, so a 499 always finds the close that caused it. A new
  `connected` clears it.
- **A teardown is named by the manager.** The socket of a slot being torn down closes before
  `client.destroy()`: the teardown notification stops the slot's sync runtime, and that disconnects
  through the reconnect controller with no reason. So `teardownEntry` marks the slot first, and every
  close from then on — in the 499 and in the log — reads `destroyed`, whether the request was
  rejected as `socket closed` or `client destroyed`.
- **A rotation would leave the slot closed, so the manager reopens it.** The SDK's connection
  rotation (about every 100 min) calls the reconnect controller's `restart()`. In chatic-sockets-lib
  0.5.7 that disconnects through `client.disconnect`, which routes into the controller's own `stop()`
  and stops it, and the reconnect `restart()` tries next then returns without connecting. Left alone,
  the slot stays closed until the next foreground kick or a rebind, and every request in between
  fails as 503. So on a `service_restart` close this client made itself, `reopenAfterRestart` looks
  again on the next macrotask — after `restart()` has run to its end — and calls `connect()` if the
  same slot is still bound and still `closed`, and the wake recovery is not reconnecting it at that
  moment (`hasResumeKick`: the kick may be re-seeding an expired controller on the closed socket). A
  server close that carries the same reason is left to the reconnect controller and its backoff.
  `connect()` re-arms the controller, and the bootstrap gate keeps the new connection's
  `device.save:ok` → `auth.update` order, as for the foreground kick. An SDK whose restart reconnects
  by itself leaves the socket `connecting` by then, and the check does nothing; the real-client test in
  `utils/closeReason.test.ts` fails on that SDK release, which is the moment to remove it. The
  reconnect reads as `reconnect` in `socket_verify`. The alternatives weighed are in ADR-0215.
- **`disconnect during connecting` is not a request outcome.** That 499 rejects a `connect()`, not a
  request, and a connecting socket has no requests in flight (a send before `open` is a 503).
- **Feature-detected.** `transport` is a property of the client the SDK constructs, not of the
  `ClientSocketV2` interface it publishes — the same standing as the reconnect diagnostics. Without
  it every 499 reads `transport`, which is all this could say before. `closeReason.test.ts` drives the
  real client over a fake socket, so an SDK upgrade that changes the event, its order or the
  `closing` state fails a test rather than quietly turning every cause into `transport`.
- **One log line per connection that ended**, `[SocketManager] closed`, with the cause, code, reason,
  `wasClean` and how long it had been open. A reconnect attempt that never opened is not logged again
  here; the reconnect diagnostics already report it.

### How long a slot takes to verify: `socket_verify`

`bootstrapSocketConnection` attaches `observeSocketVerify` (`socketVerifyTrace.ts`) to every slot
it boots. Each connection attempt — from `connecting` to its end — becomes a `socket_verify` Firebase
Performance sample:

| Field          | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `value_ms`     | the attempt's whole span                                                                                   |
| `connected_ms` | the WebSocket opened                                                                                       |
| `device_ms`    | `device.save:ok` arrived, which opens the auth gate (see the ordering note in the bootstrap)               |
| `kind`         | `relay` / `cloud`                                                                                          |
| `cause`        | `bind` (the slot's first attempt), `reconnect`, or `resume` (the foreground wake recovery's kick or probe) |
| `outcome`      | `verified`; `closed` — the socket went away first; `expired` — the controller gave up with the socket open |

- **A sample, timed here.** A boot's first connections happen before the WebView knows where its
  traces go. A start and a stop would be held, and the start would reach Firebase late; timed here,
  the numbers do not depend on when they are delivered.
- **`closed` and `expired` are recorded on purpose.** A socket that never verifies is what this is
  for: the room sync waiting on an unverified socket, and a push's switch waiting on the handshake,
  both start here.
- **A re-authentication on a live connection is not an attempt.** It opens no `connecting`, so it
  records nothing.
- **Hidden time is never in a sample.** An attempt that starts while the page is hidden, or that the
  page is hidden during (`pageHideCount` moved), records nothing: it would time the OS suspending the
  page.
- **Ten a minute across all slots.** A boot binds up to seven, and an unlimited reconnect controller
  would otherwise spend the device's shared trace budget.
- **One observer per client.** Observing a client again replaces the previous observer, so a slot the
  binder boots again on the same client — after a failed first connect — is not recorded twice. A
  client that is already past `idle` starts counting at one, so its next attempt is a `reconnect`.
- `recoverUnverifiedSockets` and `recoverSocketsOnResume` call `noteResumeKick(key)` right before
  they reconnect a slot, which is how the attempt reads as `resume`, and `clearResumeKick(key)` after,
  so an unused mark expires.

### Failed requests get a name, and a volume policy

Everything goes through the facade, so it is the one place that knows both the kind and the message
type. `annotateSocketError` appends `<kind>.<action>(<type>)` to the error message on the way out.
Three rules keep that safe: the status code stays at the **front** (`getSocketErrorCode` parses a
leading `[1-5]\d{2}`), the original object is rethrown rather than wrapped (stack and `errorCode`
survive, and a non-`Error` rejection passes straight through), and it is skipped when the message
already contains the type — which makes it idempotent. Without it, the SDK's
`503 SOCKET NOT CONNECTED - WebSocketTransport.send()` is identical for every caller, and a minified
production stack cannot say which request raced a closing socket.

**A server refusal gets its status back before anything reads it.** The server answers a failed
request with `{type: '<type>:error', mid, error, errorCode}`, and chatic-sockets-lib rejects the
request with ``new Error(`${error} - ${type}`)`` — the `errorCode` is dropped. The server writes a
status into the text only when the failure began as one (`403 FORBIDDEN - …`); a parameter check is
`@chatNo[999] is invalid - …`, which it codes 400 but which has nothing in front to parse. Every
client-made failure (`499`, `503`, `408`) is prefixed, so before this the one kind of failure that
read as unclassified was the one the server decided.

So each slot keeps an `errorCodeLedger`, fed by that slot client's `onMessage`: a `*:error` frame that
answers a request (it has a `mid`) with a numeric `errorCode` is remembered under the exact text the
SDK rejects with. In the facade's catch — of the active facade and of every scoped client — the code is
set on the rejected Error as `errorCode`, first, before the request observer, the failure reporter
and the annotator see it; `getSocketErrorCode` reads a carried code ahead of the prefix. The text is
the key because the SDK hands back nothing else that ties a rejection to its frame: `request()` takes
no `mid`, and the Error carries none. The SDK runs `onMessage` listeners synchronously right after it
rejects, and the catch resumes in a microtask, so the frame is always seen first. Both of those are
the SDK's behaviour, not its contract; `errorCodeLedger.test.ts` drives the real client over a fake
socket so an upgrade that changes either fails a test. If one does change, the ledger finds no match
and the failure reads as it did before — never a code on the wrong request.

`socketFailureReporter` turns those rejections into log entries, which they previously never produced
at all: a server's `*:error` frame settles the pending promise and calls no emitter, so whether
anything was recorded depended on who happened to catch it. The classification exists for volume, not
for interest:

| Class         | Codes         | Treatment                                                                                |
| ------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `unavailable` | 503 · 499     | Folded into a per-slot streak: the 1st warns, the 5th errors, the rest are silent        |
| `timeout`     | 408           | One `warn` each — the request was accepted and never answered, and a retry may well work |
| `server`      | anything else | One `error` each: a decision the server made about one request                           |

`server` includes a rejection with no status at all (`code` is `undefined`, logged as `unclassified`)
— now only a server answer with no `errorCode`, or a rejection that is not an Error.

One `server` answer is not a failure and is recorded at `info` instead: **`profile.get` 404**. A
profile exists per place and only once its owner has opened that place (`profile.get-mine` creates
it), so reading a member's profile in a place they never entered — a cloud 1:1's peer from another
place, say — is answered 404, and the caller names them through the user record. Whoever it belongs
to, that status means only "there is no profile for this person here". The
pair is one entry in the reporter's `ABSENCE_ANSWERS` table; any other status on `profile.get`, and a
404 on any other type, stays an `error`.

503 is raised per send attempt while the transport is down; 499 rejects every in-flight and queued
request at once when the socket closes. Both mean "there is no socket", which the connection-level
triggers already report better — and while the socket is down, every registered sync target fails on
every poll. **Anything that reached the server resets the streak, whatever its verdict**, including a
403: a refusal proves the socket is up, so counting it as "still down" would keep the streak alive
forever. A success that ends a streak emits one `info` naming how many were lost. A healthy device
produces nothing, and no payload or response body is ever recorded — the status and the request type
are the diagnosis; the arguments are where the personal data is.

## When is the link down

`useConnectivity`'s `offline` comes from [`linkState.ts`](../../src/socket/linkState.ts), and the
offline skips in the credential guards, the background token preparer and the relay keep-alive read
the same answer through `isLinkKnownDown()`. The link is down only when **the browser says offline
AND no slot — relay or cloud — is verified**.

`navigator.onLine === false` is strong evidence, not proof. Chromium can hold it at `false` for the
life of the process while requests succeed. This was seen on the macOS desktop shell when it started at
login before Wi-Fi had joined a network. Read on its own, that value showed a permanent "no network"
banner and silently stopped every credential renewal. A verified socket is positive proof that packets
are moving, so it overrules the flag.

The cost is the opposite edge. When the link really drops, a socket can sit `connected` until its
next frame fails, and for that short window the link reads as up: the banner stays quiet and a guard
may try once. That delay ends as soon as the socket notices. The latched flag never ends on its own.
A latched flag with **no** verified socket (a first launch with no session yet) still reads as
offline, because nothing contradicts it. Do not read `navigator.onLine` directly for a skip decision
in the runtime; call `isLinkKnownDown()`.

The one exception is the relay terminal-expiry decision, because it is the only one that ends the
session. It holds off on the raw browser flag. A verified socket overruling that flag costs the other
skips one failed attempt at most, but here it could log the user out over a dead link.

## What not to do

- **Do not take a raw `ClientSocketV2` and hold it.** Clients are rebuilt on every config change. Use the facade, or `getScopedClient(key)`, which re-resolves per call.
- **Do not add a silent fallback to a slot-pinned request.** Throwing is the contract; the alternative is a relay-only write landing on a cloud server with no trace.
- **Do not make a slot-pinned subscription throw when the slot is unbound.** It is a declaration, not a call, and the relay slot is legitimately absent for part of boot.
- **Do not gate a `getScopedClient` call on `waitUntilVerified`.** That waits on cloud whenever cloud is up. Use `waitUntilSlotVerified(key)`.
- **Do not put a value in `types.ts`.** The package barrel re-exports it wholesale.
- **Do not branch on `connectionId`.** It is always `null`.

## Notes for implementers and tests

- `SocketManager.test.ts` mocks `createClientSocketV2` and drives a fake client. It is the biggest test in the package, and the slot-pinned cases are the ones that encode intent: a pinned request must survive a slot rebuild (lazy resolution), a pinned subscription must re-attach after a rebuild with the old one detached, registering on an unbound slot must not throw and must attach on the next `ensure`, and `destroy(key)` must not leak a subscription onto the other slot.
- Six listener sets live on the manager. When adding one, decide first whether it is active-scoped or slot-scoped — and remember that a slot notification must precede the active one for the same mutation.
- `getSocketManager()` is a lazy process singleton with no reset seam. A test that needs a fresh manager constructs `new SocketManager()` directly.
- `utils/annotateSocketError.ts` has no test of its own; its behaviour is asserted through the facade in `SocketManager.test.ts`.
- Close reasons are tested twice: `SocketManager.test.ts` drives each cause through a fake client that closes in the SDK's order, and `utils/closeReason.test.ts` builds the real client through the real manager, so the SDK behaviour they rest on is pinned — including a real `restart()` that leaves the socket closed until the manager reopens it.
- The fake WebSocket those real-client tests use starts `CONNECTING` and turns `OPEN` on its `open` event, as a browser's does. One created already `OPEN` is taken as open while the transport is still storing its connect attempt, and the attempt is never cleared: every later `connect()` returns it without opening a socket.
- No code here builds an `auth.update` packet, and nothing in the runtime may: [`authUpdateAbsence.test.ts`](../../../app-runtime/src/authUpdateAbsence.test.ts) walks app-runtime and every package cut from it, this one included, strips comments and fails on the string `'auth.update'`.

## Further reading

- [docs/connection/](../../../app-runtime/docs/connection/README.md) — the host, the slot derivation and the two binders that drive this manager
- [docs/auth/](../../../app-runtime/docs/auth/README.md) — what `bootstrapSocketConnection` and `reauthenticateActiveSocket` do on these slots
- [libs/sync](../../../sync/README.md) — the per-slot runtimes `subscribeSlotClients` exists for
- [`libs/data`](../../../data/README.md) — the gateways that bind to the active facade, and the relay-pinned ones
