# @chatic/admin-v2

**The internal operator console** — subscription overrides, failure tracing, and the multi-client
WebSocket lab used to verify the socket stack directly, all behind one login gate. It depends on
`@chatic/app-runtime` alone for session, socket and repository access; it does not import
`@chatic/data` directly, so the runtime stays the one window this app looks through the stack with.

This document covers the **overview and structure** only. Per-feature detail is under
[`docs/`](docs/README.md).

## Scope

Console features for operators: viewing and overriding user subscriptions, tracing user reports and
structured logs, and a WebSocket verification lab. Not a general admin panel for the whole product —
each feature exists because an operator needed it, not because "admin" implies it.

## Login and session

Sign-in is explicit and required — see [auth/](docs/auth/README.md). Unlike the client apps, this
app never falls back to a guest session; `ProtectedRoute` gates every screen behind an authenticated
admin session, and a silent guest fallback would defeat that gate.

## Documents

See [`docs/README.md`](docs/README.md) for the category index.
