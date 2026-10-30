# session — the React surface over `@chatic/session` and `@chatic/auth`

The session's state lives in [`@chatic/session`](../../../session/README.md), and the use cases that
write it, device pairing and the socket authentication live in [`@chatic/auth`](../../../auth/README.md).
This folder holds what React reads them through: the hooks under `session/hooks/`, and the `session`
facade group in `session/index.ts`. Every edge runs one way — `hooks → @chatic/auth → @chatic/session`
— never back.

## Layout

```text
session/                              35 source files, 15 tests
├── hooks/    34 files · 15 tests  the React surface: 5 app · 8 auth · 5 actions · 5 readers · 5 pairing
└── index.ts                       the `session` facade group
```

## The shared contract

The three stores, the signal, the derived contexts and the scope's three views are documented with
their code, in [libs/session/README.md](../../../session/README.md#the-shared-contract); the use cases,
in [`@chatic/auth`'s session doc](../../../auth/docs/session/README.md).

### The React surface

| Folder                   | Count | Names                                                                                                                                                             |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/session/readers/` | 5     | `useGlobalSession` · `useSessionAuth` · `useSessionIdentity` · `useSessionSelection` · `useRuntimeProfile`                                                        |
| `hooks/session/actions/` | 5     | `useSiteSwitch` · `useSwitchCloudSession` · `useLogoutCloudSession` · `useSessionLogout` · `useInviteFlow`                                                        |
| `hooks/auth/`            | 8     | `useLogin` · `useLoginRelaySocial` · `useLoginRelayGuestByDevice` · `useRegisterUser` · `useRegisterUserV2` · `useFindAlias` · `useVerifyAlias` · `useInviteInfo` |
| `hooks/app/`             | 5     | `useRelaySessionInit` · `useRelaySessionKeepAlive` · `useDynamicDeviceId` · `useSessionStalenessGuard` · `useCloudCredentialGuard`                                |
| `hooks/pairing/`         | 5     | `usePairingRequest` · `useIsPairedSession` · `usePairedCloudIds` · `usePairingAwareLogout` · `usePairedCloudCheck` — see [The pairing hooks](#the-pairing-hooks)  |

The first three readers are `useSyncExternalStore(subscribeSessionSignal, …)`; `useSessionSelection`
derives from `useGlobalSession`. Twenty of these 23 are on the package barrel; the three that are not
are `useRegisterUser` (superseded by `useRegisterUserV2`, still reachable in-package) and
`useRelaySessionInit` / `useRelaySessionKeepAlive`, which belong to the host rather than to an app.
`useRuntimeProfile` is on the barrel but reached by concrete path, because
`hooks/session/index.ts` publishes only the other four readers.

The two guards in `hooks/app/` take an app-supplied policy; they are below.

[`hooks/mutationKeys.ts`](../../src/session/hooks/mutationKeys.ts) holds `SWITCH_SITE_MUTATION_KEY`
and `SWITCH_CLOUD_MUTATION_KEY`. They are public so an app can observe a switch in flight globally —
`apps/web` uses them to stop periodic background sync while one is running.

### The two guards

An app mounts these; they are not automatic.

**[`useSessionStalenessGuard(policy)`](../../src/session/hooks/app/useSessionStalenessGuard.ts) is
relay-only, and adding a `kind` option to it would be wrong** — relay and cloud recover by different
means, and the cloud counterpart exists. Two properties are not configurable because they are the
reason the hook exists: the probe never refreshes (`webTransport.isAuthenticated()` would fire
lemon-web-core's own HTTP refresh, a second refresh engine that updates only the lemon store and
leaves the socket's signing material stale), and renewal always goes through
`requestRelaySessionRefresh`.

The policy covers `enabled`, `intervalMs` (`null` for edge-driven callers), `checkOnVisible`,
`checkOnRelayVerified`, `missingSessionCountsAsFailure`, `consecutiveFailureLimit`, `onTeardown` and
`forceRefresh`. Only **definitive** failures count toward the teardown streak: a refresh that could
not even reach the socket is not one.

`forceRefresh` closes a specific hole. The boot handshake's `auth.update` emits no token — the SDK
emits one only from `refresh` and `switch` — so the first writeback is a whole refresh cycle away,
and until it lands, relay-signed HTTP is signed with the credential from before the device went to
sleep. The expiry probe cannot see that window because it reads lemon's `expired_time`, not the
credential. So the guard measures the signing material itself: it fires only when
`credentialFreshness.timeToExpiry('relay')` is under one refresh cycle. Firing on every edge
unconditionally was the earlier behaviour and it refreshed credentials minted seconds earlier,
colliding with the re-authentication at login. A 60-second cooldown throttles it, and a preemptive
failure never counts toward teardown — a credential that is still valid is not evidence the session
died.

**[`useCloudCredentialGuard(policy)`](../../src/session/hooks/app/useCloudCredentialGuard.ts) does not
poll.** It derives a deadline from each credential's own `Expiration` minus a margin and sleeps until
the earliest of them, waking at most every 5 minutes because a suspended tab serves long timers late.
The margin is `SDK_REFRESH_CYCLE_MS`, and that is diagnosis rather than tuning: a healthy cloud
socket re-mints every cycle, so being under the margin at all _is_ the evidence the socket is not
keeping up.

It guards **every cloud slot**: the committed cloud (whose slot may not be bound yet — the device id
can arrive after the tokens) and every cloud the manager has a slot for — every background cloud
included — each through its own renewer, so one cloud's failed exchange never delays another's. A
background slot lives through many refresh cycles, and while its socket is down nothing else
re-mints its credential, so for those clouds this guard is what catches a lapse.

The gap it closes was real. A cloud credential lives about an hour, and the only thing that re-minted
it mid-session was the cloud socket's refresh writeback. While that socket was down — sleep, a
dropped link, a long stay in one place — nobody even _measured_ the credential, and once it lapsed
every cloud-signed request 403'd. Re-entering a cloud hid it, because a switch re-issues, so it only
showed up in sessions that sat still.

### The pairing hooks

`usePairingRequest` drives the code screen's request-and-poll loop, and `useIsPairedSession` /
`usePairedCloudIds` read the pairing checks; what they read is
[`@chatic/auth`'s pairing doc](../../../auth/docs/pairing/README.md). Two hooks carry policy of their own:

- **`usePairingAwareLogout(onLogout)`** — signing out of an approving app ends the sign-ins it approved:
  it reads `GET /pairings`, and when approvals still stand it holds a confirm (`pending`), revokes each
  of them on `confirm` (failures ignored) and then calls the app's own logout. A browser, a secondary
  device, or a list that cannot be read logs out at once — the relay refuses those sessions at their
  next renewal anyway, so nothing may hold a logout hostage.
- **`usePairedCloudCheck(onEnded)`** re-checks each paired cloud at mount, every ten minutes and when the
  app calls `check` (apps/web does on foreground return) by re-issuing its tokens through the relay's
  delegation (`pairedCloudSessions.checkAll`). A cloud server knows nothing of the relay's pairings, so
  a cloud session can outlive a revoked approval while it renews itself; the delegation does know, and
  refuses. A cloud that ended is already torn down and off the list when `onEnded` hears it, and the app
  says so and signs the device out — the approval was its sign-in. Nothing runs before the session has
  initialised: at boot the relay transport is not up, and a check would fail before the network. The cloud socket's own token refresh is **not** turned off for paired
  clouds, so between two rounds such a session can still renew itself — the ten-minute check is what
  bounds it.

## Usage

### Reading the session

```ts
// In React — subscribes to the signal, re-renders only on the kinds it needs.
const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
const { userId, isAuthenticated } = runtime.session.useSessionIdentity();

// Outside React — the same derived contexts, read synchronously.
const { cloud, identity } = getGlobalSessionContext();
```

### What not to do

- **Do not write a store from outside a use case.** The stores are on `@chatic/session`'s barrel so `@chatic/auth`'s use cases can write them; a hook or a screen that does is a second writer.

## Naming history (2026-09)

Old names still appear in source comments and in sibling modules' docs.

| Old                                        | Now                                              |
| ------------------------------------------ | ------------------------------------------------ |
| `intent` (the first scope view)            | `selected` · `deriveSelectedContext`             |
| `RelayCore` · `CloudCore` · `IdentityCore` | `IRelayStore` · `ICloudStore` · `IIdentityStore` |
| `logoutRelaySession()`                     | `relaySession.clearAndRedirect()`                |
| `logoutCloudSession()` (the store half)    | `cloudSession.clearStores()`                     |
| `RuntimeBinding` / `useRuntimeBinding`     | `RuntimeSocketSlots` / `useRuntimeSocketSlots`   |

The last two rows are the same change: the global names `logoutSession` and `logoutCloudSession` now
belong exclusively to the [socket-notifying versions](../../../auth/docs/socket/README.md#ending-a-session), because
those are the ones an app should reach for.

## Further reading

- [`@chatic/auth`](../../../auth/README.md) — the use cases, pairing, and staying authenticated on every socket
- [docs/connection/](../connection/README.md#how-a-slot-is-derived) — how `useRuntimeSocketSlots` turns this state into socket slots: relay, the committed cloud and the background ones
- [docs/data/](../data/README.md) — what `ActiveScope` is injected into
- [`libs/data`](../../../data/README.md) — `DataContextProvider`, `scopeGuards`, and `contextOverride`
