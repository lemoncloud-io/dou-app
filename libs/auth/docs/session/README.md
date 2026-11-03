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

| Singleton              | Methods                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaySession`         | `initialize` · `persistDeviceId` · `loginGuestByDevice` · `loginUser` · `loginByOAuthCode` · `loginBySocialToken` · `loginByToken` · `clearAndRedirect` · `registerLogoutCallback` |
| `cloudSession`         | `switchTo` · `clearStores` · `applySelectedSite`                                                                                                                                   |
| `sessionAuthAdapter`   | `getAuthRegistration(cid)` · `signAuth(cid, target?)` · `commitRefreshedToken(cid, view)` — the relay's cid is `RELAY_CLOUD_ID`                                                    |
| `credentialFreshness`  | `timeToExpiry(cid, now?)` · `isStale(cid, now?)`                                                                                                                                   |
| `logoutStorageSweeper` | `sweep()`                                                                                                                                                                          |

`loginByOAuthCode` (app-facing as `createCredentialsByProvider`) has two endpoints behind it. By default
it sends the code to `POST {oauth}/oauth/{provider}/token`, which admin-v2 reaches with no session. With
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

`relaySession.clearAndRedirect()` clears both relay and cloud stores, the per-cloud token cache, the
cloud identity map, the recent-cloud order and the reclaim records, and redirects to `/?logout=1`.
It performs no server-side logout; notifying the sockets is
[`logoutSession`](../socket/README.md)'s job, in `socket/`. `logoutStorageSweeper.sweep()` is the other
half of that flag: on the next document load it wipes the `@`-prefixed storage namespace, preserving
only the i18n key and `@chatic/config.*`, then drops `chatic-oauth-provider` from both storages.
Without it, tokens belonging to the account that just signed out survive the redirect.

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
