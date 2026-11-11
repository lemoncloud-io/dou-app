# session — the controller that brings the relay session up and keeps it there

`session/` holds the relay session's own lifecycle, with no React in it: bringing the session up once
at boot, and keeping a visitor who has none signed in as a guest. The session's state — its stores,
its signal, the derived contexts — is `@chatic/session`'s; logging in and out is `@chatic/auth`'s
(`relaySession`). This controller only decides **when** to call them.

The connection host in `@chatic/app-runtime` makes one controller and starts it
([app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md)); the native runtime
will start the same one.

## Layout

```text
session/
├── sessionController.ts    createSessionController — initialize, isReady, the guest keep-alive
└── foreground.ts           ForegroundSignal and its holder, filled by initAppRuntime({ foreground })
```

## Usage

```ts
const session = createSessionController({ deviceId: () => currentDeviceId() });
void session.initialize();
const stopKeepAlive = session.startGuestKeepAlive(); // a chat app only — see below
session.subscribeReady(() => render(session.isReady()));
```

### Bringing the session up

`initialize()` calls `relaySession.initialize()` once per controller; a second call returns the first
call's promise. A failure is retried three times, 2, 4 and 6 seconds apart. After the last one the
session is marked initialised anyway (`markSessionInitialized`), so the app renders signed out
rather than not at all.

`isReady()` is `true` once `initialize()` has finished **and** the session store says it is
initialised. The host renders nothing below it until then, so no socket binds against a session that
is about to change. `subscribeReady(listener)` hears both halves: the init finishing, and the
session's own signals.

### Keeping a guest signed in

`startGuestKeepAlive()` logs in as a guest by device while there is no relay session, and returns its
stop. A chat app runs it (`RuntimeConnectionHost`); a console that requires an explicit login must
never acquire a session on its own, so `RuntimeAuthHost` does not.

- **When it tries.** Once when it starts, and again whenever the session goes away — a logout, a
  revoked session. That second case waits for a microtask after the signal, so the logout that emitted
  it finishes its own work before a guest login begins.
- **Not while offline.** With the link known down (`isLinkKnownDown`, the same verdict the credential
  guards use) the attempt is skipped rather than spent.
- **A failed attempt is retried on an edge.** Nothing about a failure moves on its own — the session
  is still absent, the device id is the same — so the keep-alive listens for the two moments that can
  turn a failure into a success: the network coming back (`subscribeOnline`), and the app returning
  to the foreground (`ForegroundSignal`). A suspended page can miss the network coming back entirely,
  which is why the foreground is the second edge.
- **No storm.** Edge retries are at least 5 seconds apart (`Throttle`), and only one login runs at a
  time (`Coalescer`). The floor is consumed only when there is a session to fill. Both belong to the
  controller, not to a start: a stop followed by a start — React StrictMode's double effect, a
  remounted host — joins the login the first start already sent.
- **The device id is read when an attempt runs.** A change of id is not a trigger of its own; it is
  picked up by the next attempt. The id is never empty on the web — it falls back to the page's own.

### The foreground port

`ForegroundSignal { read(), subscribe(listener) }` says whether the app is in front of the user. It is
a port because only the platform knows: a page reads `document.visibilityState`
(`webForegroundPorts()` in `@chatic/runtime-web`), a native runtime its app state. The entry point
passes it to `initAppRuntime({ foreground })`; like every port it is required, and reading it before
then throws (`foregroundPlatform.ports()`). It is this package's own type — the session controller is what reads it.

A phone shell's own return to the foreground is a bridge message, not this signal. An app that
listens for it (apps/web's `useAppForeground`) calls a guard's `check` itself.

## What not to do

- **Do not start the keep-alive in a console.** A forgotten opt-out hands it a guest session and
  nothing says so; the two hosts are named separately for that reason.
- **Do not log in from a session signal synchronously.** The signal fires inside the logout or the
  revocation that emitted it; a login started there races the rest of that teardown.

## Further reading

- [app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md) — the host that starts this controller and gates on `isReady()`
- [auth docs/socket/](../../../auth/docs/socket/README.md) — what a revoked session is, and why the keep-alive follows it with a guest login
- [`libs/session`](../../../session/README.md) — the stores and the signal this controller reads
