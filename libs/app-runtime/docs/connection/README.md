# connection — the host and the connection-state hooks

`connection/` is the React layer over the runtime's connections. It holds the host an app mounts
once, which starts and stops runtime-core's connection controller, hooks that read the sockets' state,
and the functions that drive the sockets outside React. Both go through the engine
(`runtimeEngine().connection`, in `connectionCommands.ts`), never the socket manager: on the phone the
sockets may live in another process. What keeps the sockets in line with the session — the slot derivation, the two
binders, background slots and write holds — is not here: it is runtime-core's, with no React in it,
so that the native process can run it too ([runtime-core docs/connection/](../../../runtime-core/docs/connection/README.md)).

## Layout

```text
connection/
├── RuntimeConnectionHost.tsx      both hosts — one component, one switch
├── connectionCommands.ts          the sockets outside React, through the engine
└── hooks/                         useHostControllers · useRuntimeSocketState · useSlotVerified ·
                                   useCloudVerified · useVerifiedClouds · useConnectivity ·
                                   useBackgroundClouds · useReclaimOwnedClouds
```

## Usage

### Mounting the host

```tsx
<runtime.connection.RuntimeConnectionHost>{children}</runtime.connection.RuntimeConnectionHost>
```

`RuntimeHostProps` is `{ children? }` — an app passes nothing else. The host makes runtime-core's
two controllers once (`useHostControllers`) — the session controller and the connection controller —
and starts them, in this order:

- **The session's init, on mount.** `session.initialize()` brings the relay session up once, and the
  host renders `null` until `session.isReady()` ([runtime-core docs/session/](../../../runtime-core/docs/session/README.md)).
- **The guest keep-alive, on mount** — `RuntimeConnectionHost` only, see below.
- **The connections' background half, on mount**, before the session is ready: it keeps the background
  clouds' tokens ready and their receive loops running, and before a relay session there is nothing
  for it to do.
- **The socket half starts once the session is ready.** The host renders a small `ConnectionSockets`
  child ahead of the app's children, whose effect starts the socket half — so the sockets are binding before any child's effect runs, the
  order the two binder components it replaced gave them.
- **Every later pass runs in the same commit as the screens.** `ConnectionSockets` subscribes to the
  controller's due pass with `useSyncExternalStore` and runs it (`flushSockets`) from an effect, which
  comes before the children's. A cloud switch therefore moves the active slot before a screen's
  effect reacting to the same switch reads it. Left to the controller's own microtask, the pass would
  run after React had already committed those screens.

Unmounting stops everything it started.

The device id both controllers use is the one `useDynamicDeviceId` resolves — the shell's injected id
when there is one, the page's own otherwise. They read it on each pass through `resolveDeviceIds`, so
an id the shell injects after the host mounted is picked up by the next one.

`RuntimeAuthHost` is the same component with background guest login switched off, for a console that
must not silently acquire a session. It is a second named export rather than a prop with a default
because a forgotten prop would hand a console a guest session and nothing would say so — the name is
the safeguard.

### Handing over membership

`useBackgroundClouds(cids)` and `useReclaimOwnedClouds(cids, alsoInvited)` are how an app hands the
runtime what only the app can see: which clouds the account belongs to, and which owned clouds are
cached as invited. They pass them to the engine (`setBackgroundClouds`, `setOwnedClouds`); when to
re-issue an owned cloud held as an invitee — on a list change, and on each cloud token commit — is
the engine's. The background slots built from them are described in
[runtime-core docs/connection/](../../../runtime-core/docs/connection/README.md#background-slots).

### Reading connection state

| Hook                      | Answers                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `useRuntimeSocketState()` | The **active** slot's `{ state, isConnected, isVerified, connectionId }`    |
| `useSlotVerified(key)`    | Is _this_ slot verified, whatever is active — for gating a slot-pinned call |
| `useCloudVerified(cid)`   | The same, named by cloud id — a missing id is the relay                     |
| `useVerifiedClouds()`     | Every cloud whose slot is verified — for work that spans all of them        |
| `useConnectivity()`       | What to tell the **user**: `online` · `reconnecting` · `offline`            |

The hooks read one snapshot, the engine's (`active`, the active slot's socket, and `verifiedSlots`,
every bound slot that is verified, in slot order), which keeps the same objects until something in it
changes.

### Outside React

| Function                                                  | Does                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `getRuntimeSocketState()`                                 | the active slot's socket at the moment of the call — a click, a timer                     |
| `waitUntilVerified(slot?, timeoutMs?)`                    | `true` once that slot (the active one when none is named) is verified; `false` on timeout |
| `onServerEvent(type, listener, { slot? })`                | the server's pushes of one type, from one slot or the active one                          |
| `onServerMessage(listener)`                               | every frame the active slot receives, across reconnects                                   |
| `observeSocketRequests(observer)`                         | every settled request, for a sampled timing                                               |
| `getSlotStatuses()`                                       | every bound slot's status (async) — a debug screen's, not a gate                          |
| `reconnectSocket()`                                       | closes the active socket so it redials — a wake kick                                      |
| `recoverUnverifiedSockets()` · `recoverSocketsOnResume()` | recover the slots that are not verified; on resume, ping the verified ones too            |

The socket manager is not on the surface any more: everything an app did with it is one of these.
`onServerMessage` is not a domain result, so it never crosses the bridge: it works only where the
runtime runs in the page's own process (desktop-web's frame log). The relay account's profile, which
an app used to read and write on the relay slot directly, is the session commands
`runtime.session.fetchAccountProfile` and `updateAccountProfile`.

`useConnectivity` is a display verdict, not an auth verdict, which is why it was never folded into
`deriveAuthStatus`: it answers "what do we say", while `AuthStatus` answers "what does the runtime
do". It reads the platform's online signal through `@chatic/transport` (`readOnline`,
`subscribeOnline`; `navigator.onLine` in a page). Its truth table encodes one asymmetry — that flag is a **strong negative** and an
**unreliable positive** (`true` only proves an interface is up). So with the browser online, a closed
socket reads as **reconnecting, not offline**: the fault is ours, and telling the user to check their
wifi sends them after the wrong thing. Boot (`state === 'idle'`) reads as `online`, because nothing
has been attempted yet. When the link counts as down is the transport's rule:
[When is the link down](../../../transport/docs/socket/README.md#when-is-the-link-down).

### What not to do

- **Do not keep connections in line with the session from a hook.** That is the controller's job, in runtime-core; a hook here reads state or hands the runtime what only the app knows.
- **Do not reach for the socket manager.** It is not on the surface; on the phone it is not in the page's process at all. What a screen needs from the sockets is above.

## Further reading

- [runtime-core docs/connection/](../../../runtime-core/docs/connection/README.md) — the controller this host starts, how the slots are derived, background slots and write holds, the two binders
- [`@chatic/transport` socket doc](../../../transport/docs/socket/README.md) — the manager, slot keys, the active pointer, state and failure reporting
