# live socket — changing what an already-connected socket signs with

The rules for swapping an identity, writing a refreshed token back, renewing or leaving a cloud, and
waking slots, where the reason is not visible from the code that does it. The mechanisms are in
[the socket doc](./README.md) (booting, re-authentication, renewal, waking) and the packet contract
in [signing.md](./signing.md).

## Applying a session token

`applySessionToken` is how a login that arrives over the socket (a phone confirm, a pairing approval)
becomes the relay slot's identity on the connection that is already open.

- **An identity swap is `logout()` then `register()`.** The SDK's `auth.refresh` and `auth.switch`
  re-sign the identity the controller already holds, so they cannot carry another user's token. That
  is why the swap goes through `reauthenticateActiveSocket`, and why it is awaited: afterwards
  `invite.create` and `invite.accept`, which are refused for a device user, work on the same
  connection.
- **The store leads and the socket follows.** `relaySession.loginByToken` commits first, so the
  `SocketReauthBinder` that sees the same token change finds the controller already holding it and
  does nothing (the token-equality guard).
- **Only the relay slot is touched.** An active cloud session keeps its own delegated identity.
- **A token with no identity token is not applied** (nothing to switch to), and one with no
  `$auth.id` is rejected before anything is committed: the relay socket cannot register without it,
  and committing anyway would leave the HTTP identity and the socket identity split.
- **No relay slot bound yet** is not a failure. The committed token is what the next boot registers
  from, and there is no live connection to wait on.
- **The post-condition check exists because two quiet paths hide a failed swap.**
  `reauthenticateActiveSocket` returns silently when the store holds no registration to read back,
  and `ready()` resolves at once on a socket that is still authenticated as the previous identity.
  Together they would report success while the connection is still the device user, and the caller's
  next `invite.create` would be refused. Rejecting when `auth.token` is not the new identity token
  keeps the failure where the screen can retry just the switch; the one-time code is already spent.
- **The wait has a deadline.** `ready()` never times out by itself — a disconnected socket parks it
  until the reconnect — so a 10 s deadline keeps the screen from hanging. The committed token still
  applies on the next successful handshake.
- **The old session is revoked only on a verified slot.** `auth.logout` is pointless on a socket that
  is not connected, so it is skipped there, but `register()` still runs, so the new identity is
  applied at the next handshake and a promotion that coincides with a brief disconnect is not lost.

## Writing a refresh back

- **The writeback runs after the refresh was reported as a success.** The `onTokenRefresh` emission
  resolves `requestRelaySessionRefresh` first and the commit follows. A failed commit is therefore
  logged and swallowed per slot: unhandled, it would leave the caller believing the credentials are
  fresh while every signed request keeps failing, and one slot's failure must not break the other
  slots' listeners.
- **A failed commit also skips the `authId` re-sync.** The store still holds the previous `$auth`, so
  re-syncing to it would pin the controller to stale material instead of correcting it.
- **A refresh only goes into a connection whose handshake completed.** After a transport drop the
  controller still reads `authenticated` from the connection that died, because stopping it clears
  the active flag and the timers but not the state value. A refresh sent in that window reaches a new
  connection with no device linked and is answered `400 BAD REQUEST - no device linked`, burning an
  attempt on a race. `verified` and `stale` are the only statuses past the
  verified-on-this-connection gate, which is why they are the only ones that may refresh.
- **A rejected refresh is that attempt's answer, not a verdict on the session.** The controller's own
  backoff keeps retrying behind it and decides when to go terminal. The error carries its reason only
  in the message, so there is nothing to branch on.

## Renewing a cloud

- **Renewal exists for the time the cloud's socket cannot refresh.** The only thing that re-mints a
  cloud credential in a running session is that socket's refresh writeback. While the socket is down
  (a sleep, a dropped connection, a long stay in one place) nothing else measured it, and cloud-signed
  requests started failing unnoticed. Re-entering a cloud hid this, because a switch re-issues; it
  showed only for a session that stayed put.
- **Re-registering the socket is part of the renewal** because a cloud slot's binding carries no
  identity token. Neither `SocketBinder` (its reboot key is `url|deviceId|wssType`) nor
  `SocketReauthBinder` reacts to a token change inside the same cloud, so without the explicit
  re-register the SDK replays the lapsed token until it burns `maxFailures` and the cloud is dropped.
- **One renewal per cloud at a time, with no result memo.** The cloud's timer, the foreground trigger
  and any 403 handler collapse into one exchange; two clouds renew side by side. A renewal is two
  round trips against the same parent identity, and unlike the relay refresh there is no burst to
  absorb, so a remembered "already renewed" answer would only skip a genuinely needed re-issue.
- **A failed re-issue is usually the relay leg.** `delegate-cloud` is signed with the relay
  credential, so a stale relay credential fails it too; the caller retries and the relay guard owns
  that half.

## Leaving a cloud

- **Leaving the committed cloud is not signing out of it.** A cloud the account still belongs to stays
  a background slot, the same client now one the user is not looking at, so telling its socket to log
  out would end the session the slot is about to keep. `logoutCloudSession` therefore sends
  `auth.logout` only when the cloud has no live joined session left and is not held.
- **A held cloud is not logged out either.** A cloud that a send is still in flight to
  (`backgroundClouds.hold`) keeps its slot for the send, and a logout on that socket would
  unauthenticate it under the acknowledgement. When the hold ends the binder tears the slot down, and
  closing the socket ends the session then.
- **A terminal expiry does not notify the socket.** `onAuthExpired` runs on the socket that just
  died, so the renewers take the store-only teardown (`clearStores`, `clearAndRedirect`) rather than
  the app-facing logouts that send `auth.logout`.

## Waking slots

- **The active slot goes first.** Each kick awaits a disconnect and a connect, and with a background
  session per cloud there can be several slots behind it, so the one the user is looking at should
  not wait for all of them.
- **One coalescer serves both wake passes.** `recoverSocketsOnResume` and `recoverUnverifiedSockets`
  share it, so a call that arrives while either runs joins that pass. Two coalescers would let both
  passes recycle the same slot at once. The consequence is that a resume call joining a plain pass
  gets no probe; no app calls both (apps/web uses the resume pass, admin the plain one).
- **A re-seed on a kick happens on the closed socket,** so no `auth.update` is fired into the void and
  burns a failure from the controller's budget.
