# session — the use cases that write the session

Login, token exchange, cloud entry, site selection and teardown: the use cases that write the stores
in [`@chatic/session`](../../../session/README.md). They are the only writers of those stores. What
reads them for React — the hooks — is app-runtime's
([its session doc](../../../app-runtime/docs/session/README.md)).

## Responsibilities

**`session/` runs the use cases, and it does not reach the network directly.** Login, token exchange,
site selection and teardown all go through the `AuthRepository` (ADR-0036). No file here holds a
gateway. It is not React, so it reads the repository through a synchronous accessor rather than the
`useRuntimeRepositories` hook — `authRepositorySource.get()`, which `initAppRuntime()` wires. The
graph that holds the repository is assembled in app-runtime's `data/`, a package above this one, so it
is handed down at boot rather than imported; unwired, `get()` throws a message naming
`initAppRuntime()`.

## The use cases

Each is a class with a single exported singleton; the class itself stays private. All live in
`session/` except `credentialFreshness`, a reader of the stores that lives in `@chatic/session`'s
`store/` ([its README](../../../session/README.md#responsibilities)).

| Singleton                | Methods                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaySession`           | `initialize` · `persistDeviceId` · `loginGuestByDevice` · `loginUser` · `loginByOAuthCode` · `loginBySocialToken` · `loginByToken` · `clearAndRedirect` · `registerLogoutCallback` |
| `cloudSession`           | `switchTo` · `clearStores` · `applySelectedSite`                                                                                                                                   |
| `sessionAuthAdapter`     | `getAuthRegistration(cid)` · `signAuth(cid, target?)` · `commitRefreshedToken(cid, view)` — the relay's cid is `RELAY_CLOUD_ID`                                                    |
| `credentialFreshness`    | `timeToExpiry(cid, now?)` · `isStale(cid, now?)`                                                                                                                                   |
| `logoutStorageSweeper`   | `sweep()`                                                                                                                                                                          |
| `secretStorageMigration` | `prepare({ vault, plain, web, afterLogout })`                                                                                                                                      |
| `relayCredentialProbe`   | `hasSession()` · `isCredentialExpired(now?)` — a plain object, no class                                                                                                            |

`loginByOAuthCode` (app-facing as `createCredentialsByProvider`) has two endpoints behind it. By default
it sends the code to `POST {oauth}/oauth/{provider}/token`, which admin reaches with no session. With
`linkCurrentSession` it sends `{ provider, code }` to `POST {relay}/users/0/verify-oauth-code?token=1`,
signed with the session already on the device: the backend records that user (a Guest Session) as the
new session's link, the same record the native social login leaves, and that link is what later lets
the account into a cloud the guest was invited to. That endpoint answers 403 when there is no session,
so only a caller that is sure one exists passes the option — desktop does, because it registers the
device before it opens the browser. Admin-v2 calls without a session and stays on the default.

Two more are plain functions because they are shared by two callers with different policies:
`issueCloudTokens(cloudId, { allowCache })` and `reissueCloudTokens(cloudId)` in
[`cloudTokens.ts`](../../src/session/cloudTokens.ts). **The cache flag is the whole point.**
Entering a cloud may replay a cached exchange; renewing in place must not, because the cached copy is
the one that is expiring. For the same reason a cloud writeback refreshes the cache too — a cache
left behind the live token makes the _next_ entry restore a credential that was already replaced.
An exchange runs **once per cloud at a time**: a call that finds one in flight for the same cloud
joins it, so a switch, the background-slot preparer and a renewal can never leave the cache and what
the cloud's socket registered with holding different tokens.
`reissueCloudTokens` decides at write time whether the result also lands in the session store: it
does when `cloudId` is the committed cloud at that moment, and stays in the cache otherwise. A
committed renewal merges into the stored view, except when it names another user: over an invite
entry (an empty delegation JWT), or when the stored token's uid differs from the re-issued one's. It
then replaces the view and drops the selected place
([docs/socket/](../socket/README.md#an-owned-cloud-held-as-its-invitee)). Each exchange also remembers,
in memory, which relay user it was asked as (`lastIssuedForOf`), for the owned-cloud reclaim. Both
record the cloud's uid through [`cloudIdentity.ts`](../../src/session/cloudIdentity.ts), a
module of its own so the writeback path can record it without reaching the data runtime.

`relaySession.clearAndRedirect()` performs no server-side logout; notifying the sockets is
[`logoutSession`](../socket/README.md)'s job, in `socket/`. It ends the account on this device, in
this order, and only then leaves the page:

1. **The session.** Both relay and cloud stores, the per-cloud token cache, the cloud identity map, the
   recent-cloud order, the reclaim records and the paired clouds — in both of the session's ports.
2. **The app keys a sign-out takes**, by prefix, from the plain medium — `localStorage` in a shell,
   `sessionStorage` in a browser. The prefixes are not this package's: the domains that write those
   keys declare them, and the app hands them to `initAppRuntime({ signedOutKeyPrefixes })`, which
   registers them with `storage/signedOutAppKeys.util.ts`. In apps/web that is the log pipeline
   (`@chatic/web.log.`) and the telemetry policy (`@chatic/web.telemetry.policy`) — the logs carry the
   account that just left. An app that declares none has nothing swept.
3. **The device vault**, where the shell keeps one: emptied, and the shell's confirmation awaited. The
   next document reads the vault before anything else, and a vault still holding the tokens would sign
   the person straight back in. When the shell does not confirm, `chatic-secret-logout-pending` goes
   into the plain medium and the next boot empties the vault before reading it.
4. **`location.replace('/?logout=1')`.**

The HTTP transport has nothing of its own to clear: it signs every request from the session's relay
token, which step 1 removed.

`logoutStorageSweeper.sweep()` reads that flag on the next document and runs step 2 once more, for a
log batch written between the clear and the navigation. It used to wipe the whole `@` namespace of the
session's storage instead, keeping the language key and the config lane; that took lemon-web-core's
bundle, which nothing writes any more, and whatever else later moved in under `@`.

### The device vault at boot

An app or desktop shell that keeps a vault lists it in `window.CHATIC_APP_STORAGE_MEDIA`. Its entry
point then builds a `nativeSecure` medium for the session's secret port and awaits
`secretStorageMigration.prepare` (app-facing as `runtime.boot.prepareSecretStorage`) before the runtime
boots. It loads the vault and moves the four tokens out of the origin's `localStorage`, where they
lived before, deleting the web copy only once the shell confirmed the vault holds them:

| The vault answered            | Web copy | What happens                                                    |
| ----------------------------- | -------- | --------------------------------------------------------------- |
| (a logout, or its marker set) | any      | empty the vault, then read it; delete the web copy; drop marker |
| unavailable                   | yes      | this run signs in from the copy, held in the tab; keep the copy |
| unavailable                   | no       | this run keeps the session in the tab                           |
| values                        | any      | the vault is the truth; delete the web copy                     |
| empty                         | yes      | write the copy to the vault; delete it once confirmed           |
| empty                         | no       | signed out                                                      |

**Unavailable is not empty.** A vault that cannot be read this run — locked before the first unlock,
a failed write, a shell that does not answer the read in five seconds (counted while the page is visible) — switches the medium to the tab's
`sessionStorage` for the run, so the person stays signed in until the app closes. It never falls back
to `localStorage`. The one read failure the shell answers as empty is a vault it cannot decrypt (a
device key that was invalidated, data from another device): it empties it and the person signs in
again. Every row is decided from what the vault and web storage hold, so a boot that dies half-way does
the move again next time.

lemon-web-core's old bundle (`@<project>.*`, its language key kept) goes with the web copy, and
`initAppRuntime` drops it from the plain medium on every boot (`dropLemonLeftovers`). Requests are
signed from the session's relay token now and nothing writes under that prefix, so a bundle in web
storage is left from an older build.

Two cases are the entry point's (`apps/web/src/main.tsx`), not this migration's. A shell that keeps a
vault but whose `CHATIC_APP_STORAGE_MEDIA` did not land is found from its handshake (`StorageGet` among
its handlers); the page marks the tab and reloads once, so the next boot takes the vault from the start
instead of moving the session in the middle of a run. And a vault that could not be read at launch
(iOS before the first unlock) is asked again each time the page is shown; once it answers, the page
reloads onto it.

### Is there a session, and has it expired

`relayCredentialProbe` answers both from the session: a session exists when a relay token is stored,
and the relay credential has expired when `credentialFreshness` measures nothing left on it — or
nothing to measure. `relaySession.initialize()` reads the first to decide whether the boot is signed
in; nothing is rebuilt from the token, because signed HTTP reads it per request.
`useSessionStalenessGuard` reads both. They used to be asked of lemon-web-core's own stored token
bundle, whose expiry clock disagreed with the credential's exactly when a refresh carried a token but no credential.

[`authActions.ts`](../../src/session/authActions.ts) is an adapter, not a naming layer: three
apps call `registerUserWithInviteCode` / `fetchInviteInfoWithCode` with positional arguments and the
repository takes an object. Keeping that translation in one place is its entire reason to exist.

[`clearSiteSelection.ts`](../../src/session/clearSiteSelection.ts) empties the active cloud's place
selection and does nothing else — no `auth.switch`, no switch token, the socket session stays put. It is
on the barrel for one case: the user has just left the last place of a cloud, so there is no place to
switch to, and keeping the old id would leave the app on a place they are no longer in (apps/web's
`useSwitchPlace` calls it). Moving between places stays `useSiteSwitch`'s job.

## Further reading

- [docs/socket/](../socket/README.md) — what consumes `sessionAuthAdapter` and `credentialFreshness`, and the policy that ends a session
- [docs/pairing/](../pairing/README.md) — device pairing, which enters a cloud through these use cases
- [`libs/session`](../../../session/README.md) — the stores these use cases write
