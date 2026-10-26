# ADR-0229: Statistics are turned on by a policy the web app ships

> Status: Accepted · Decided: 2026-10-26
> · Scope: `apps/web/src/app/runtime/telemetry/policy.ts` · `apps/web/src/app/runtime/telemetry/telemetryRuntime.ts`
> · Amends: [ADR-0222](./0222-performance-traces-also-go-to-the-log-pipeline-beside-firebase.md), on
> where the sampling policy comes from until the server serves one
> · The module doc is [apps/web/docs/observability/telemetry.md](../../apps/web/docs/observability/telemetry.md)

## Context

ADR-0222 put performance traces and usage events on the log pipeline, sampled by a server-held
policy, and shipped the client with that policy off. The server has no policy route yet. So every
run recorded no statistics, and the log console's statistics view had nothing to read.

We want the statistics now, and the server route is not scheduled.

## Decision

1. **The web app serves itself a policy** (`BUILT_IN_TELEMETRY_POLICY`) through the same
   policy-source port the server's gateway will use. When the server route exists, the source
   changes and nothing else does.
2. **It collects only where a statistic survives the trip:** iOS and Android from app 0.29.2 (the
   first build whose native queue has a statistics share), and the web in a browser tab. Older app
   builds and the desktop app match no rule and collect nothing.
3. **Rates:** every run for the records with a performance target (boot, first screen, cloud and
   place switch, web vitals) and for room entry; one run in five for every other performance record;
   every run for usage events. A sample misses the slow tail that a target is read at, and a sampled
   user count is not a user count.
4. **A run reuses the stored policy for a week (`ttlSec`).** With an hour, a user who opens the app
   once a day would start most runs with statistics off.

## Consequences

- From the second run after the deploy (the first one fetches and stores the policy), statistics
  flow to the log store and can be read in the console's statistics tab and the full-log tab.
- The first run after an install records none. A run starts from a stored policy, and only a fetch
  during that run stores one.
- Turning statistics off now takes a web deploy that wires `disabledTelemetryPolicySource` again. A
  newer policy's kill switch applies to a run as soon as it is fetched.
- Log volume grows: usage events from every eligible run, plus the performance records above. The
  statistics share of the upload queue bounds it per device, and `perf.telemetry_dropped` reports
  what that share had to drop.
