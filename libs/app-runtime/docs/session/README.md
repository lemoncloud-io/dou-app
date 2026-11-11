# session — the React surface over the session

The session's state lives in [`@chatic/session`](../../../session/README.md), and the use cases that
write it, device pairing and the socket authentication live in [`@chatic/auth`](../../../auth/README.md).
This folder holds what React reads and drives them through: the hooks under `session/hooks/`, the
readers in `session/sessionReads.ts`, and the `session` facade group in `session/index.ts`. The readers
go through the engine (`runtimeEngine().session`, runtime-core) and never touch the stores; the
commands still run `hooks → @chatic/auth → @chatic/session`. Every edge runs one way, never back.

## Layout

```text
session/                              34 source files, 16 tests
├── hooks/    32 files · 15 tests  the React surface: app · auth · actions · readers · pairing
├── sessionReads.ts                the readers and the getters, through `runtimeEngine().session`
└── index.ts                       the `session` facade group
```

## The shared contract

The three stores, the signal, the derived contexts and the scope's three views are documented with
their code, in [libs/session/README.md](../../../session/README.md#the-shared-contract); the use cases,
in [`@chatic/auth`'s session doc](../../../auth/docs/session/README.md).

### The React surface

| Folder                   | Count | Names                                                                                                                                                                                    |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/session/readers/` | 5     | `useGlobalSession` · `useSessionAuth` · `useSessionIdentity` · `useSessionSelection` · `useRuntimeProfile`                                                                               |
| `hooks/session/actions/` | 5     | `useSiteSwitch` · `useSwitchCloudSession` · `useLogoutCloudSession` · `useSessionLogout` · `useInviteFlow`                                                                               |
| `hooks/auth/`            | 8     | `useLogin` · `useLoginRelaySocial` · `useLoginRelayGuestByDevice` · `useRegisterUser` · `useRegisterUserV2` · `useFindAlias` · `useVerifyAlias` · `useInviteInfo`                        |
| `hooks/app/`             | 3     | `useDynamicDeviceId` · `useSessionStalenessGuard` · `useCloudCredentialGuard`                                                                                                            |
| `hooks/pairing/`         | 6     | `usePairingRequest` · `useIsPairedSession` · `usePairedCloudIds` · `usePairedCloudNames` · `usePairingAwareLogout` · `usePairedCloudCheck` — see [The pairing hooks](#the-pairing-hooks) |

The readers — these hooks, `useUidInCloud`, the three pairing readers, and the synchronous getters
(`getGlobalSessionContext`, `getIdentityContext`, `getUidInCloud`, `isPairedSession` and the rest) —
read the session through the engine the entry point handed over (`runtimeEngine().session`, in
[`sessionReads.ts`](../../src/session/sessionReads.ts)), never the stores. The engine's session is a
snapshot without a token — on the phone the session may live in another process, and the page then
has none — so `getGlobalSessionContext()` has no `identityToken`, `delegationToken` or `cloudToken`,
and an error is its message. The core engine reads this process's stores; what it holds and how it
keeps each part the same object is [runtime-core docs/session/](../../../runtime-core/docs/session/README.md#the-session-view).
`useSessionSelection` derives from `useGlobalSession`.

The commands keep tokens out of the screen the same way. A login answers with the account's fields,
not its token: `useLogin`, `useLoginRelaySocial` and `useLoginRelayGuestByDevice` resolve with a
`SessionAccountView`, and so does `createCredentialsByProvider`. A phone login is one step,
`confirmPhoneLogin(phone, code, { countryCode })` — the code proved and the session switched, answering
`{ isNew }` — with `retryPhoneLogin()` for a switch that failed after the code was spent and
`cancelPhoneLogin()` when the screen closes; they throw `PHONE_LOGIN_NO_TOKEN`,
`PHONE_LOGIN_SWITCH_FAILED` and `PHONE_LOGIN_NOTHING_PENDING`. An invite login (`useInviteFlow`,
`registerUserWithInviteCode`) answers with an `InviteLogin` handle; `useSwitchCloudSession().switchCloud`
takes it as `{ inviteLogin }` (with the invite's `backend`/`wss` added), resolves with nothing, and
refuses a handle the runtime does not hold with `INVITE_LOGIN_UNKNOWN`; a screen that will not enter
with one calls `forgetInviteLogin`. How long an answer is kept is
[`@chatic/auth`'s session doc](../../../auth/docs/session/README.md). Twenty-one of these 22 are on the package barrel; the one that is not
is `useRegisterUser` (superseded by `useRegisterUserV2`, still reachable in-package). The session's
init and guest keep-alive are no longer hooks: they are runtime-core's session controller, which the
connection host starts ([runtime-core docs/session/](../../../runtime-core/docs/session/README.md)).
`useRuntimeProfile` is on the barrel but reached by concrete path, because
`hooks/session/index.ts` publishes only the other four readers.

The two guards in `hooks/app/` take an app-supplied policy; they are below.

[`hooks/mutationKeys.ts`](../../src/session/hooks/mutationKeys.ts) holds `SWITCH_SITE_MUTATION_KEY`
and `SWITCH_CLOUD_MUTATION_KEY`. They are public so an app can observe a switch in flight globally —
`apps/web` uses them to stop periodic background sync while one is running.

### The two guards

An app mounts these; they are not automatic. Each is a thin hook over a guard class in runtime-core —
it starts the guard on mount, re-arms its triggers when the policy's triggers change, stops it on
unmount, and hands back a stable `check` for a trigger only the app knows (apps/web's WebView
foreground). What the guards do, and why, is
[runtime-core docs/session/](../../../runtime-core/docs/session/README.md#the-credential-guards).

| Hook                                                                                          | Guard                  | Policy                                                                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`useSessionStalenessGuard(policy)`](../../src/session/hooks/app/useSessionStalenessGuard.ts) | `RelayCredentialGuard` | `enabled`, `intervalMs` (`null` for edge-driven callers), `checkOnVisible`, `checkOnRelayVerified`, `forceRefresh` |
| [`useCloudCredentialGuard(policy)`](../../src/session/hooks/app/useCloudCredentialGuard.ts)   | `CloudCredentialGuard` | `enabled`, `marginMs`, `checkOnVisible`                                                                            |

Neither ends a session. The relay guard used to take a teardown policy (`onTeardown`,
`consecutiveFailureLimit`, `missingSessionCountsAsFailure`); no app used it, and it is gone.

### The pairing hooks

`usePairingRequest` drives the code screen's request-and-poll loop, and `useIsPairedSession` /
`usePairedCloudIds` / `usePairedCloudNames` read the pairing checks and the paired clouds' names; what they read is
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
// In React — re-renders when the part it reads changes.
const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
const { userId, isAuthenticated } = runtime.session.useSessionIdentity();

// Outside React — the same snapshot, read synchronously. No token in it.
const { cloud, identity } = runtime.session.getGlobalSessionContext();
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
| `RuntimeBinding` / `useRuntimeBinding`     | `RuntimeSocketSlots` / `deriveSocketSlots`       |

The last two rows are the same change: the global names `logoutSession` and `logoutCloudSession` now
belong exclusively to the [socket-notifying versions](../../../auth/docs/socket/README.md#ending-a-session), because
those are the ones an app should reach for.

## Further reading

- [`@chatic/auth`](../../../auth/README.md) — the use cases, pairing, and staying authenticated on every socket
- [runtime-core docs/connection/](../../../runtime-core/docs/connection/README.md#how-a-slot-is-derived) — how `deriveSocketSlots` turns this state into socket slots: relay, the committed cloud and the background ones
- [runtime-core docs/data/](../../../runtime-core/docs/data/README.md) — what `ActiveScope` is injected into
- [`libs/data`](../../../data/README.md) — `DataContextProvider`, `scopeGuards`, and `contextOverride`
