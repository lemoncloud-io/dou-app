# @chatic/admin

**The internal operator console** — subscription overrides, failure tracing, redeploying the
subscription clouds after a server update, relay user registration, and the multi-client WebSocket
lab used to verify the socket stack directly, all behind one login gate. It depends on
`@chatic/runtime` alone for session, socket and repository access; it does not import
`@chatic/data` directly, so the runtime stays the one window this app looks through the stack with.

The app was called `admin-v2` until 2026-11; older ADRs, changelog entries and commit scopes use
that name. Two runtime values keep it on purpose — the language preference key
(`admin-v2.language`, so no operator loses their saved choice) and the `source` label on socket-lab
unicast events.

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

The session lives in this tab's `sessionStorage`, both of its ports: the console never runs inside a
native or desktop shell, so there is nothing for an entry point to choose. That store, the config
lanes' and the language's are built once in `src/app/storage/`; nothing else in the app names a web
storage, and the root lint rule refuses it.

## Runtime declaration

The console boots its runtime from a declaration: `src/config/admin.ts` names one adapter per port,
and `src/main.tsx` awaits `startRuntime(admin)` before it registers the session-failure banner and
renders. The start also initialises `@chatic/config` from the declaration's `config` ports
(`src/app/config/adapters.ts`), synchronously and before anything reads config, so there is no
separate `config.init` call in the entry.

Every port is fixed — no alternatives — to what the console ran before the declaration existed:

| Port         | Adapter                   | What it is                                                                                        |
| ------------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `storage`    | `storage.admin-tab`       | the session in the tab's `sessionStorage` (`tabStore`, both ports); device state in `deviceStore` |
| `transport`  | `transport.browser`       | `navigator.onLine`, the user agent and the page's own `WebSocket`                                 |
| `auth`       | `auth.location`           | `location.search`, and `location.replace('/?…')` at the end of a session                          |
| `cache`      | `cache.admin-web-storage` | IndexedDB, and a tab's invited clouds in `tabStore` — the page's cache routing                    |
| `foreground` | `foreground.visibility`   | the document's `visibilityState`                                                                  |

`storage` and `cache` are the console's own adapters (`src/config/adapters/`), not runtime-web's
`storage.tab` and `cache.web-storage`. Those keep the same rows in the same web storages, but over
store objects of their own; the console's must be the objects `src/app/storage/` hands out, because
where site data is blocked those stores are page memory, and one `tabStore` holds the session,
config's session lane and the cache's tab rows together.

A `port.*` toggle in config names no adapter the declaration allows, so the port stays on its default
and the line says why. The start logs one line per port under `app.runtime_port`:

```text
[admin] storage → storage.admin-tab (default)
[admin] transport → transport.browser (default)
[admin] auth → auth.location (default)
[admin] cache → cache.admin-web-storage (default)
[admin] foreground → foreground.visibility (default)
```

A start that fails is logged under `app.runtime_start_failed` and thrown on, and the console does not
render — as when the boot threw synchronously before.

The console subscribes no listener to the log hub, so neither line reaches the browser console today;
the rethrown error does, as an uncaught error. The lines show wherever a listener is attached before
the start, as `apps/web` does with its console listener.

## Stage endpoints

Every screen except sign-in switches between the dev (`d1`) and production (`v1`) stage at run time —
memberships, cloud deployments, the log console, the socket lab and users — so one build reaches both
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
- **Sign-in is always production; everything else picks its stage.** The runtime keys
  (`VITE_OAUTH_ENDPOINT`, `VITE_DOU_ENDPOINT`, `VITE_BACKEND_ENDPOINT`, `VITE_WS_ENDPOINT`, …) name
  `v1` in every build, development included: the admin accounts and their session live there. The
  stage toggles reach `d1` through the keys above.
- **"Production" for sign-in means the relay backend (`dou-v1`)**, the same backend the relay socket
  refreshes against. A session is renewed only by the backend that issued it. A session from any
  other account backend passes the socket's token check but fails its first refresh, 48 minutes in,
  and the console logs out a minute later. [auth/](docs/auth/README.md#which-backend-issues-the-session)
  has the detail.
- **Each toggle opens on the build's stage**, not the session's: `v1` in a production build
  (`VITE_ENV=PROD`), `d1` in any other (`src/app/config/stageEndpoints.ts`, `openingStage`). A
  development build that opened on production would put an operator's first write there.
- **The same ten values go into every `.env` of this app.** Where each stage lives does not depend on
  the build. In the deploy workflows, relay, archive and socket come from the web app's
  own secrets (`WEB_DEV_*` for `d1`, `WEB_PROD_*` for `v1`), because they are the same servers the web
  app uses; goods and presence, which the web app does not call, come from
  `ADMIN_<STAGE>_<SERVICE>_ENDPOINT`. Reusing them also keeps the repository under GitHub's
  100-secret limit, and moves the admin console with the web app when a stage changes domain.
- **An unset key leaves that stage unconfigured.** The screen shows "(not configured)", the queries
  stay off, and a call that would otherwise fall back somewhere throws with the missing key's name —
  never the session's own relay standing in for the other stage.
- **Relay calls on the session's own stage go out without an override** (`relayOverrideFor`), so the
  http client's deep-link and `window.DOU_ENDPOINT` overrides keep working; on the other stage they
  carry its `VITE_<STAGE>_RELAY_ENDPOINT`. Memberships and Users both work this way — see
  [memberships/](docs/memberships/README.md) and [users/](docs/users/README.md).

## Documents

See [`docs/README.md`](docs/README.md) for the category index.
