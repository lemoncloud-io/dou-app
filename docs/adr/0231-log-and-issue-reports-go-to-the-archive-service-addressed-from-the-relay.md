# ADR-0231: Log and issue reports go to the archive service, addressed from the relay

> Status: Accepted · Decided: 2026-10-26
> · Scope: `libs/http/src/gateways/report.ts` · `apps/admin-v2/src/app/features/report-logs/api/reportLogApi.ts`
> · The module docs are [libs/http/README.md](../../libs/http/README.md) and
> [libs/data/docs/remote/http.md](../../libs/data/docs/remote/http.md)

## Context

The log collector (`POST /hello/report-bulk`), user issue reports (`POST /hello/report`) and the
admin log list (`GET /mocks/0/list`) moved on the server from the relay backend to a service of their
own, `chatic-archive-api`. Paths, bodies, responses and the relay-session signature are unchanged.
Only the address differs: the archive service sits on the same host as the relay, under `/arc-d1`
(dev) and `/arc-v1` (prod) where the relay is `/dou-d1` and `/dou-v1`.

The app reads the relay address in one place, and a deep link (`?_backend=`) can point a session at
another relay. A log written by a session pointed at the dev relay has to land in the dev archive,
and the same for prod.

## Decision

1. **The archive address is built from the relay address**, by swapping its trailing `/dou-<stage>`
   path segment for `/arc-<stage>`. There is no configuration key for it. The two senders in the web
   app share one function (`archiveEndpointFor`), and the admin log list makes the same swap on the
   stage it already picks.
2. **A relay address with no `/dou-<stage>` segment is used as it is** — a local backend, for
   example. That request goes to the old route on the relay, so the fallback holds only while the
   server keeps that route open, and has to be decided again before it is closed.
3. **The signature stays the relay session's.** Destination and signing are already independent in
   `libs/http`, so only `baseURL` changes.
4. **The report types come from `@lemoncloud/chatic-archive-api`.** Its `SlackReportBody` carries
   `stereo`, so the issue body no longer adds it as an intersection type.

## Alternatives

- **A separate endpoint setting per environment.** One more value to keep in step with the relay in
  every build, and a deep-linked relay would still send its logs to the build's archive — a dev
  session's logs could land in prod. Rejected.
- **No fallback (refuse to send without a stage segment).** A local or unusual relay would lose its
  logs with nothing to show for it. Rejected while the old route exists.

## Consequences

- The web deploy moves both the browser and the native app, because the WebView loads the web app
  remotely. The admin console is deployed the same day, so its list reads where the logs now land.
- Logs written before the switch are not moved, and the console shows only what arrives after it.
  The server keeps logs (statistics included) for 14 days and issue reports for 28, so the console's
  statistics trend reaches back 14 days at most.
- If the archive service ever leaves the relay's host, `archiveEndpointFor` and the admin swap are
  the two places that stop being true.
