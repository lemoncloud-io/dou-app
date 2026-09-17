# ADR-0081: A server-revoked relay session is that session's verdict — end it locally at `auth.switch`

> Status: Accepted · Decided: 2026-09-11 · Implementation: `af161996` (PR #445)
> Scope: `libs/app-runtime/src/socket/auth/revokedSession.ts` (new) · `libs/app-runtime/src/socket/auth/switchSite.ts`
> Related: [ADR-0076](./0076-app-runtime-auth-single-verdict-and-typed-session-events.md) (single verdict for auth
> state — this document covers "revoke," missing from that verdict list) · [ADR-0070](./0070-app-runtime-session-hub.md)

## Context

### Symptom

On desktop-web, tapping a cloud tile shows a `Couldn't switch cloud. Try again.` toast, and about 30 seconds later
the entire session disappears. The console shows 403s from three different paths starting right after boot.

```
GET  …/clouds/0/list?limit=-1&view=mine   403 (Forbidden)
POST …/users/0/reg-dev?force=true         403 (Forbidden)
AuthSwitchError: auth.switch failed: server
  Caused by: Error: 403 NOT ALLOWED - session revoked @refreshAccessToken(…) - auth.switch:error
```

Three paths failing at once means it's not a feature bug — one session died. `session revoked` is neither expiry
(`expired`) nor a signature error (`invalid sign`) — it's a **revoke**.

### A revoke can't be undone

The backend stamps `revoked` onto the auth row in `POST /users/0/logout` (`doLogout`). After that, every refresh and
issue for that session gets blocked with `403 NOT ALLOWED - session revoked @<scope>`
(chatic-backend-api `service/backend-proxy.ts`). Nothing the client holds can revive this session. Refresh is 403,
and `delegate-cloud` — the first step of switching clouds — is also a relay signing request, so it's 403 too.

### The runtime treats a revoked session as still logged in

`identity.isAuthenticated` is a **session-exists** verdict (`hasStoredRelaySession`). A dead token is still in
storage, so it reads true. So `useRelaySessionKeepAlive`'s guest login doesn't run, and each screen shows its own
generic failure independently. The session eventually ends once `RelayCredentialRenewer.onTerminalExpiry` passes the
SDK's failure limit and its 30-second confirmation window, but nothing records why it ended.

### The root cause was logout itself

When `7139e42c` retired `libs/web-config`, it also removed the side effect that read `?logout=1` and cleared storage
keys. Logout revokes the session on the server, and the document that returns to `/?logout=1` no longer cleared that
token before rebooting. The cleanup was restored in `1a83ee65` (`logoutStorageSweep.ts`), and operations went back to
normal with a develop redeploy.

Still, the path where a stored token dies on the server side remains. Another device's `?aid=` logout, an admin
revoke, or the cleanup breaking again are all cases. This decision is the **safety net** for those paths.

## Decision

### 1. Read a revoke rejection as the session's verdict, not this request's

`isRevokedSessionError` returns true if `session revoked` shows up anywhere in the error's `cause` chain. It's a
string match because that information only exists as a string — the socket carries the server error as text, and
there's no status code to read. A circular `cause` is cut off at depth 5.

### 2. There is exactly one detection point: `auth.switch`

Only `switchSite`'s `catch` calls the verdict. The other two candidates can't receive this information.

| Path                                           | Can it read revoke? | Why                                                                                                                             |
| ---------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `auth.switch`                                  | yes                 | `AuthSwitchError` preserves the server error as `cause`                                                                         |
| `auth.refresh`                                 | no                  | the SDK's `doRefresh` drops the server error and throws `Error('auth.refresh failed: server')`                                  |
| Signed HTTP (`clouds/0/list`·`delegate-cloud`) | no                  | API Gateway's 403 carries no CORS header, so the browser reports it as a network failure (`HttpManager` already documents this) |

`switchSite` still rolls back the optimistic site and rethrows the error after the verdict, exactly as before. The
caller's contract doesn't change.

### 3. Teardown is `clearAndRedirect` — not `logoutSession`

`logoutSession` fires a socket `auth.logout` first, and on an already-revoked session, the same guard returns 403.
There's nothing left to revoke. Only a **local** teardown is needed. `relaySession.clearAndRedirect()` goes to
`/?logout=1`, and the next document's `logoutStorageSweeper` clears the stored token. Then
`useRelaySessionKeepAlive` sees no session and runs the guest login.

> Amended 2026-09-17, desktop only. `apps/desktop-web` now mounts `RuntimeAuthHost`, the host without background
> guest login, so on that shell the teardown above ends at the welcome screen instead of re-entering as a guest.
> The reason is that the keep-alive also claimed the first paint of a deliberate visit: it minted a guest account
> per window, which made the sign-in paths unreachable and turned Log out into a no-op. Recovery is one tap on
> the welcome screen's own guest button. `apps/web`, `apps/mobile` and `apps/testbed` keep the behavior described
> here.

Keeping token deletion in the next document's cleanup rather than this module is deliberate. This module exists to
end the zombie sessions created during the period that separation was broken.

### 4. Only once per page lifetime

A revoked session fails every request, so the verdict can fire multiple times before the redirect actually navigates.
A module-level flag handles it once, with a test-only `resetRevokedSessionHandling`.

## Alternatives

- **Turn `isAuthenticated` into a validity verdict** — rejected. Validity can't be known without a server round trip,
  and it touches the entire verdict structure ADR-0076 laid out. This defect wasn't caused by a wrong existence
  verdict — it was caused by nobody reading the revoke signal.
- **Log out normally via `logoutSession`** — rejected. Its first step, `auth.logout`, fails with 403 (Decision 3).
- **Add the verdict to the refresh and HTTP paths too** — deferred. Both paths lose the information at the transport
  layer (the table in Decision 2). That's an SDK/gateway limitation, not this change's code, and out of this change's
  scope.
- **Leave it to `onTerminalExpiry` (current behavior)** — rejected. The end state is the same, but 30 seconds of
  unexplained 403s happen first, with nothing recorded.

## Consequences

### What is gained

- A place switch that hits a revoke recovers immediately into a guest session. The log carries a `[revokedSession]`
  cause.
- `switchSite.test.ts`'s revoke case is red without modification (1 of 11 failing). `revokedSession.test.ts`'s 6
  cases pin down the `cause` chain, 3 similar-looking errors (`invalid sign`·`refresh failed: server`·
  `not-connected`), and circular `cause`.

### Trade-offs accepted

- **A session that only ever tapped a cloud tile still sees the generic toast.** Cloud switching's failure point is
  the signed HTTP call, which can't read revoke. That case still ends through the existing `onTerminalExpiry` path.
- Email/social users must log in again. A revoked session isn't meant to be recovered — this just reaches the same
  end state as an automatic logout, faster.

### When to reverse

Delete the single `isRevokedSessionError` branch in `switchSite.ts` to return to the previous behavior.

## Next steps

- Widening detection requires sockets-lib's `doRefresh` to preserve the server error from a failed refresh as
  `cause`. Then `requestRelaySessionRefresh`'s `catch` could call the same verdict.
- Manual verification is still pending: boot with a revoked session, switch place, and confirm the redirect and
  guest re-login.
