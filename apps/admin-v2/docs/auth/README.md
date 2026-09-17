# auth

**OAuth login hydration, and the token refresh loop admin never had before this.** Two problems in
one lane: a redirect bug after social sign-in, and the fact that admin-v2 had no refresh path at
all, so a dashboard left open long enough force-logged out mid-session. Feature code:
`apps/admin-v2/src/app/features/auth`.

## Session state changes through one gate

`isAuthenticated` is observed via `useSyncExternalStore` and only flips when a session-store write
emits its own `SessionSignalKind` — building credentials (SDK/AWS) alone does not authenticate a
session; the login path has to reach relay-session application to actually flip the flag.

`OAuthResponsePage` relies on this being a **single call**: `runtime.session.createCredentialsByProvider(provider,
code)` applies the relay session — token storage, `setSessionAuthenticated(true)`, and the notify —
in one step. It used to build transport credentials only, requiring a follow-up
`refreshRelaySession({ syncProfile: true })` to recover identity; that follow-up call is gone because
the exchange response itself now carries what it needs.

## admin only signs in explicitly

admin-v2 uses `runtime.connection.RuntimeAuthHost`, not `RuntimeConnectionHost` — the same
underlying connection host, mounted with `guestKeepAlive={false}` instead of `true`. It runs the
relay-session init and the SDK-backed socket auth/refresh loop, but never falls back to a guest
session on its own. That is deliberate: `ProtectedRoute`'s "signed in as an admin, or bounce to
login" model would be broken by a silent guest session standing in as "authenticated." Nothing else
in this app owns cloud/place session state or chat data sync — admin has no use for either, so the
host mounts no socket slot beyond the relay one.

## Refresh is the SDK's, not admin's

Token refresh is owned by the SDK's `AuthController` (refresh ratio 0.8, with a 5-minute fallback),
reached through the same relay socket the auth host opens. There is no admin-local polling hook —
one existed once, was deleted, and is not coming back; refresh is the SDK's job. When it fires, the
refreshed token is written back through the session store, which also rebuilds the AWS credentials
used to sign HTTP requests — so a report query issued after a long-open dashboard session signs with
fresh credentials instead of tripping an expiry logout.

## Login hydration flow

1. An unauthenticated request to a protected route bounces to `/auth/login`, with the original path
   preserved as `state.from`.
2. The login page carries `from` through the OAuth `state` parameter into the social provider
   redirect.
3. The callback (`/auth/oauth-response`) exchanges the code via `createCredentialsByProvider`, which
   commits the session as described above.
4. With `isAuthenticated` now true, navigation to `from` succeeds — no bounce back to login.

## Verifying

- **Redirect:** hit a protected route (e.g. `/report-logs`) while signed out, log in, and land back
  on that same route after the callback — not back on `/auth/login`.
- **Refresh:** leave a dashboard open past a token's TTL, then re-query a report; it should succeed
  without a forced logout. Confirm in dev tools: the relay socket connects, an `onTokenRefresh` event
  fires, and the subsequent signed HTTP request succeeds.
