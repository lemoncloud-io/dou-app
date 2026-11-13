# session — bringing the relay session up, keeping it there, keeping its credentials fresh, reading it, and changing it

`session/` holds the relay session's own lifecycle, with no React in it: bringing the session up once
at boot, keeping a visitor who has none signed in as a guest, and keeping the relay and cloud
credentials from lapsing while the app sits still. It also holds the session as screens read it — a
snapshot without tokens — and as screens change it: the commands. The session's state — its stores,
its signal, the derived contexts — is `@chatic/session`'s; logging in and out, switching and pairing
are `@chatic/auth`'s use cases. The controller only decides **when** to call them, and the commands
only run them for a screen.

The connection host in `@chatic/app-runtime` makes one controller and starts it
([app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md)); the native runtime
will start the same one.

## Layout

```text
session/
├── sessionController.ts      createSessionController — initialize, isReady, the guest keep-alive
├── relayCredentialGuard.ts   RelayCredentialGuard — refreshes the relay credential before it lapses
├── cloudCredentialGuard.ts   CloudCredentialGuard — re-issues each cloud's tokens before they lapse
├── foreground.ts             ForegroundSignal and its holder, filled when the runtime is built
├── snapshot.ts               SessionSnapshot and SessionView — the session as screens read it
├── sessionView.ts            createCoreSessionView — that view over this process's stores
└── commands.ts               SessionCommands and createCoreSessionCommands — what a screen does to it
```

`testing/sessionView.ts` (`@chatic/runtime-core/testing/sessionView`) is a fake view for tests of
anything that reads the session through the engine; `testing/sessionCommands.ts` is its counterpart
for the commands — each command a test does not pass rejects, naming itself.

The connection host starts the session controller; an app starts the two guards with its own policy
(`runtime.session.useSessionStalenessGuard` / `useCloudCredentialGuard` in app-runtime).

## Usage

```ts
// `engine` is the RuntimeEngine createRuntime returned (README § The engine).
const session = engine.sessionController({ deviceId: () => currentDeviceId() });
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

### The credential guards

Both follow one shape: `new Guard(policy)`, `check()` to evaluate once, `start()` to arm the triggers
the policy asks for and return their stop, `setPolicy()` to replace the policy. Whatever has to
outlive a stop — a single-flight slot, a floor, the last state an edge is measured from — belongs to
the guard, not to a start: a stop followed by a start (React StrictMode, a policy change) does not
fire the relay guard's verified edge twice. The cloud guard evaluates every cloud on each start, as
the hook did on each mount. Neither ends a session — see
[ADR-0307](../../../../docs/adr/0307-a-credential-guard-never-ends-a-session.md).

**`RelayCredentialGuard` is relay-only, and adding a `kind` option to it would be wrong** — relay and
cloud recover by different means, and the cloud counterpart exists. Two properties are not
configurable because they are the reason the guard exists: the probe never refreshes (it reads the
session's relay token and nothing else; a second refresh engine would leave the socket's signing
material stale), and renewal always goes through `credentialRenewers.relay` →
`requestRelaySessionRefresh`.

- **Triggers**: an interval (`intervalMs`, `null` for edge-driven callers), the app returning to the
  foreground (`checkOnVisible`), and the rising edge of the relay slot's verification
  (`checkOnRelayVerified`) — the moment a refresh becomes possible. A socket already verified when the
  guard starts counts as an edge, unless an earlier start saw it. The guard watches the slot only
  while it runs, so turning a disabled guard on with the socket already verified probes once; the hook
  it replaced tracked the slot while disabled and did not. The probe refreshes only an expired or
  expiring credential, so this costs a store read.
- **A refresh that did not run is logged, not acted on.** The log says why: a relay socket that could
  not carry the refresh (`handshaking`, or the terminal `expired` whose confirmation window belongs to
  the renewer) is no evidence the session is dead; only a refusal from a socket that could ask means
  the credential is stale. The guard used to tear a session down after a streak of failures; no app
  used it, and a probe that logs people out on its own failures had logged admins out of live sessions
  after a laptop sleep. Ending a relay session is the server's verdict and the renewer's
  terminal-expiry window.
- **`forceRefresh` closes a specific hole.** The boot handshake's `auth.update` emits no token — the
  SDK emits one only from `refresh` and `switch` — so the first writeback is a whole refresh cycle
  away, and until it lands relay-signed HTTP is signed with the credential from before the device went
  to sleep. The expiry probe answers only "past expiry", so the guard also measures how much is left
  and fires only when `credentialFreshness.timeToExpiry('relay')` is under one refresh cycle (or cannot
  be measured). A 60-second floor throttles it, and a preemptive refresh that fails is only a warning.

**`CloudCredentialGuard` does not poll.** It derives a deadline from each credential's own
`Expiration` minus a margin (`marginMs`, default `SDK_REFRESH_CYCLE_MS`) and sleeps until the earliest
of them, waking at most every 5 minutes because a suspended page serves long timers late. The margin
is diagnosis rather than tuning: a healthy cloud socket re-mints every cycle, so being under it at all
_is_ the evidence the socket is not keeping up.

It guards **every cloud slot**: the committed cloud (whose slot may not be bound yet — the device id
can arrive after the tokens) and every cloud the manager has a slot for, background clouds included,
each through its own renewer, so one cloud's failed exchange never delays another's. A throw while
evaluating one cloud costs that cloud one retry sleep and nothing else. A failed renewal is a warning:
losing a cloud is recoverable by re-entering it, and `onAuthExpired` owns giving up on one.

The gap it closes was real. A cloud credential lives about an hour, and the only thing that re-minted
it mid-session was the cloud socket's refresh writeback. While that socket was down — sleep, a
dropped link, a long stay in one place — nobody even _measured_ the credential, and once it lapsed
every cloud-signed request 403'd.

### The foreground port

`ForegroundSignal { read(), subscribe(listener) }` says whether the app is in front of the user. It is
a port because only the platform knows: a page reads `document.visibilityState`
(`createWebRuntime` in `@chatic/runtime-web` fills it), a native runtime its app state
(`createNativeRuntime` in `@chatic/runtime-mobile`: in front unless `background` — iOS's `inactive`,
the app under a system sheet, counts as in front — and a subscriber hears only a change of that
answer). It reaches
`createRuntime({ foreground })` like every port; it is required, and reading it before
then throws (`foregroundPlatform.ports()`). It is this package's own type, because its readers are all
here: the session controller, the two credential guards (`checkOnVisible`), and push registration
([docs/push](../push/README.md)). A phone shell's own return to the foreground is a
bridge message, not this signal; an app that listens for it (apps/web's `useAppForeground`) calls the
guards' `check` itself.

### The session view

`engine.session` is how the React surface reads the session — every reader app-runtime publishes
(`useGlobalSession`, `getUidInCloud`, `isPairedSession` and the rest) goes through it. It is a
`SessionView { snapshot(), subscribe(listener) }`, and the snapshot is a `SessionSnapshot`:

| Part              | Holds                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `context`         | the relay and cloud halves, the identity and the active server — `GlobalSessionContext` without tokens |
| `auth`            | `isInitialized`, `isAuthenticated`, `error`                                                            |
| `activeUser`      | the active token's user fields (the profile's synchronous seed)                                        |
| `relayUser`       | the relay token's user fields (the account's own profile)                                              |
| `committedSiteId` | the place the session is really on                                                                     |
| `uidByCloud`      | the uid this account has in each cloud it has one in (`getUidsInClouds`)                               |
| `pairing`         | `isPairedSession`, `isInOwnCloudSession`, the paired clouds and their names                            |

**No token, and nothing but JSON.** `identityToken`, `delegationToken` and `cloudToken` stay in the
stores, and an error is its message. On the phone the shell's runtime hands a page this same value,
so a page that does not own the session never holds a credential; the core engine gives the page the
same shape so the readers cannot come to depend on a token.

**The same object until it changes, part by part.** `useSyncExternalStore` compares by identity, so
`snapshot()` returns the same object until something it reads moves, and each part keeps its identity
until that part changes: `context` and `auth` follow the store's own cached contexts (rebuilt on each
session signal), the identity inside `context` follows the store's identity state, and the parts the
stores rebuild on every read (the user fields, the uid map, the pairing) are kept while they read the
same. A new paired cloud name is a new snapshot whose `context` is the old one.

**What it re-reads on.** The core view (`createCoreSessionView`, one per engine) marks itself stale on
the session signal — as an invalidator, so before any listener reads — and on the sources that move
without one: the background clouds, the cloud store's token cache and recorded identities
(`cloudStore.subscribeUidSources` — a cloud re-issued into the cache for another account changes its
uid and raises no session signal), and the paired clouds (the list and the names). `subscribe` hears
all of them. A read that throws leaves the view stale, so the next call reads again.

**What a read costs.** Every reader — `useSessionAuth` as much as `useGlobalSession` — goes through the
one snapshot, so the first read after a change builds all of it: the context (which needs the relay's
endpoint resolvers), the uid map (which reads the token cache) and the pairing. That is why the engine
has to be handed over, and the stores wired, before the first render — which every entry point does.

### The commands

`engine.commands` is how the React surface changes the session — every command app-runtime publishes
(`logoutSession`, `confirmPhoneLogin`, `clearSiteSelection`, …) and every action, login and pairing hook
goes through it. `SessionCommands` lists them:

| Group       | Commands                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing in  | `loginUser` · `loginBySocialToken` · `loginGuestByDevice` · `loginByOAuthCode` · `confirmPhoneLogin` · `retryPhoneLogin` · `cancelPhoneLogin` · `loginWithInviteCode` · `forgetInviteLogin` |
| Moving      | `switchCloud` · `switchSite` · `clearSiteSelection`                                                                                                                                         |
| Leaving     | `logout` · `logoutCloud`                                                                                                                                                                    |
| The account | `patchRelayUser`                                                                                                                                                                            |
| Pairing     | `claimPairing` · `applyPairingSession` · `preparePairedCloudEntry` · `checkPairedClouds` · `endPairedCloud`                                                                                 |

**A command answers what the screen needs next, never a token.** A login answers the account's fields
(`SessionAccountView`); a phone login `{ isNew }`; an invite login and a relay pairing approval a
handle whose token the runtime keeps, which the next command (`switchCloud`, `applyPairingSession`)
names. Whatever else a command changed, the session view shows.

**It resolves once the session view shows its change.** A screen that awaits a switch and then reads
the session reads the session it switched to. The core commands get that for free: they write this
process's stores, and the view marks itself stale on the write. A runtime in another process has to
hold a command's answer back until the snapshot carrying the change has arrived.

**Plain data, and asynchronous, throughout.** A command may cross the bridge, so its arguments and its
answer are JSON and every one returns a promise — even one that is synchronous in the core (dropping a
handle, a profile patch), whose throw then becomes a rejection. The core commands are `async`
functions, so such a command still writes the stores before it returns, as the synchronous call did.

**What is not a command.** Calls that change no session — an alias lookup, an invite's details,
registering a user from the admin console — are reads of the auth repository, and stay with the
repositories. So does asking for a pairing code: only the claim, which can carry a session, is a
command.

## What not to do

- **Do not start the keep-alive in a console.** A forgotten opt-out hands it a guest session and
  nothing says so; the two hosts are named separately for that reason.
- **Do not log in from a session signal synchronously.** The signal fires inside the logout or the
  revocation that emitted it; a login started there races the rest of that teardown.

## Further reading

- [app-runtime docs/connection/](../../../app-runtime/docs/connection/README.md) — the host that starts this controller and gates on `isReady()`
- [auth docs/socket/](../../../auth/docs/socket/README.md) — what a revoked session is, and why the keep-alive follows it with a guest login
- [`libs/session`](../../../session/README.md) — the stores and the signal this controller reads
