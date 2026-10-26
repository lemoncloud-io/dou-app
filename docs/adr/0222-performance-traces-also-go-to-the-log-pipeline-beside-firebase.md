# ADR-0222: Performance traces also go to the log pipeline, beside Firebase

> Status: Accepted · Decided: 2026-10-22 · Implemented: `feat/log-collection-telemetry-perf`
> · Amended by [ADR-0229](./0229-statistics-are-turned-on-by-a-policy-the-web-app-ships.md): until the
> server serves a policy, the web app ships one that turns statistics on
> · Scope: `libs/perf/**` · `apps/web/src/app/runtime/perf/**` · `apps/mobile/src/app/services/firebase/perf/**`
> · Supersedes in part: [ADR-0120](./0120-performance-traces-move-to-firebase-performance.md) decision 1
> (one set of limits for every backend) and decision 3 (the log pipeline as a sampled fallback only).
> Its other decisions stand: Firebase is recorded natively, forwarded over the bridge, unsampled, and
> its targets live in its console.
> · The module docs are [libs/perf](../../libs/perf/README.md),
> [libs/logger docs/sampling](../../libs/logger/docs/sampling/README.md) and
> [apps/web/docs/observability/performance.md](../../apps/web/docs/observability/performance.md)

## Context

Since ADR-0120, performance is visible in the Firebase console only. That answers "what is the p95 of
this trace" and nothing next to it: a slow run cannot be read beside the logs of the same run, the
admin console cannot show a trace at all, and a dimension is limited to Firebase's five attributes per
trace — `chat_room_open` already uses all five.

The log pipeline now carries statistics entries: `kind` `trace` / `sample` / `event`, their numbers as
structured fields the server stores and aggregates, a share of the upload queue of their own so they
never evict a log (nor a log them), and a server-held sampling policy that is off until the server
turns it on. ADR-0120 turned the log pipeline down for traces for three reasons, and each is answered
by that:

| ADR-0120's reason                                                                                   | Now                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| The server could not aggregate, so every p95 meant downloading raw entries and computing it offline | The numbers are structured fields; the server computes percentiles, histograms and trends itself                                                      |
| A 10% sample misses the slow tail                                                                   | The rate is a policy rule, not a constant: a trace with a target is kept at 100%, and a user who reported a problem can be forced to 100% for a while |
| Measurements competed with diagnostic logs for the upload queue                                     | Statistics have their own queue share; neither evicts the other                                                                                       |

## Decision

### 1. One trace, two destinations

A `FanOutPerfTraceBackend` hands each start and stop to Firebase and to the log pipeline. A branch
that throws is skipped and the other still records. The WebView wraps the whole fan-out in the
deferring backend, so held calls reach both branches in the same order.

| Host                                  | Destinations                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| WebView, app with the bridge handlers | Firebase over the bridge, and the pipeline                                                      |
| WebView, app without them             | The pipeline (the old sampled `info`/`PERF` sentence is gone)                                   |
| Standalone web tab                    | The pipeline (it recorded nothing before)                                                       |
| Native shell                          | Firebase. Native traces reach the pipeline in a later step, together with the app's queue share |

The pipeline backend records through `@chatic/logger`'s recorder, which applies the catalogue and the
sampling policy. With no policy — every run today — it records nothing.

### 2. Limits are the pipeline's on the handle, Firebase's on Firebase's side

ADR-0120 enforced Firebase's limits on the handle, for every backend. The handle now allows 16
attributes and 32 metrics, and Firebase's cap of five is applied by its own backend. Each trace has a
list, in `libs/perf/src/catalog.ts`, of exactly the attributes and metrics Firebase receives.

### 3. Firebase receives exactly what it did

For every one of the fourteen existing traces, that list is everything the trace recorded before this
change, so Firebase's data does not move. It is pinned trace by trace in a test. The two are compared
over the same period to decide whether Firebase is kept, which is only meaningful if one side stays
still. Anything new is pipeline-only: the traces `long_tasks`, `api_request` and `screen_render`, and
the web vitals INP, CLS and TTFB (`web_vitals` reaches Firebase for FCP and LCP only).

## Consequences

- **The `info`/`PERF` log lines stop.** App builds without the bridge handlers wrote one for a tenth
  of runs; until the server serves a sampling policy those runs record no trace anywhere. Accepted:
  those builds are leaving, the bridge path still reaches Firebase, and turning statistics on is the
  server's switch.
- **A dimension can be added without removing one** — on the pipeline. Firebase keeps its five.
- **The Firebase list is a second place to keep in step.** A new attribute on an existing trace goes to
  the pipeline only unless someone decides Firebase should change too, and the catalogue test fails if
  the Firebase list moves.
- **A value-restricted sample holds its Firebase start until its stop.** Harmless for a sample, whose
  start and stop are back to back; it is why only samples may carry an `only` restriction.
- **Firebase and the pipeline can disagree by the bridge.** A WebView trace's Firebase duration
  includes the bridge round trip at either end; the pipeline's is the web clock's. The comparison has
  to allow for it.

## Alternatives considered

- **Keep Firebase as the only destination and widen it.** Firebase's five-attribute cap and the
  absence of any per-run view are the limits being worked around; they are not configurable.
- **Send the pipeline the same five attributes Firebase gets.** Keeps one limit, but the pipeline's
  reason to exist is the dimensions Firebase cannot hold (a room's channel type, the network).
- **Keep the old sampled sentence for app builds without the handlers until statistics are on.**
  Two record shapes for the same trace for a while, for builds that are leaving; turned down.
