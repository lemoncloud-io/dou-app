# signing — what goes into a packet, and what comes back out

The SDK asks for two things it does not understand: an `authId` at registration, and a `sign`
callback it invokes per packet. It forwards both to the server, which looks up the auth model by that
id and recomputes the same HMAC. When the two disagree the session fails — permanently, and quietly,
because the failure surfaces as a generic server rejection.

Everything on this page branches on the socket's **`kind`**, never on which slot is active.

## Why kind, and not the active server

Relay and cloud run their refresh loops at the same time. A refresh packet carries an `authId` and a
signature that the server checks against each other, and both have to correspond to _that_ socket's
server. Branching on a global "active server" routes a relay refresh into cloud storage whenever a
cloud session is up, and the relay credential goes stale while nothing reports a problem.

So the `kind` is fixed in a closure at slot boot — `SocketBinder` passes it explicitly to
`bootstrapSocketConnection`, which never re-derives it from the config. The SDK's
`AuthTokenView.cloudId` is not a substitute: a relay token can carry one.

## The material, per kind

[`sessionAuthAdapter`](../../src/session/auth/sessionAuthAdapter.ts) is the only thing that reads it.

|           | register token                  | `authId` — the HMAC's outer key             |
| --------- | ------------------------------- | ------------------------------------------- |
| **relay** | `relayStore.getIdentityToken()` | `relayStore.getRelayToken()?.$auth?.id`     |
| **cloud** | `cloudStore.getIdentityToken()` | `cloudStore.getCloudToken()?.Token?.authId` |

**The relay `authId` is `$auth.id`, not `Token.authId`.** The relay server looks the auth model up by
`$auth.id` and keys the signature on it; `Token.authId` is the id the HTTP refresh path uses. Sending
the HTTP one makes the server compute a different signature and fail with `no auth model`, forever.
Cloud is the other way round — a token minted by `exchange-token` is keyed by `Token.authId`.

`getAuthRegistration` returns `null` when either field is missing, so the caller defers `register`
rather than seeding a half-registration. It also carries a diagnostic `signing: { accountId,
identityId }` — not used for anything, but present in the warnings below, because the question that
follows a signature rejection is always _which of the three keys does the server disagree with_, and
answering it once cost a production database read.

## The signature does not depend on the token

`calcSignature` hashes `{ authId, accountId, identityId, identityToken: '' }` with `current` (an ISO
timestamp) and the user agent, nesting the HMAC keys `authId → accountId → identityId`. **The
identity-token slot is always the empty string.**

Two consequences:

- The `token` the SDK passes into `sign` is **ignored**. The signature is computed from the store, by `kind`.
- `ctx.target` — present only on a site switch — does not change the signature either. The SDK carries `target` in the `auth.switch` packet alone.

Relay picks its inputs with more care than cloud, because a site switch makes them disagree:

- `accountId` prefers `$auth.accountId` and falls back to `Token.accountId`. Today those are the same value, so this pins the _source_ rather than the value — and it stops being a no-op the moment the backend uses its `accountId` override, which rewrites `Token.accountId` alone. A mismatch between the two is logged.
- `identityId` is taken from `Token`, because the wire never carries `$auth.identityId` even though the type declares it — the serializer emits that field only on a branch this response does not take. Reading it there would typecheck and be `undefined` forever.

Missing fields throw rather than sign with a blank: `Missing relay token fields for socket auth
signature`.

## Writeback

`commitRefreshedToken(kind, view)` is the **only** path by which a refreshed token reaches the store,
and the two kinds are deliberately asymmetric.

**cloud — persist, and level the cache.** `mergeRefreshedCloudToken` is a shallow merge over the
stored view (so profile fields on a slim refresh view are not lost) and then a single store write.
Nothing signs HTTP with the cloud credential: the one request that did was the cloud HTTP refresh,
which no longer exists, and requests bound for a cloud host are relay-signed. What the cloud token
still owes is the socket signature, and that reads the store live on every packet — so persisting is
the whole job. The per-cloud token cache is updated in the same breath, because that cache is the
_other_ copy of this token and serves a later re-entry into the same cloud; leaving it behind lets a
re-entry install the pre-refresh credential and re-open the window this writeback just closed.

**relay — merge by rule, then rebuild the AWS credential cache.** `mergeRefreshedRelayToken` spreads
the stored view first (a socket refresh view is not guaranteed to be a full user view, and the relay
token is also the account-profile display source — without the merge a slim refresh blanks the
profile header mid-session), then the fresh one, then puts four things back by hand.

| Preserved        | Why                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$auth`          | Kept, not adopted — see below. Keyed on `.id` being present, so a stored `$auth` with no id still loses to the view                                                                                    |
| `identityToken`  | A refresh view may omit it, but relay requires it: signed HTTP sends it as `x-lemon-identity` and the next `register` reads it back                                                                    |
| `identityPoolId` | Routinely omitted, and this merge feeds two stores — lemon's own `saveOAuthToken` overwrites the field with `''`, so without this line the pool id is lost after the first socket refresh              |
| `credential`     | This copy is the only record of which credential is currently signing. Dropping it makes the store disagree with the signer, and the credential clock reports "cannot measure" for exactly that window |

**Preserving `$auth` is a workaround for a backend defect, and it should be reverted when the backend
is fixed.** A site switch makes the backend mint a _child_ auth model and return it as `$auth`, while
`Token` in the same response comes from a refresh issued against the parent. The child is written
without an `identityId`. Adopting it leaves the store signing with the child's `authId` and the
parent's `identityId`, while the server recomputes the same HMAC with `identityId` of `''` — and
every later refresh returns `403 NOT ALLOWED - invalid sign` against that child id, permanently,
until a new login. The session then dies in silence, because log upload dies with the credential.
Preserving is a no-op on the ordinary refresh branch, which returns the same `$auth` it loaded; a
genuinely new session does not come through here at all (`relaySession` writes the view wholesale).
When the server does return a different `$auth.id`, the merge says so in a warning rather than
dropping it silently.

The credential rebuild has its own guard. `credential` is optional on the wire, and lemon's
`buildCredentialsByToken` throws when it is absent — which used to take the store write down with it
_silently_, because the caller fires the writeback with `void` and the refresh had already reported
success. So it rebuilds only when the view actually carries an access key, warns loudly when it does
not (signed HTTP keeps signing with the previous credential, which is exactly the state that 403s
once it lapses), and writes the store either way. It reads the credential off the **view**, not off
the merged result — the merged one inherits the previous credential, so asking it would rebuild
lemon's cache from what it already holds and silence the one warning that matters.

Both kinds end with `rebuildSessionIdentity()`, which re-derives uid and identity from what was just
written and emits `identity` only if something actually moved.

## The `authId` registry

A refresh packet carries two things from different places: the `authId` is the SDK controller's own
private field, assigned at construction, at `register()` and at `logout()` and never touched by a
refresh response; the signature is recomputed by the sign callback from the **store** on every
packet. When the store's `$auth.id` moves and the controller does not, the server _finds_ the auth
model by the stale id — so the error is not `no auth model` — and verifies a signature keyed on it
against one keyed on the fresh id: `403 NOT ALLOWED - invalid sign @refreshAccessToken(<stale
authId>)`. Nothing re-seeds the controller afterwards, so the session 403s on every refresh until the
user logs in again.

[`authIdRegistry`](../../src/socket/auth/authIdRegistry.ts) mirrors what each slot was last registered
with, one entry per kind, and `resync` corrects a drift. Three properties are load-bearing:

- **A bare `register()` is the whole correction.** On an active controller it swaps the token, id and sign callback and sends nothing. `reauthenticateActiveSocket`'s `logout → register` would be wrong here — the identity did not change, only the id the packets quote, and revoking a live backend session to fix a field would log the user out over bookkeeping.
- **An unrecorded slot is not drift.** A divergence that was never observed cannot be proved, and guessing would fire a needless register on every boot.
- **It re-closes the activation gate** when the client is not connected, so the `device.save:ok` ordering survives the correction.

`resync` runs on every writeback and inside `reauthenticateActiveSocket`'s no-op branch. It logs the
recorded id, the current one and the signing material — this is the only place the divergence is
observable at all. Now that the relay merge preserves the stored `$auth`, the relay drift it was
built for no longer originates in the writeback; what remains is rotation from elsewhere (a re-login,
which writes the view wholesale) and cloud, whose merge still adopts.

## Verifying a change here

Nothing on this page can be checked by reading the client alone — the other half is a server that
recomputes the same hash.

- `getAuthRegistration(kind)` reads the right id per kind: `$auth.id` for relay, `Token.authId` for cloud.
- `signAuth(kind, target?)` produces the same signature with and without `target`.
- `commitRefreshedToken(kind, view)` routes to the right store, and relay rebuilds the credential cache only when the view carries one.
- A relay refresh arriving while cloud is active lands in the relay store, never the active one.
- A failed `auth.switch` leaves the stored token and site untouched — no writeback runs.

The tests that fix these are `sessionAuthAdapter.test.ts`, `tokenMerge.test.ts` and
`authIdRegistry.test.ts`.

## Further reading

- [README.md](./README.md) — the state machine, the boot gate, and the renewers that trigger a refresh
- [docs/session/](../session/README.md) — the stores this reads and writes
- [`libs/auth-sign`](../../../auth-sign/README.md) — the HMAC itself
