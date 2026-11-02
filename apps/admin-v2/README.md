# @chatic/admin-v2

**The internal operator console** — subscription overrides, failure tracing, redeploying the
subscription clouds after a server update, relay user registration, and the multi-client WebSocket
lab used to verify the socket stack directly, all behind one login gate. It depends on
`@chatic/app-runtime` alone for session, socket and repository access; it does not import
`@chatic/data` directly, so the runtime stays the one window this app looks through the stack with.

This document covers the **overview and structure** only. Per-feature detail is under
[`docs/`](docs/README.md).

## Scope

Console features for operators: viewing and overriding user subscriptions, tracing user reports and
structured logs, redeploying the subscription clouds through the goods service, listing and
registering relay users, and a WebSocket verification lab. Not a general admin panel for the whole product —
each feature exists because an operator needed it, not because "admin" implies it.

## Login and session

Sign-in is explicit and required — see [auth/](docs/auth/README.md). Unlike the client apps, this
app never falls back to a guest session; `ProtectedRoute` gates every screen behind an authenticated
admin session, and a silent guest fallback would defeat that gate.

## Stage endpoints

Several screens switch between the dev (`d1`) and production (`v1`) stage at run time — memberships,
cloud deployments, the log console and the socket lab's Observe tab — so one build reaches both
stages. Each service's base on each stage is its own env key, read through
`src/app/config/stageEndpoints.ts`:

| Service                                 | `d1` key                    | `v1` key                    |
| --------------------------------------- | --------------------------- | --------------------------- |
| Relay (`dou-XX`)                        | `VITE_D1_RELAY_ENDPOINT`    | `VITE_V1_RELAY_ENDPOINT`    |
| Goods (`cgs-XX`)                        | `VITE_D1_GOODS_ENDPOINT`    | `VITE_V1_GOODS_ENDPOINT`    |
| Archive (`arc-XX`)                      | `VITE_D1_ARCHIVE_ENDPOINT`  | `VITE_V1_ARCHIVE_ENDPOINT`  |
| Socket users and presence (`skt-XX`)    | `VITE_D1_PRESENCE_ENDPOINT` | `VITE_V1_PRESENCE_ENDPOINT` |
| Socket (`cht-XX`, the `?v2` flag added) | `VITE_D1_WS_ENDPOINT`       | `VITE_V1_WS_ENDPOINT`       |

- **No address is derived from another.** These screens used to rebuild the other stage by swapping
  the path segment of `VITE_DOU_ENDPOINT` (`dou-d1` → `dou-v1`, `cgs-d1`, …) on the same host. That
  stopped being true when the dev stage moved to a new domain while production stayed: the two
  stages no longer share a host, and a rebuilt URL names a server that does not exist.
- **The same ten values go into every `.env` of this app.** What differs between builds is the stage
  the session signs in to — the runtime keys (`VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT`, …) — not
  where each stage lives. The deploy workflows write them from `ADMIN_<STAGE>_<SERVICE>_ENDPOINT`
  Actions secrets, with no DEV/PROD split for the same reason. The one exception is
  `VITE_V1_WS_ENDPOINT`, written from the web app's `WEB_PROD_WS_ENDPOINT`: it is the same production
  socket, and the repository is at GitHub's 100-secret limit.
- **An unset key leaves that stage unconfigured.** The screen shows "(not configured)", the queries
  stay off, and a call that would otherwise fall back somewhere throws with the missing key's name —
  never the session's own relay standing in for the other stage.
- The memberships console still sends calls on the session's own stage without an override, so the
  http client's deep-link and `window.DOU_ENDPOINT` overrides keep working — see
  [memberships/](docs/memberships/README.md).

## Documents

See [`docs/README.md`](docs/README.md) for the category index.
