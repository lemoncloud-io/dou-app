# ADR-0231: Log and issue reports go to the archive service

> Status: Accepted · Decided: 2026-10-26
> · Scope: `libs/http/src/gateways/report.ts` · `libs/app-runtime/src/http/gateways.ts` ·
> `libs/config/src/registry/net.ts` (`net.archive.endpoint`) ·
> `apps/admin-v2/src/app/features/report-logs/api/reportLogApi.ts` · `.github/workflows/deploy-*.yml`
> · The module docs are [libs/http/README.md](../../libs/http/README.md),
> [libs/data/docs/remote/http.md](../../libs/data/docs/remote/http.md) and
> [libs/app-runtime/docs/http/README.md](../../libs/transport/docs/http/README.md)

## Context

The log collector (`POST /hello/report-bulk`), user issue reports (`POST /hello/report`) and the
admin log list (`GET /mocks/0/list`) moved on the server from the relay backend to a service of their
own, `chatic-archive-api`. Paths, bodies, responses and the relay-session signature are unchanged.
Only the address differs: today the archive sits on the same host as the relay, under `/arc-d1`
(dev) and `/arc-v1` (prod) where the relay is `/dou-d1` and `/dou-v1`.

The app reads the relay address in one place, and a deep link (`?_backend=`) can point a session at
another relay. A log written by a session pointed at the dev relay has to land in the dev archive,
and the same for prod — the request is signed by that relay's session either way.

## Decision

1. **The archive address is an env value of its own, `VITE_ARCHIVE_ENDPOINT`** (`net.archive.endpoint`),
   delivered like every other endpoint: a `{WEB,ADMIN}_{DEV,PROD}_ARCHIVE_ENDPOINT` secret written into
   the build's `.env` by the deploy workflows. desktop-web reuses the `WEB_*` secrets. The service's
   address is then stated where the other addresses are, and can move hosts without a code change.
2. **When it is empty, the address is built from the relay** by swapping the relay's trailing
   `/dou-<stage>` segment for `/arc-<stage>` (`archiveEndpointFor`). A deploy without the secret, a
   local run and the e2e suite all take this path. A relay with no stage segment (a local backend)
   is used as it is, which reaches the old route on the relay — so that last case holds only while
   the server keeps the route open, and has to be decided again before it is closed.
3. **While the relay is overridden, the configured value is ignored** and the address is built from
   the overriding relay. A configured archive belongs to the build's relay; a prod build deep-linked
   to the dev relay would otherwise file dev logs in the prod archive, signed by a dev session.
4. **The admin console takes the same value** (`VITE_ARCHIVE_ENDPOINT`, else the relay endpoint) and
   replaces its trailing stage segment with the one the d1/v1 toggle picks.
5. **The signature stays the relay session's.** Destination and signing are already independent in
   `libs/http`, so only `baseURL` changes.
6. **The report types come from `@lemoncloud/chatic-archive-api`.** Its `SlackReportBody` carries
   `stereo`, so the issue body no longer adds it as an intersection type.

## Alternatives

- **Build the address from the relay only, with no key.** One less value to keep in step with the
  relay, and nothing to register before deploying. Rejected: the archive is a separate service, and
  its address belongs with the other configured addresses rather than in a rule that assumes it
  shares the relay's host. The rule is kept as the fallback, so nothing breaks while the key is unset.
- **Honour the configured archive even under a relay override.** Simpler, but a deep-linked session
  would send its logs to the build's stage under another stage's signature. Rejected.
- **No fallback (refuse to send without an address).** Logs would be lost silently until every
  environment had the secret. Rejected.

## Consequences

- Four secrets to register (`WEB_DEV`, `WEB_PROD`, `ADMIN_DEV`, `ADMIN_PROD` `_ARCHIVE_ENDPOINT`).
  An unset one is dropped from the generated `.env`, so a deploy before registration still works,
  through the fallback.
- The web deploy moves both the browser and the native app, because the WebView loads the web app
  remotely. The admin console is deployed the same day, so its list reads where the logs now land.
- Logs written before the switch are not moved, and the console shows only what arrives after it.
  The server keeps logs (statistics included) for 14 days and issue reports for 28, so the console's
  statistics trend reaches back 14 days at most.
