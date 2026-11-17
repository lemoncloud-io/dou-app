# ADR-0335: The admin console signs in on the backend its socket refreshes against

> Status: Accepted · Decided: 2026-11-17 · Implemented: `docs/admin-signin-chatic-backend` (the code
> did not change; the `ADMIN_*_OAUTH_ENDPOINT` Actions secrets and the admin `.env` files did)
> · Scope: `apps/admin` sign-in (`VITE_OAUTH_ENDPOINT`) and the admin gate (`ProtectedRoute`)
> · Amends: [ADR-0268](./0268-admin-stage-targets-are-configured-per-stage.md) decision 4 (where "the
> admin accounts live on `v1`")
> · The behaviour is documented in [apps/admin README](../../apps/admin/README.md#stage-endpoints) and
> [docs/auth](../../apps/admin/docs/auth/README.md)

## Context

The admin console signed in on a different account backend from the one the client apps use. Both
backends sign identity tokens with the same key, so the relay socket accepted the admin's token and
signed HTTP calls to the relay worked. What did not work was renewing it.

Token refresh belongs to the SDK's `AuthController` on the relay socket (ADR-0070). The relay socket
forwards `auth.refresh` to the relay backend, and the relay backend looks the session up in its own
auth table by its id. A session minted by the other backend was never in that table, so every refresh
was answered `400 INVALID - no auth found (or expired) @oauthRefresh(<id>)`.

The refresh ratio is 0.8 of a one-hour token, so this happened 48 minutes after every admin sign-in.
The controller retried four times and then went terminal. About a minute later
`RelayCredentialRenewer` cleared the session and sent the operator back to the login page. Each try also
raised a backend error report, so every admin session that stayed open 48 minutes sent four alerts. It
went unnoticed while the admin relay socket pointed at a stage that refused connections, because then
there was no refresh at all. It started on 2026-11-02, when the socket moved to the production relay.

## Decision

1. **The admin console signs in on the relay backend's production stage**, the same backend its relay
   socket refreshes against. `VITE_OAUTH_ENDPOINT` names it in every build, development builds included.
   The rule underneath it: **a session is issued by the backend that will renew it.**
2. **Admin access is the relay backend's site role.** The gate reads `$role.role` from
   `GET /users/0/profile` on that same backend, and only `admin` passes. An operator needs that role
   on the relay backend's production stage. The identity token's `roles` claim is not what the gate
   reads, and a token claiming `admin` does not open the console while the site role is `user`.
3. **Refresh stays on the socket.** ADR-0070 holds for this app as it does for the client apps. An
   HTTP refresh against the old account backend was the alternative, and is not taken.

## Alternatives

- **Keep the old account backend and refresh over HTTP against it, admin only.** This needs no
  account change, but it is a second refresh engine beside the SDK's, which ADR-0070 removed on
  purpose. It would also have to switch off the controller's own refresh on the relay socket, or that
  refresh would keep failing and end the session anyway.
- **Point the admin relay socket at a socket service paired with the old account backend.** No such
  service carries refresh traffic today, so this could not be shown to work.
- **Have the relay backend forward unknown sessions to the other backend.** This couples two backends
  for one internal console, and it is the backend team's call, not this repo's.

## Consequences

- **Operators sign in as their relay account.** The relay backend issues a different user than the
  old account backend did, with a different site and user id. Each operator needs the `admin` site
  role granted on the relay backend's production stage before the console lets them in. The first
  grant has to be made on the backend itself, because no admin exists yet to grant it.
- **A tab signed in before the switch still ends 48 minutes after its sign-in.** Its session belongs to
  the old backend. Signing in again fixes it.
- **AWS permissions do not change.** Both backends hand out credentials from the same identity pool,
  so what the signed-in operator may invoke is the same as before. A goods stage that the
  authenticated role may not invoke stays closed until that role is granted it. The cloud
  deployments screen then shows "No response from the goods service (Network Error)", because the
  403 carries no CORS header.
