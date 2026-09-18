# ADR-0028: admin-v2 auth hydration, token refresh (adopting app-runtime), and wider log analysis

> Status: Accepted · Decided: 2026-07-23

## Context

Using admin-v2 (which gained the report log screen in [ADR-0087](0087-admin-v2-report-log-list.md))
surfaced two auth and session problems, plus a request to widen the log analysis.

**1) The redirect after sign-in fails.** `apps/admin-v2/src/app/features/auth/OAuthResponsePage.tsx`
calls only `createCredentialsByProvider` and `fetchProfile`. But `createCredentialsByProvider`
(`libs/web-core/src/transport/authRuntime.ts`) stores the SDK token and builds AWS credentials without
calling `relayCore.saveRelayToken`, `setSessionAuthenticated(true)` or notify, and `fetchProfile` does
not change session state either. So `useSessionAuth().isAuthenticated` stays `false` and
`apps/admin-v2/src/app/components/ProtectedRoute.tsx` sends the user back to `/auth/login`. (On a full
reload, `initializeRelaySession` reads the SDK store and recovers, which makes it look like "refreshing
fixes it".) This is not a timing race: on this path the flag is **never set at all**.

**2) There is no refresh for an expired token.** admin-v2 does not mount app-runtime, so it has neither
the SDK `AuthController`'s automatic refresh nor any manual refresh call. Apart from one
`initializeRelaySession` at boot there is no refresh path, so on expiry a signed request gets
403/INVALID_TOKEN → `handleAuthError` → an alert and a forced move to `/auth/logout`. (The old
`useTokenRefresh` hook that polled every 60 seconds was deleted from web-core — do not recreate it; see
the memory note.)

**3) A request to widen log analysis.** ADR-0087's list, aggregation and filters cover **only the loaded
page (≤1,000 records)**, so a particular uid or message cannot be found across the whole set (prod
measures about 7,760 records), and there are requests for more analysis and links to other features.

Constraints: admin-v2's socket-lab already opens its own WS (observation and probes), and at the app
level there is only the shared navigation (no app-runtime). `RuntimeConnectionHost` requires a `binding`
and a socket delegate, and `useRelaySessionKeepAlive(true)` signs a guest in automatically when
unauthenticated.

## Decision

**A. Fix the sign-in hydration (a bug).** In OAuthResponsePage, call
`refreshRelaySession({ syncProfile: true })` after `createCredentialsByProvider` — the pattern
apps/web's `apps/web/src/app/features/auth/hooks/useOAuthLogin.ts` uses. That call runs
`applyRelaySession` → `setSessionAuthenticated(true)` plus notify, so `isAuthenticated` is true before
`navigate` and ProtectedRoute lets it through. The lone `fetchProfile` call is replaced or removed.

**B. Token refresh = adopt app-runtime's `RuntimeConnectionHost`, minimally.** The SDK `AuthController`
owns the automatic refresh, and a renewed token is written back into web-core through
`commitServerRefreshedToken`, so subsequent signed HTTP requests use fresh credentials too.

- Scope: the socket session plus `SocketReauthBinder` (the reauth write-back), and nothing else. The
  data binding is a no-op or minimal.
- **Guest keep-alive (`useRelaySessionKeepAlive`) is off** — admin allows real sign-ins only.
- Remove the double boot from app.tsx's manual `startWebCoreInit()` and consolidate on
  `RuntimeConnectionHost`'s single `useInitWebCore` path.
- `useTokenRefresh` is not recreated.

**C. Wider log analysis — in scope this round:**

- **A socket-lab link**: jump from a report's `uid` / `deviceModel` into socket-lab Observe (reusing the
  existing user search and device observation APIs) to see "the current state of the user who hit this
  error".
- **A time series / spike view**: an error-rate-over-time chart plus spike detection (reusing
  socket-lab's existing chart components).
- **A bundle of conveniences**: switching stage (d1/v1), relative timestamps, auto refresh, CSV export.

**Out of scope this round:**

- **Server-side filtering and search** — whether `/mocks/0/list` supports search, range and uid
  parameters is unconfirmed. Handle it separately once the backend is checked (until then filters and
  aggregation stay limited to the loaded page, and the UI says so).

## Alternatives

- **Refresh through a manual schedule or 401 recovery** — call `refreshRelaySession` periodically near
  expiry and hook it into 401 recovery. Lightest, and no socket needed. But the automation has to be
  written by hand, duplicating a refresh the SDK already owns and has proven → dropped, since the user
  chose to adopt app-runtime.
- **Refresh: leave it as it is (expiry = sign out)** — at odds with keeping a monitoring dashboard open
  for a long time → dropped.
- **app-runtime: the full AppRuntime** — including the chat data binding, as apps/web does. admin-v2
  does not need it, so it is too much → narrowed to a minimal RuntimeConnectionHost.
- **Refresh: wire reauth alone, by hand** — connect just the AuthController part without pulling in
  app-runtime. Lightest, but it means hand-wiring and a maintenance fork → dropped.
- **Logs: build server-side filtering now** — starting before the backend parameters are confirmed
  risks building the wrong thing → excluded.

## Consequences

- **Upside**: the sign-in redirect works, the session is kept alive automatically by the SDK
  AuthController so a long-open dashboard signs out less, and the log screen links into socket-lab so
  "error → user state" is one flow.
- **Trade-offs and risks**:
    - Adopting app-runtime **adds a socket session layer** to admin-v2 (the administrator's own
      session). It serves a different purpose from socket-lab's observation socket and the two coexist,
      but there are now two layers, and `RuntimeConnectionHost`'s binding and delegate plumbing is
      needed.
    - AuthController's refresh runs **on top of the socket auth loop**. Whether refresh over the relay
      socket alone suffices while admin-v2 has no cloud selected has to be verified during
      implementation.
    - Removing the `startWebCoreInit` double boot needs a check that the initialisation order does not
      regress.
    - With guest keep-alive off, an unauthenticated user stays on the sign-in screen (intended).
    - With server-side filtering excluded, precise searching over large log volumes stays page-limited
      until the next round.

## Next steps

This ADR feeds Phase A of [[dev-2_implement]]. What the spec settles first: the minimal
`RuntimeConnectionHost` binding, verifying relay-only refresh, and where the socket-lab jump attaches.
ADR-0087's report-logs document is revised to reflect this extension (C).
