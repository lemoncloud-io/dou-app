# session — the use cases that write the session

Login, token exchange, cloud entry, site selection and teardown: the use cases that write the stores
in [`@chatic/session`](../../../session/README.md). They are the only writers of those stores. What
reads them for React — the hooks — is @chatic/runtime-react's
([its session doc](../../../runtime/docs/session/README.md)).

## Responsibilities

**`session/` runs the use cases, and it does not reach the network directly.** Login, token exchange,
site selection and teardown all go through the `AuthRepository` (ADR-0036). No file here holds a
gateway. It is not React, so it reads the repository through a synchronous accessor rather than the
`useRuntimeRepositories` hook — `authRepositorySource.get()`, which `createRuntime()` wires. The
graph that holds the repository is assembled in @chatic/runtime's `data/`, a package above this one, so it
is handed down at boot rather than imported; unwired, `get()` throws a message naming
`createRuntime()`.

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

**No login hands a screen its token.** The app-facing logins answer with the account's fields
(`SessionAccountView`, the token view without `Token` — `withoutToken` in
[`accountView.ts`](../../src/session/accountView.ts)), or less: `createCredentialsByProvider` and the
@chatic/runtime-react login hooks. On the phone the session can belong to another process, and the page then
must not hold a credential. An invite login's answer is the invitee's own cloud token, so
`registerUserWithInviteCode` keeps it ([`inviteLogins.ts`](../../src/session/inviteLogins.ts)) and
answers with an `InviteLogin` — a handle (with a random part, so a stale one names nothing) and the
cloud the answer names. The cloud switch reads the answer by its handle (`readInviteLogin`) and forgets
it once the cloud is entered, so a switch retried after a network failure enters with the same answer;
a handle it does not hold is refused with `INVITE_LOGIN_UNKNOWN` rather than entered the ordinary way,
which would answer for the relay user rather than the invitee. A screen that will not enter with an
answer forgets it (`forgetInviteLogin`): the owner opening their own invite, an invite without a cloud,
an accept that failed, desktop's accept. At most four answers wait; the oldest go first.

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

**An exchange may not move the account to another user in a cloud.** When a uid is already recorded for
the cloud and the fresh token names a different one, the exchange throws `CloudIdentityChangedError`
and writes nothing: the cache, the identity map and the session store keep the recorded user, and every
caller treats it as a failed issue (a switch shows its failure, a renewal or a background slot backs
off). The reason is what `delegate-cloud` answers. It issues for the relay user the request comes from
(for a signed-in account, the guest its sign-in started from), and the exchange finds or creates that
user's account in the cloud. An invitee whose invite login was made through a different guest
therefore gets a new, empty user: no place, no room, every request refused. Taking that token hides
everything the invitee had and overwrites the recorded uid, which is the last trace of the right
user. The one change that is meant to happen, the owned-cloud reclaim, gets an owner token, and only
the server can issue one, so a token whose role is `owner` is let through. With no uid recorded (a
first entry, or after the account signed out and the map was cleared) any answer is taken. An invite
login's own answer is committed by `cloudSession.switchTo` without an exchange, so accepting an invite
again can still set the user. A pairing's entry (`prepareEntry`) forgets the cloud's uid before its re-issue, because
replacing the tab's identity with the approver's is what it is for, and a guest that signs in to an
account ends its paired clouds the same way.

A refusal is remembered for the page life and answered without a round trip while the recorded uid is
still the one it was refused over. The server's answer does not change until something on the device
moves that uid, and without the memo every renewal tick and background retry would repeat the
`delegate-cloud` and `exchange-token` calls.

What `delegate-cloud` picks was measured on dev. A signed-in account that accepted an invite, and a
guest that accepted and then signed in, both get back the guest their own session signed in from, so
their uid stays the same. A flip takes a relay session linked to a guest other than the one whose
invite login made the invitee.

### How a login lands

- **Every login commits through one step.** A full relay token view is saved (when it carries a
  `Token`) and the session is marked authenticated. `loginByToken` is the same step for a view that is
  already issued, as in the socket login, where there is no HTTP call; `socket/applySessionToken` calls
  it first so the store leads and the socket follows.
- **The login answer must carry `$auth.id`.** The relay socket registers with it, and the profile
  endpoint cannot supply it. `loginByOAuthCode` logs a warning when the answer lacks it, because
  otherwise the failure only shows up later as a socket auth error with the cause long gone.
- **The device guest's id (`delegatorId`) has one writer.** `loginGuestByDevice` sets it to the guest's
  own uid, and a relay logout (`clearRelaySession`) clears it. No other login, a token refresh or a
  cloud switch touches it. Invites are accepted under that id, and a guest promoted to a social or
  phone login must keep it, or the guest recovery after a logout would stop returning the same device
  user.
- **Booting never refreshes.** `initialize()` only asks whether a relay token is stored. A returning
  user whose credential has expired therefore boots into the signed-in UI, offline as well, and the
  credential is renewed afterwards: by the relay socket's refresh writeback once it re-verifies, or by
  an explicit `requestRelaySessionRefresh`. There is one refresh route, and it goes through the
  socket ([docs/socket/](../socket/README.md)).

### Entering a cloud

`cloudSession.switchTo(cloudId, { hasLiveSlot, issuedTokens })` makes a cloud the committed one:

- **The selection moves first, the tokens commit last.** When the cloud changes, the selected cloud id
  is written and the selected place dropped before the exchange, so observers keyed on the cloud swap
  to the target's cache at once. The tokens of the cloud being left stay valid until the new ones land.
  A failed exchange puts the previous cloud id and place back.
- **Which tokens it commits, in order:** the invite login's `issuedTokens`; else, with `hasLiveSlot`,
  the cache entry the live background slot registered with, as it is (a socket signs with whatever the
  committed store holds, so a token it never registered would not sign); else the exchange with the
  cache allowed. Issued tokens are also written into the per-cloud cache and their uid recorded.
- **The commit is one batch** (delegation token, cloud token, selected cloud id, recent-cloud order,
  rebuilt identity), so no observer sees a state where the selection moved but the tokens had not. In
  the same cloud the new view is merged over the stored one, since a re-issue does not always carry
  every field (profile fields in particular); issued tokens replace it, because they may name another
  user.
- **Issued tokens into the cloud already selected also drop the selected place.** They are signed for
  the place the server chose (an invite login names the cloud's default), and the socket registers
  there. Keeping the old selection would make a later switch into that place a no-op as "already
  there", while every place-scoped call lands on the default one.
- **`clearStores()` leaves the cloud, not the account.** It clears the delegation, the cloud token and
  the selection, so the session falls back to the relay. The per-cloud token cache and the identity
  map stay, because the other clouds keep background socket sessions signing from that cache. Only the
  account teardown below clears them.

`relaySession.clearAndRedirect()` performs no server-side logout, because the backend has no
session-revoke endpoint; notifying the sockets is
[`logoutSession`](../socket/README.md)'s job, in `socket/`. It ends the account on this device, in
this order, and only then leaves the page:

1. **Logout callbacks.** Each callback registered with `registerLogoutCallback` runs once, in a
   `try`, and the registry is emptied. A native shell that must sign out of an OAuth provider's SDK
   registers there, since the provider is not session state.
2. **The session**, as one observable change so that nothing re-renders through a half-torn-down
   session on the way out. Both relay and cloud stores, the per-cloud token cache, the cloud identity
   map, the recent-cloud order, the reclaim records and the paired clouds — in both of the session's
   ports — and the local `net.relay.backend` / `net.relay.wss` overrides a deep link set, so a later
   boot resolves the build's own endpoint again. Leaving one cloud keeps the cache and the identity
   map; ending the account is the one place that clears them.
3. **The app keys a sign-out takes**, by prefix, from the plain port's store — `localStorage` in a shell,
   `sessionStorage` in a browser. The prefixes are not this package's: the domains that write those
   keys declare them, and the app's runtime declaration hands them over (`signedOutKeyPrefixes`), whose
   `createRuntime` registers them with `storage/signedOutAppKeys.util.ts`. In apps/web that is the log pipeline
   (`@chatic/web.log.`) and the telemetry policy (`@chatic/web.telemetry.policy`) — the logs carry the
   account that just left. An app that declares none has nothing swept.
4. **The device vault**, where the shell keeps one: emptied, and the shell's confirmation awaited. The
   next document reads the vault before anything else, and a vault still holding the tokens would sign
   the person straight back in. When the shell does not confirm, `chatic-secret-logout-pending` goes
   into the plain store and the next boot empties the vault before reading it.
5. **Home, with `logout=1`.** `authPlatform.ports().leaveToHome(params)` — in a page,
   `location.replace('/?logout=1')`, plus the sign-in parameters of the address it was opened with
   (`code`, `provider`, `_backend`, `_wss`) when `preserveUrl` is set.
   It lands on `/` directly, with no sign-in page in between and no history rewinding. Sign-out and
   clean-up are two page lifetimes, and the `logout=1` flag is what crosses between them.

The HTTP transport has nothing of its own to clear: it signs every request from the session's relay
token, which step 2 removed.

`logoutStorageSweeper.sweep()` reads that flag (through `authPlatform.ports().currentSearch()`) on the next document and runs step 3 once more, for a
log batch written between the clear and the navigation. It used to wipe the whole `@` namespace of the
session's storage instead, keeping the language key and the config lane; that took lemon-web-core's
bundle, which nothing writes any more, and whatever else later moved in under `@`.

### The device vault at boot

An app or desktop shell that keeps a vault lists it in `window.CHATIC_APP_STORAGE_MEDIA`. Its entry
point then builds a `nativeSecure` store for the session's secret port and awaits
`secretStorageMigration.prepare` (as runtime-core's `prepareSecretStorage`, app-facing as
`runtime.boot.prepareSecretStorage`; the phone app's own runtime runs the same step) before the runtime
boots. It loads the vault and moves the four tokens out of the origin's `localStorage`, where they
lived before, deleting the web copy only once the shell confirmed the vault holds them:

| The vault answered            | Web copy | What happens                                                    |
| ----------------------------- | -------- | --------------------------------------------------------------- |
| (a logout, or its marker set) | any      | empty the vault, then read it; delete the web copy; drop marker |
| unavailable                   | yes      | this run signs in from the copy, held in the tab; keep the copy |
| unavailable                   | no       | this run keeps the session in the tab                           |
| values                        | no       | the vault is the truth                                          |
| values                        | yes      | the copy replaces the vault's tokens; delete it once confirmed  |
| empty                         | yes      | write the copy to the vault; delete it once confirmed           |
| empty                         | no       | signed out                                                      |

**Unavailable is not empty.** A vault that cannot be read this run — locked before the first unlock,
a failed write, a shell that does not answer the read in five seconds (counted while the page is visible) — switches the store to the tab's
`sessionStorage` for the run, so the person stays signed in until the app closes. It never falls back
to `localStorage`. The one read failure the shell answers as empty is a vault it cannot decrypt (a
device key that was invalidated, data from another device): it empties it and the person signs in
again. Every row is decided from what the vault and web storage hold, so a boot that dies half-way does
the move again next time.

**A web copy next to vault tokens wins**, when it holds the relay token (without it the copy is a
leftover and is deleted as before). Every boot that reads the vault deletes the web copy, and
nothing writes the tokens to `localStorage` while a vault is in use, so a copy still there means no page has booted on
this vault and its tokens were written by something else. The phone app's own runtime is that something:
on app 0.32.1, an install that updated straight from an app without a vault started the runtime on an
empty vault, which signed the device in as a guest while the person's session was still in
`localStorage`. From 0.32.2 the runtime declines a launch whose vault holds no session, and the page
moves the copy itself; this row is what recovers the installs 0.32.1 already reached. The copy replaces
the vault's whole token set (a token it lacks is removed, so nothing of the other session is left) and
the device guest's id from the plain store is written over the vault's in the same write, since the plain
id is the one the page accepted invites under. The web copy is deleted once the shell confirms; a refused
write is `migration-refused`, as for an empty vault. Taking the vault as the truth here would delete the
last copy of the person's session. Because the copy wins, a copy the person has moved on from must not
survive to the next boot: `discardWebCopy` (app-facing as `runtime.boot.discardWebSessionCopy`) deletes
it, and `hasWebCopy` (`runtime.boot.hasWebSessionCopy`) says whether one is there. `apps/web` calls the
first at a sign-out on a launch the phone app's runtime owns, and before it reloads onto a vault it found
only after booting without one, unless the copy was there when it started.

**The rows are decided by the tokens alone.** The vault may also hold the device guest's id (below),
and a vault holding only that id is not a signed-in one: it takes the `empty` rows, so a web copy of
the tokens is still moved rather than deleted.

**The device guest's id is copied, never moved.** In three rows the boot copies `chatic-delegator-id`
from the plain store into the vault if the vault lacks it, and leaves the plain copy where it is:
`values` with no web copy; `empty` with no web copy; and `empty` with a web copy, once the move is
confirmed. It does not overwrite an id the vault already holds, except in the `values` row with a web
copy, above, where it goes over the vault's with the tokens. It does not run in the logout row, in the
unavailable rows, or after a move the vault refused. The copy goes as the store's `offer`, not a `set`: a refused or
unanswered offer leaves the store on the vault with the session's tokens, where a refused `set` would
switch the whole run to the tab. The boot does not wait for it either, so a shell that never answers
does not hold every launch for the full timeout. A copy that does not land is logged, the reader
(`identityStore`) falls back to the plain copy, and the next boot tries again. The vault's own shell
may still stop accepting writes for the process after a keychain failure; a token write in that run
would have met the same failure. The tab sweeps (once the vault answers again, and at a logout) take
the id along with the tokens: a run whose vault was unavailable wrote it there through the fallback. The id has to reach the vault because the phone app's runtime reads only the vault and
its own file, and an install signed in to an account never logs in as a guest again, the one moment the
id is written. It is copied rather than moved because deleting it would be the one way this step could
lose it: an older web build, a run whose vault cannot be read, and this step itself read the plain copy.
That is also why the id is not on `SESSION_KEYS.secret` — every key there has its web copy deleted by
the `values` row above.

lemon-web-core's old bundle (`@<project>.*`, its language key kept) goes with the web copy, and
`createRuntime` drops it from the plain store on every boot (`dropLemonLeftovers`). Requests are
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
runtime-core's `RelayCredentialGuard` reads both. They used to be asked of lemon-web-core's own stored token
bundle, whose expiry clock disagreed with the credential's exactly when a refresh carried a token but no credential.

[`authActions.ts`](../../src/session/authActions.ts) is an adapter, not a naming layer: its callers
(runtime-core's `loginWithInviteCode` command, @chatic/runtime's `fetchInviteInfoWithCode`) pass positional
arguments and the repository takes an object. Keeping that translation in one place is its entire reason to exist.

[`clearSiteSelection.ts`](../../src/session/clearSiteSelection.ts) empties the active cloud's place
selection and does nothing else — no `auth.switch`, no switch token, the socket session stays put. It is
on the barrel for one case: the user has just left the last place of a cloud, so there is no place to
switch to, and keeping the old id would leave the app on a place they are no longer in (apps/web's
`useSwitchPlace` asks for it, through runtime-core's `clearSiteSelection` command). Moving between places stays `useSiteSwitch`'s job.

## Further reading

- [docs/socket/](../socket/README.md) — what consumes `sessionAuthAdapter` and `credentialFreshness`, and the policy that ends a session
- [docs/pairing/](../pairing/README.md) — device pairing, which enters a cloud through these use cases
- [`libs/session`](../../../session/README.md) — the stores these use cases write
