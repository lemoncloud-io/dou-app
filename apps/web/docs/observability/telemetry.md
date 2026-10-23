# telemetry — statistics on the log pipeline

Performance traces and usage events reach the server the way logs do: as entries on the same hub,
in the same upload queue, through the same `report-bulk` request. What makes them statistics is
`kind` (`trace` · `sample` · `event`), their numbers as structured fields the server aggregates, a
queue share of their own, and a sampling policy that decides which runs send them. The entry contract
and the sampling mechanism are `@chatic/logger`'s
([docs/sampling](../../../../libs/logger/docs/sampling/README.md)); this document is how this app
wires them. Code: `src/app/runtime/telemetry/`.

## Boot (`main.tsx`)

`startTelemetry({ context: readLogContext, … })` runs after boot-order steps 4–7 in
[logging.md](./logging.md) and before the performance traces and the web vitals, so everything the run records is decided by one policy:

1. **The run's policy is read synchronously** — the last fetched one while its `ttlSec` holds, else
   the default, `{ version: 0, enabled: false }`. It is fixed for the run.
2. **A `TelemetryRecorder`** is built over that sampler and the app's catalogue, and handed to the
   performance traces (`setPerfTelemetryRecorder`) so a trace's pipeline branch has somewhere to go.
3. **The usage session starts** (`session_start`).
4. **The policy is fetched again**, now and every minute. A fetched policy is saved for the next run;
   this run takes only its kill switch and its debugging overrides. A failed fetch changes nothing.

**With the default policy nothing is recorded.** No entry is built, nothing reaches the queue or the
bridge. The server has no policy route yet, so the source answers "statistics off" — every run today.

**Development override.** In a development build, a policy document stored in `localStorage` under
`@chatic/web.telemetry.policy.override` wins over everything else, so statistics can be checked end
to end before the server serves a policy. A production build never reads it.

```js
localStorage.setItem(
    '@chatic/web.telemetry.policy.override',
    JSON.stringify({ version: 1, enabled: true, defaults: { perf: 1, usage: 1 } })
);
```

## What it records

| Record                   | Kind           | When                                                                         |
| ------------------------ | -------------- | ---------------------------------------------------------------------------- |
| `perf.*` traces          | trace / sample | every performance trace — see [performance.md](./performance.md)             |
| `perf.web_vitals`        | sample         | FCP, LCP, INP, CLS (×1000), TTFB. INP and CLS when the page is hidden        |
| `perf.long_tasks`        | sample         | leaving a screen that had long tasks: `count`, `total_ms`, `max_ms`          |
| `perf.telemetry_dropped` | sample         | at most once a minute, statistics the queue dropped for room                 |
| `usage.session_start`    | event          | the run starts (`start=cold`), or a return after 30+ minutes away (`resume`) |
| `usage.session_end`      | event          | before that `resume`: the old session's `duration_ms` and `screens`          |
| `usage.screen_view`      | event          | the route template changes: `screen`, `prev_screen`, `prev_dwell_ms`         |

The usage list stops at screens and sessions on purpose: the rest of the usage catalogue is still
being settled, and an event cannot be renamed once it has data behind it.

**A screen is a route template.** `routeTemplateOf` derives the templates from the `ROUTES` table
(`/channels/:id/room`) and matches a path with the router's own ranking. Every entry, logs included,
carries the template as `routeTemplate` beside the actual path in `route`. A path no route defines has
no template — never the path itself, which would split the axis into one group per id.

## The log context

`readLogContext` adds six fields for statistics, and every log entry carries them too:

| Field           | Value                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| `sessionId`     | the usage session's id                                                   |
| `platform`      | the injected `ios` / `android` inside the app, `web` in a standalone tab |
| `host`          | `app` inside the app, `browser` standalone                               |
| `network`       | the browser's `effectiveType`, where there is one (not on WebKit)        |
| `locale`        | the document language, or the browser's                                  |
| `routeTemplate` | as above                                                                 |

## Upload

The uploader sends up to 100 entries per request (logs and statistics together) and hands every
drawn batch's statistics to `selectTelemetryForUpload`. That is where a statistic made **natively**
gets its verdict: `boot` and `first_screen` are written by the app before anything knows the policy,
unjudged, and the web judges them by their run id when it draws them from the app's queue — an
unsampled one is acknowledged and never sent. With statistics switched off, every queued statistic
goes the same way.

In the app, the web relays each entry over `SendLog`. The bridge codec carries `kind` and the
statistics fields, and the forwarder never folds a statistic into a "+N identical" line.

## What is not wired here

- **`api_request`** and **`screen_render`** are defined in `@chatic/perf`'s catalogue but nothing
  records them yet: the first needs a per-request observer in the HTTP layer, the second each
  screen's own "first meaningful paint" signal.
- **The policy source** is a stand-in until the server serves a policy; it becomes
  `@chatic/http`'s `TelemetryPolicyHttpGateway`.
- **`session_start`'s `entry`** is `icon` for every run inside the app — a push or link entry is not
  distinguished yet.

## Things to know when reading the data

- **`seq` orders entries within one runtime of a run.** The web and the app's native side each count
  from 1 under the same run id, and a WebView reload restarts the web's count. Order across runtimes
  by `timestamp`.
- **A session rolls over on `visibilitychange`.** Whether an Android WebView fires it when the app
  goes to the background has not been checked; if it does not, an Android run is one long session.
- **An app build older than this change keeps the statistics fields in memory** (its `SendLog`
  handler passes unknown fields on), but its queue has no statistics share and its storage drops
  `kind` on a restart. Statistics stay off until the server serves a policy, so this only matters once
  one is turned on for runs on such builds.
