# ADR-0071: Set a performance budget for the main scenarios, and carry metrics as `info` events over the existing log pipe

> Status: Accepted · Decided: 2026-08-27
> Related: ADR-0065 (in-app trace profiler — leaves remote collection blank. **A parallel lane to this ADR**) · [ADR-0063](./0063-log-upload-source-port-and-native-charge-queue.md) (log upload pipe, native queue) · [ADR-0097](./0097-unified-logging-core-and-report-traceability.md) (logging core, `LogContext`) · [ADR-0050](./0050-redact-report-breadcrumbs.md) (redaction) · [ADR-0086](./0086-native-webview-early-mount-boot-optimization.md) (measurement discipline, boot baseline) · [ADR-0057](./0057-home-last-chat-preview-single-query.md) / [ADR-0058](./0058-navigation-churn-grace-and-seeding.md) (home-screen storm caught by manual measurement)

## Context

### The requirement

Set **targets for the main scenarios and watch whether they are met using real-user data.** Five
targets are required.

- Boot → 1.5s · cloud switch (connect) → 1s · place switch → 1s
- Standard metrics: FCP 1.8s · LCP 2.5s · INP 200ms
- Standard metrics are always measured, sampled, then sent to the server

This track's deliverable stops at **making the system observable** — it does not include
automatically alerting on missed targets or gating releases.

### What already exists — half of this is already running

| Area                  | Existing asset                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot instrumentation  | [`BootMetricsService`](../../apps/mobile/src/app/services/perf/BootMetricsService.ts) — merges 6 native milestones with a web snapshot, 50 entries in MMKV. `totalMs` is the timestamp when `WebAppReady` is received                                               |
| Boot metric transport | **Already reaches the server.** `BootMetricsService.ts:152` emits `logService.info('PERF', 'Boot record persisted (cold, total 1099ms)')`, and the ADR-0063 pipe (app charge queue → web Fetch/Ack → `POST /hello/report-bulk`) carries it                          |
| Standard metrics      | [`webVitals.ts`](../../apps/web/src/app/utils/webVitals.ts) — **already collects** LCP/FCP/INP/CLS/TTFB via `web-vitals@5.1`. But `reportVital` only puts them in an in-memory overlay store and logs to the DEV console — **not a single line reaches the server** |
| Transport pipe        | `createLogUploadQueue` + `LogUploadScheduler` — 60s interval · 50-entry batches · backoff `[5s, 30s, 120s]` · gives up after 5 tries ([uploadPolicy.ts](../../libs/logger/src/upload/uploadPolicy.ts))                                                              |
| Analysis axes         | [`LogContext`](../../libs/logger/src/core/types.ts) **automatically carries** `runId`, `appVersion`, `webVersion`, `os`, `osVersion`, `model`, `route`, `sid`, `cid`, `uid` on every entry                                                                          |
| Session identity      | The native shell injects `runId` into the web via `window.CHATIC_APP_RUN_ID` ([injectionScripts.ts:92](../../apps/mobile/src/app/webview/utils/injectionScripts.ts:92)) — web and native **share the same `runId`**                                                 |

### Gaps

1. **Numbers live inside free text.** The boot metric reaches the server, but as the sentence
   `total 1099ms`, so aggregation needs regex parsing and per-phase marks aren't carried at all.
2. **Cloud switch and place switch have no instrumentation at all.** Two of the three scenario
   targets are unmeasured.
3. **Standard metrics never leave the device.**
4. **There is no sampling concept.** Every session's logs are uploaded in full today.
5. **The endpoints of the targets have never been pinned down.** As
   [boot-metrics.md](../../apps/mobile/docs/boot/boot-metrics.md) itself warns, `totalMs` (v0.19.2
   average 1099ms · max 1643ms) and perceived boot (average 1255ms · max 2115ms) are **different
   numbers**. Depending on which one you measure, the 1.5s target either passes comfortably or
   barely clears the bar.

### Constraints

- **ADR-0065 explicitly excludes remote collection** — "production real-user remote telemetry is
  out of scope for this round." 0065 is not yet merged into develop, and `libs/perf` does not exist
  yet.
- **`LogUploadQueue`'s drop priority is `['debug', 'info', 'warn', 'error']`**
  ([LogUploadQueue.ts:57](../../libs/logger/src/upload/LogUploadQueue.ts:57)). Under backpressure
  (500 entries / 512KB), `info` is the second tier dropped after `debug`.
- **Web deploys before the app** — any new bridge message needs a one-time `NOT_FOUND` learned
  fallback.
- **No `logger` calls on the bridge send path** (recursion has been proven in practice).
- `apps/desktop` and `apps/desktop-web` also share `libs/logger` and `libs/web-core` — left alone,
  collection spreads to them.
- Cloud switch **triggers a place switch** — `useSwitchPlace` auto-selects the first place when
  the active place is empty ([useSwitchPlace.ts:31](../../apps/web/src/app/features/home/hooks/useSwitchPlace.ts:31)).
  The two phases overlap in execution time.

## Decision

### 1. Performance budget — pin down endpoints and the statistic used to judge them

| Metric           | Start                                          | End                                                | Target                 | Statistic                                           |
| ---------------- | ---------------------------------------------- | -------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| **Boot**         | Native baseline (provider creation ≈ JS entry) | `WebAppReady` received = current `totalMs`         | **1.5s**               | p95                                                 |
| **Cloud switch** | Cloud selection input                          | `switchCloudSession` mutation resolves             | **1s**                 | p95                                                 |
| **Place switch** | Place selection input                          | `switchSite` (SDK `auth.switch`) mutation resolves | **1s**                 | p95                                                 |
| **FCP**          | `timeOrigin`                                   | `web-vitals` `onFCP`                               | **1.8s**               | p75                                                 |
| **LCP**          | `timeOrigin`                                   | `web-vitals` `onLCP`                               | **2.5s**               | p75                                                 |
| INP              | —                                              | —                                                  | (200ms reference only) | **Excluded from transport**, local observation only |

- **Boot uses the current `totalMs`.** It is already instrumented, so watching can start today,
  and its definition is stable, so it holds up across versions. But **`totalMs` is not perceived
  boot** — it lands before React renders, and perceived boot (router unblock) is worse in v0.19.2
  measurements: average 1255ms, max 2115ms. Do not read this target as "the user sees the screen
  within 1.5 seconds." Instrumenting the perceived endpoint is left as a follow-up.
- **The judging statistic is p95 for the scenarios and p75 for the standard metrics.** The
  thresholds for the standard metrics were originally defined on p75, so we keep that definition,
  and the main scenarios are held to a stricter bar that also accounts for the tail.
- **Cloud switch and place switch are measured separately.** Each runs until its own mutation
  resolves, and the 1s target applies to each phase individually. The place switch that
  automatically follows a cloud switch is caught by the place-switch metric. The sum of the two
  (= perceived cloud-entry time) can be a separate metric, but it is not a target of this round.
- **INP is not sent to the server.** INP keeps updating over a page's lifetime, and a webview SPA's
  lifetime is the whole app session, so there is no settled point to report. Sending it on every
  update would create many duplicate entries per session, and a hidden-time snapshot needs its own
  lifecycle wiring. Collection and overlay display stay as they are; only transport is dropped — if
  this becomes necessary, a settled point will be decided separately then.

### 2. Sampling — session-scoped by a `runId` hash

The sampling unit is **one app run (= one `runId`).** A selected session sends **all** of its boot,
transition, and vitals metrics; an unselected session produces zero metric entries.

The decision is `hash(runId) % 100 < N` — a **pure function**. As a result:

- **Native and web arrive at the same answer without coordinating.** Since `runId` is already
  shared via injection, no bridge message is needed to convey the sampling decision, so the "web
  deploys before the app" constraint never comes into play here either.
- Because it is session-scoped, distribution isn't skewed, and it lets us see within-session
  correlation, e.g. "did a session with a slow boot also have a slow switch?"

The initial value of the ratio `N` is 10%, adjusted once sample counts and traffic are observed.
The constant lives in exactly one place. Event-level sampling is not used — it would break
within-session correlation.

### 3. Transport — no new endpoint; carry metrics as `info` log events

Metrics ride the existing pipe (ADR-0063) as log entries with **`level: 'info'`, `tag: 'PERF'`**,
sent via `POST /hello/report-bulk`. This continues the idiom `BootMetricsService` already uses,
with zero backend negotiation, zero new schema, and zero new endpoint.

- **Numbers go into `data` as structured fields.** No mixing numbers into free-text sentences —
  metric kind, value (ms), pass/fail against the target, and phase mark each get their own key, so
  parsing is `JSON.parse`, not regex.
- **No new analysis axes are created.** Since `LogContext` already carries `runId`, `appVersion`,
  `webVersion`, `os`, `osVersion`, `model`, and `route` on every entry, version-over-version
  regression comparison and device-bias analysis come for free. Because metrics don't attach their
  own identifiers, ADR-0050's redaction boundary doesn't need to widen either.
- **The server does not aggregate.** Since values sit inside the `data` string (capped at 2000
  characters), server-side numeric-axis aggregation and querying are not possible. Filter by
  `tag=PERF`, download the raw events, and compute p75/p95 offline. Since each session only
  produces a single-digit number of metrics, the cost of raw accumulation is small. Dashboards and
  automatic aggregation are out of scope for this round; when they become necessary, a dedicated
  metric schema will be decided separately with the backend.

### 4. Defend against drop bias

`info` is dropped second, right after `debug`, under backpressure. It's correct for diagnostic logs
to outrank metrics in general, but **the noisier a device's logs, the more its queue fills up, and
noisy devices also tend to be the slow ones** — left unchecked, the samples that would form the p95
tail get selectively dropped first, skewing the distribution optimistic. Metrics only mean something
if loss is random, unlike individual log lines.

Two guards.

1. **Session sampling is the primary defense.** Because only a minority of sessions produce
   metrics at all, the pressure on the queue budget (500 entries / 512KB) stays small.
2. **Make the loss rate observable.** When a drop happens, its count rides on the next metric
   event. When interpreting the distribution, we need to know how much of the sample was already
   filtered out.

The drop priority itself is not changed — protecting metrics by pushing `warn`/`error` aside would
be a worse trade.

### 5. Scope — mobile hybrid only

- The target is **`apps/web` inside the `apps/mobile` webview**. All three scenario targets are app
  scenarios, and boot `totalMs` is native instrumentation that doesn't even exist in a plain
  browser.
- **`apps/desktop`, `apps/desktop-web`, and browser-only access are explicitly off.** Since this
  sits on a shared lib, anything other than off by default spreads automatically.
- Instrumentation points are chokepoints, not call sites — boot is `BootMetricsService`, switches
  are the two mutations, vitals are the existing `webVitals.ts`. The only new thing is the shape of
  the metric event and the sampling decision.

## Alternatives

- **Define a dedicated metrics endpoint and schema with the backend** — lets the server query p95
  directly, and metrics don't compete for the log queue budget. Rejected: backend coordination
  would have to happen first, pushing "ready" back weeks. What's needed right now is to start
  accumulating data. Move to this alternative once scale demands it.
- **Move the boot endpoint to perceived boot (router unblock)** — more faithful to user experience.
  Rejected: it requires new instrumentation and re-measuring the baseline first, and real
  measurements show p95 already exceeding the target, making it perpetually red from day one.
  Instead, the document notes that `totalMs` is not perceived time, and leaves the follow-up open.
- **Event-level sampling** — lets per-metric volume be tuned individually. Rejected: it breaks
  analysis that follows the phases of a single session, and native and web would each roll their
  own dice, landing on different decisions within the same session.
- **Pass the sample decision over a bridge message** — explicit. Rejected: the `runId` hash gives
  the same result with zero messages. A new message would drag in the "web deploys first"
  constraint and the `NOT_FOUND` fallback.
- **Retire ADR-0065 and absorb it into this decision** — one fewer document. Rejected: the two
  tracks have different consumers (developer root-cause tracing vs. target monitoring).
  Instrumentation chokepoints are shared, but the two lanes run in parallel separately.
- **Raise metrics to `warn` to protect them from drops** — removes the bias at its root. Rejected:
  it distorts the meaning of the level and pollutes the alert signal. Diagnostic logs should
  outrank metrics.

## Consequences

**What is gained**

- The five targets become **contracts with defined endpoints and judging statistics.** "Boot 1.5s"
  no longer means a different number to different people.
- Real-user distributions can be viewed **by version, device, and OS axis** — at no extra cost,
  thanks to `LogContext`. This also makes it possible, for the first time, to measure the effect of
  ADR-0057/0058, which had been left as "homework for after the app ships."
- Starts with zero backend changes and zero new bridge messages.

**What is accepted**

- **The server cannot aggregate metrics.** p75/p95 are computed offline from downloaded raw data.
  As the sample grows, this approach hits its limits first, and that is the point to move to a
  dedicated schema.
- **Metrics share the log queue budget.** Sampling and the drop counter mitigate this but do not
  eliminate it.
- **The boot target is more generous than perceived experience.** Even if `totalMs` p95 clears
  1.5s, that does not mean the user sees the screen in 1.5 seconds. This gap is only guarded by
  documentation, so it must be remembered on every interpretation until a perceived-time endpoint
  is instrumented.
- **INP falls out of observability.** Interaction-responsiveness regressions won't be caught by
  server data for now.
- **A low sampling rate means rare devices won't accumulate samples.** A regression on a specific
  model may be found late.
