# ADR-0117: Socket authentication is keyed by the slot's cloud, not by the server kind

> Status: Accepted (decision 4's terminal-expiry cache rule is amended → [ADR-0119](0119-every-joined-cloud-keeps-a-socket-session.md)) · Decided: 2026-09-28 · Implemented: `feat/per-cloud-socket-auth`
> · Scope: `libs/app-runtime/src/session/auth/**` · `libs/app-runtime/src/session/store/cloudStore.ts` ·
> `libs/app-runtime/src/socket/auth/**` · `libs/app-runtime/src/session/hooks/app/useCloudCredentialGuard.ts`
> · Builds on: [ADR-0115](./0115-a-socket-slot-is-keyed-by-the-cloud-it-serves.md) (slots keyed by cid) ·
> [ADR-0116](./0116-the-active-socket-slot-is-a-pointer-the-binder-sets.md) (the active slot is a pointer)
> · Related: [ADR-0076](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md) (the per-kind delegate and
> the two renewers this generalises)
> · The module docs are [libs/app-runtime/docs/auth](../../libs/app-runtime/docs/auth/README.md) and
> [signing.md](../../libs/app-runtime/docs/auth/signing.md)

## Context

ADR-0115 made a socket slot addressable by the cloud it serves, and ADR-0116 let more than one cloud
slot exist at a time. Authentication did not follow. Everything a slot needs to stay authenticated —
the token it registers with, the material it signs each packet with, where a refreshed token is
written back, what to do when the SDK gives up — was still keyed by the server _kind_, `relay |
cloud`, and the `cloud` branch of every one of those read the session store's cloud token. The
session store holds one cloud token: the committed cloud's.

So the runtime could bind a slot for a second cloud, but that slot could not authenticate. Concretely:

- `getAuthRegistration('cloud')` and `signAuth('cloud')` answered from `cloudStore.getCloudToken()`,
  whatever cloud the asking slot served.
- `commitRefreshedToken('cloud', view)` wrote into the session store. A refresh arriving on a slot
  that was committed when it booted and is not any more — a switch away with the slot still alive —
  would have handed the newly committed cloud another cloud's token.
- `credentialRenewers.cloud` was one object: it measured the committed credential, re-issued the
  committed cloud, and on terminal expiry cleared the cloud stores — which drops the user out of the
  cloud they are in, even when the slot that expired served a different one.
- Nothing remembered which uid this account has in a cloud once that cloud's token was gone, so no
  reader could address another cloud's cache partition (`<type>:<cid>:<uid>:<id>`) without first
  re-issuing a token for it.

The goal this is a step toward is one socket session per joined cloud, so that a send addressed to
cloud A survives the user switching to B, and B's list stays fresh while A is on screen. That needs
each slot to hold its own credential, renew it, and expire alone.

## Decision

1. **The auth delegate, the session adapter behind it, and the credential clock are keyed by cloud
   id.** `SocketSessionDelegate` takes a `SlotKey`; `sessionAuthAdapter` and `credentialFreshness`
   take the cloud id that key is. The relay's is `RELAY_CLOUD_ID`, the same name the slot and the
   cache partition use for it, so "which server" has one spelling across the runtime. The kind
   remains an attribute (`kindOf`), used for logs and for choosing between the relay and cloud
   branches, never as an address.
2. **A cloud's material comes from `cloudStore.getCloudTokenOf(cid)`:** the session store's own token
   while `cid` is the committed cloud, the per-cloud token cache otherwise. The two are written level
   on every commit and writeback, so the committed cloud's behaviour is unchanged; what is new is that
   a cloud which is not committed can seed and sign. The cache read for this is `peekCachedCloudTokens`
   — margin-blind — because a socket that registered with a token keeps signing with it until it is
   renewed, and the margin-checked read deletes what it refuses to serve.
3. **Where a cloud's writeback lands is decided at write time.** `commitRefreshedToken(cid)` reads the
   committed cloud id when it runs: the committed cloud goes to the store, the cache and the derived
   identity as before; any other cloud merges into its cache entry alone, with no store write, no
   identity rebuild and no session signal. The same rule governs `reissueCloudTokens(cid)`, which
   replaces `reissueCommittedCloudTokens()`.
4. **One renewer per cloud.** `credentialRenewers.forSlot(key)` answers the relay renewer for the relay
   slot and a memoised `CloudCredentialRenewer(cid)` for a cloud, each with its own single-flight in
   `renewCloudSession(cid)`. Terminal expiry asks whether the cloud is committed at that moment: the
   committed cloud still clears the cloud stores; another cloud only loses its cached tokens.
5. **The cloud credential guard covers every cloud slot.** It measures the committed cloud and every
   cloud with a slot bound, renews each one that is due through its own renewer, and arms one timer on
   the earliest deadline. Today that set is one cloud; the shape is what a background slot needs.
6. **A cloud identity map outlives the tokens.** `cloudStore` persists `cid → { uid }`, recorded on
   every issue and writeback, kept across leaving a cloud, and cleared with the account
   (`relaySession.clearAndRedirect`). It is what a later reader of another cloud's cache partition
   will address it by.

## Alternatives

- **Keep the kind key and one cloud credential; renew background clouds by re-issuing on demand.**
  Re-issuing under a live socket changes the token the SDK controller holds, and a cloud slot carries
  no `identityToken` for a binder to watch, so every re-issue would need an explicit re-register
  anyway — which is exactly the per-cloud renewer. What this alternative saves is the per-cloud
  adapter, and without it a second slot cannot sign at all.
- **Give the cloud slot an `identityToken` and let `SocketReauthBinder` re-register it**, as the
  relay's guest-to-user promotion does. Rejected for this change: the per-cloud renewer already
  re-registers the slot explicitly, and a non-committed cloud's writeback deliberately emits no
  session signal, so the binder could not see the one case it would be for. Having both paths would
  also race two `logout → register` sequences on the same live socket.
- **A session store per cloud.** Heavier than the problem: the session has one committed cloud and
  everything derived from it (`activeServer`, the selected scope, the identity context) is defined by
  that one. The cache already holds the other clouds' tokens; the change is to let them be read.
- **Cloud identities inside the token cache entry.** The cache is dropped on terminal expiry and on
  leaving a cloud, and the uid is precisely what must survive both.

## Consequences

- A slot for a cloud that is not committed can boot, authenticate, refresh, renew and expire without
  touching the committed cloud's session. Nothing binds such a slot yet: the binder still asks for
  the relay slot and the committed cloud, so in a running app this change is a refactor. The
  non-committed paths are proved by unit tests (`sessionAuthAdapter`, `cloudTokens`, `renewers`,
  `renewCloudSession`, `useCloudCredentialGuard`, `cloudStore`), and they are what the background
  slots of the next steps will run on.
- `ServerKind` and `CredentialOwner` are gone. `ICredentialRenewer.owner` became `cid`.
  `credentialRenewers.cloud` became `credentialRenewers.forSlot(key)`; `credentialRenewers.relay`
  stays. `renewCloudSession()` takes the cloud id.
- Two things are deliberately left for the change that introduces background slots, because they
  have no caller until then: `cloudSession.switchTo` reusing a live slot's token instead of
  re-issuing near the cache margin, and `cloudStore.clearSession` keeping the cached tokens of clouds
  whose slots are alive.
- One new storage key, `chatic-cloud-identities`, under the session's own `chatic-` prefix. It is not
  swept by the `@`-namespace logout sweep, so it is cleared explicitly in `clearAndRedirect`.
