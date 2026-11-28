# session — the React surface over the session

The session's state lives in [`@chatic/session`](../../../session/README.md), and the use cases that
write it, device pairing and the socket authentication live in [`@chatic/auth`](../../../auth/README.md).
This folder holds what React reads and drives them through: the hooks under `session/hooks/` and the
`session` facade group in `session/index.ts`. The readers (`session/sessionReads.ts`) and the commands
(`session/sessionCommands.ts`) they call are the [app API](../api/README.md)'s. Both go through the engine — the readers through
`runtimeEngine().session`, the commands through `runtimeEngine().commands` (the engine) — and neither
touches the stores or the use cases. Every edge runs one way, never back.

## Layout

```text
session/
├── hooks/                         the React surface: app · auth · actions · readers · pairing
├── pageDevice.ts                  this page's device as a pairing's other side is told it
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
the app API's [`sessionReads.ts`](../../src/api/session/sessionReads.ts)), never the stores. The engine's session is a
snapshot without a token — on the phone the session may live in another process, and the page then
has none — so `getGlobalSessionContext()` has no `identityToken`, `delegationToken` or `cloudToken`,
and an error is its message. The core engine reads this process's stores; what it holds and how it
keeps each part the same object is [docs/engine/session](../engine/session.md#the-session-view).
`useSessionSelection` derives from `useGlobalSession`.

The commands go through the engine as well: the action, login and pairing hooks and the non-React
commands (`logoutSession`, `clearSiteSelection`, `patchRelaySessionUser`, the phone and invite logins,
`createCredentialsByProvider`, `forgetRefusedPairedCloud`, and the relay account's profile —
`fetchAccountProfile`, `updateAccountProfile`, read and written on the relay slot whichever cloud is
active) call `runtimeEngine().commands`, in
the app API's [`sessionCommands.ts`](../../src/api/session/sessionCommands.ts). A command resolves once the session view
shows its change, so a screen that awaits one and then reads the session reads the new one. Those whose
caller does not wait — `clearSiteSelection`, `patchRelaySessionUser`, `cancelPhoneLogin`,
`forgetInviteLogin` — stay synchronous to the screen and log a failure instead of throwing it.
`forgetRefusedPairedCloud` still answers at once whether it ended the cloud: it reads the refusal
itself and whether the cloud is a paired one from the session view, and leaves the ending to the
engine's `endPairedCloud`.
The calls that change no session — `useFindAlias`, `useVerifyAlias`, `useInviteInfo`, the two
`useRegisterUser*`, and `fetchInviteInfoWithCode` — go through the engine's auth repository
(the app API's `authLookups.ts`), so they run wherever the session runs.

What the page keeps for the signed-in person and drops at a sign-out (composer drafts, input locks, the
notification inbox, the log queue) is registered with `registerSessionLogoutCallback`. The registry is
the app API's and listens to the engine's `session.onLogout`, so the callbacks fire whichever process
ran the sign-out; one registered before the engine is handed over — the log uploader starts first — is
attached when it is.

`useDynamicDeviceId` and the host's controllers read the page's own device id from the session's store
only when the shell injected none (`lazySessionDeviceId`). Inside the phone app there always is one, and
a page whose session runs in the app's process has no session store of its own. `pairingClientOf` reads
this page's platform and user agent from the page itself, not from the runtime's transport.

`resolveDeviceIds` is the one place socket identity and push registration get their ids, so the two always
agree; derive them nowhere else. The shell's `CHATIC_APP_UNIQUE_DEVICE_ID` and
`CHATIC_APP_FIREBASE_INSTALLATION_ID` are read first. A legacy shell packs both into the composite
`CHATIC_APP_DEVICE_ID` (`bareId:firebaseInstallId`), and splitting on the colon recovers them, since
neither part can contain one. `CHATIC_APP_INSTALLATION_ID` is deliberately not a source here: what it
carried changed between the Firebase installation id and the bare device id across app versions, so it
cannot be trusted to mean either.

`useRuntimeProfile` seeds its first value synchronously from the active session token, so a guard reading
`isGuest` never flashes the wrong answer before the cache emits. When the uid changes it drops the row it
held and falls back to the new identity's seed. A guest-to-main promotion commits a new token without
writing a user row, and the old row would otherwise keep answering `isGuest: true` indefinitely. `userRole`
resolves cached-first, with the token seed as the fallback, field by field: a partial cached row that omits
the role must not turn a guest into a non-guest. The display fields (name, photo) prefer the cached row so
a profile edit reaches every reader.

The alias hooks log a failure and never the request. `useVerifyAlias` serves send, resend, check, change and
confirm for both sign-up and password reset through one endpoint, so its entry carries `mode` and `step`
(without them, "the code never arrived" and "I entered the code and it failed" look the same) plus
presence flags for the code and password. The address, the code and the password are never recorded.
`useFindAlias` records only the lookup `type`: whether an account exists for an address is exactly the
fact an enumeration attempt is after. `useInviteInfo` stays disabled until there is a code, an endpoint
and an authenticated session, because the lookup is a signed request; a relay invite carries no backend, so
it falls back to the configured relay backend.

`useSwitchCloudSession` takes the `cloud_switch` trace itself rather than leaving it to the command. The
command has a second caller, cloud-refresh recovery, which is rare and slow and would pass for a
user-initiated switch and drag the tail. A failed switch is recorded too: dropping failures would bias
the distribution optimistic.
`authFailureReaction` stays a re-export of the transport's registry: only admin and landing register
on it, and neither runs inside the phone app, where the HTTP layer would be in another process.

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
init and guest keep-alive are no longer hooks: they are the engine's session controller, which the
connection host starts ([docs/engine/session](../engine/session.md)).
`useRuntimeProfile` is on the barrel but reached by concrete path, because
`hooks/session/index.ts` publishes only the other four readers.

The two guards in `hooks/app/` take an app-supplied policy; they are below.

`SWITCH_SITE_MUTATION_KEY` and `SWITCH_CLOUD_MUTATION_KEY` are in the [caching rules](#the-caching-rules). They are public so an app can observe a switch in flight globally —
`apps/web` uses them to stop periodic background sync while one is running.

### The caching rules

What the login, invite and switch hooks cache by is the headless package's, in the app API's
[`sessionQueries.ts`](../../src/api/session/sessionQueries.ts), so a consumer with no React (a CLI, an MCP
server) runs the same calls under the same rules:

| Rule          | Name                                                                                                                                                                                                      | What it says                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| query         | `inviteInfoQuery(code, backend, authenticated)`                                                                                                                                                           | keyed `['inviteInfo', code, endpoint]`, the endpoint falling back to `net.relay.backend`; never fresh, no refetch on window focus; off when signed out, with no code or with no endpoint |
| mutations     | `loginMutation` · `loginRelayGuestByDeviceMutation` · `loginRelaySocialMutation` · `inviteFlowMutation(delegatorId)` · `logoutCloudSessionMutation` · `siteSwitchMutation` · `switchCloudSessionMutation` | the engine command each runs, its key and the query keys it leaves stale (`invalidates`)                                                                                                 |
| keys          | `SWITCH_SITE_MUTATION_KEY` · `SWITCH_CLOUD_MUTATION_KEY`                                                                                                                                                  | the two switches' keys, so a screen counts a switch in flight with `useIsMutating`                                                                                                       |
| after a login | `loginMutation.invalidates`                                                                                                                                                                               | `cloudsKeys.all` — the cloud list is stale once someone signs in                                                                                                                         |
| trace         | `traceCloudSwitch(run)`                                                                                                                                                                                   | the `cloud_switch` perf trace around a cloud switch, outcome `ok` or `error`                                                                                                             |

The rules are plain values, named as TanStack's framework-free query core names its options, and import
neither React nor react-query. The hooks stay on react-query and only bind them: `useIsMutating` in a
screen counts the switches only while they are mutations in the app's `QueryClient`, `cloudsKeys.all` is
invalidated in that same client, and `useInviteInfo` returns react-query's result object, whose loading and
error fields its callers read. A `useSyncExternalStore` binding would have to rebuild all three, so it
waits until the cache itself moves down.

### The two guards

An app mounts these; they are not automatic. Each is a thin hook over a guard class in the engine —
it starts the guard on mount, re-arms its triggers when the policy's triggers change, stops it on
unmount, and hands back a stable `check` for a trigger only the app knows (apps/web's WebView
foreground). What the guards do, and why, is
[docs/engine/session](../engine/session.md#the-credential-guards).

| Hook                                                                                                | Guard                  | Policy                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`useSessionStalenessGuard(policy)`](../../react/src/session/hooks/app/useSessionStalenessGuard.ts) | `RelayCredentialGuard` | `enabled`, `intervalMs` (`null` for edge-driven callers), `checkOnVisible`, `checkOnRelayVerified`, `forceRefresh` |
| [`useCloudCredentialGuard(policy)`](../../react/src/session/hooks/app/useCloudCredentialGuard.ts)   | `CloudCredentialGuard` | `enabled`, `marginMs`, `checkOnVisible`                                                                            |

Neither ends a session. The relay guard used to take a teardown policy (`onTeardown`,
`consecutiveFailureLimit`, `missingSessionCountsAsFailure`); no app used it, and it is gone.

### The pairing hooks

`usePairingRequest` drives the code screen's request-and-poll loop. Its claim is the engine's
`claimPairing`, which keeps a relay approval's session token and answers with a handle that
`applyPairingSession` signs in with; a cloud approval is prepared by `preparePairedCloudEntry` and then
entered with the screen's own `switchCloud`, so the switch keeps its trace and its in-flight key. That
wiring is the app API's `createPairingRequestFlow`; the hook supplies the page's request (its device
id and client) and the screen's switch, and holds the flow for the mount. Likewise
`usePairedCloudCheck` decides when to check and the app API's `createPairedCloudCheck` runs it.
`useIsPairedSession` /
`usePairedCloudIds` / `usePairedCloudNames` read the pairing checks and the paired clouds' names; what they read is
[`@chatic/auth`'s pairing doc](../../../auth/docs/pairing/README.md). Two hooks carry policy of their own:

- **`usePairingAwareLogout(onLogout)`** — signing out of an approving app ends the sign-ins it approved:
  it reads `GET /pairings`, and when approvals still stand it holds a confirm (`pending`), revokes each
  of them on `confirm` (failures ignored) and then calls the app's own logout. A browser, a secondary
  device, or a list that cannot be read logs out at once — the relay refuses those sessions at their
  next renewal anyway, so nothing may hold a logout hostage.
- **`usePairedCloudCheck(onEnded)`** re-checks each paired cloud at mount, every ten minutes and when the
  app calls `check` (apps/web does on foreground return) by re-issuing its tokens through the relay's
  delegation (the engine's `checkPairedClouds`, which also drops a guest-era list once the device has
  signed in to an account of its own). A cloud server knows nothing of the relay's pairings, so
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
- [docs/engine/connection](../engine/connection.md#how-a-slot-is-derived) — how `deriveSocketSlots` turns this state into socket slots: relay, the committed cloud and the background ones
- [docs/engine/data](../engine/data.md) — what `ActiveScope` is injected into
- [`libs/data`](../../../data/README.md) — `DataContextProvider`, `scopeGuards`, and `contextOverride`
