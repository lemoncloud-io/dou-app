# perf — the performance budget and the metrics that measure against it

> Overview in the [lib README](../../README.md) · Canonical code:
> [perf/budgets.ts](../../src/perf/budgets.ts) · [perf/types.ts](../../src/perf/types.ts) ·
> [perf/sampling.ts](../../src/perf/sampling.ts) · [perf/runtime.ts](../../src/perf/runtime.ts)

Five scenarios carry a numeric target, and a sampled slice of real sessions reports how long they
actually took. The measurement rides the ordinary log pipeline as an `info`/`PERF` entry, so there is
no second transport, no new schema and no backend work (ADR-0071).

This is measurement only. Alerting on a missed target and gating a release on one are outside it, and
so is aggregating: the value sits inside a length-capped `data` string, so the verdict is computed
offline from downloaded entries.

## Layout

```text
perf/
  types.ts                  PerfMetricName (5, closed) · PerfBudget · PerfMetricOptions · PerfMetricRecord
  budgets.ts                PERF_BUDGETS · PerfBudgetCatalog · StaticPerfBudgetCatalog
  sampling.ts               PERF_SAMPLE_PERCENT · hashRunId · isSampledRun
  perfNow.ts                performance.now() where it exists, else Date.now()
  PerfMetricSink.ts         PerfMetricSink · LoggerPerfMetricSink · PERF_LOG_TAG
  PerfMetricReporter.ts     PerfMetricReporter · BudgetedPerfMetricReporter · NOOP_PERF_METRIC_REPORTER
  createPerfMetricReporter.ts  the factory — the only place sampling is decided
  runtime.ts                the process slot: configurePerfMetrics · reportPerfMetric · resetPerfMetrics
```

The module mirrors the shape the package already uses for logging — an interface, an implementation
class, an assembly factory and one process slot — and it has **no edge to `upload/`**, in imports or
in the object graph. A metric is an ordinary entry the moment it is published.

## The budget

| Metric         | Target | Judged at |
| -------------- | -----: | --------- |
| `boot`         | 1500ms | p95       |
| `cloud-switch` | 1000ms | p95       |
| `site-switch`  | 1000ms | p95       |
| `fcp`          | 1800ms | p75       |
| `lcp`          | 2500ms | p75       |

`PERF_BUDGETS` is `Record<PerfMetricName, PerfBudget>`, so a metric added without a target does not
compile and the list cannot drift from the numbers. `PerfMetricName` is a **closed** union, unlike
`LogTag`: a budget only means something if the endpoints are pinned.

**The threshold and the statistic travel together** in one `PerfBudget`, because neither answers the
question alone — "1500ms" means nothing until you know it is judged at p95. They were two parallel
records that had to be kept in step by hand. FCP and LCP are judged at p75 because their thresholds
were defined at p75; the app scenarios use p95 so the tail is answered for.

`PerfBudgetCatalog` is an interface so the targets can come from somewhere else — a build that
tightens them for a canary, a test that wants round numbers — without touching the reporter. The
default is static, which is the honest shape for values that change only when someone edits them.

## Sampling

```ts
isSampledRun(runId, (percent = PERF_SAMPLE_PERCENT)); // hashRunId(runId) % 100 < percent
```

**A pure function of `runId`, and that is the whole point.** The native shell and the WebView both
need to know whether this run reports, and they already share a `runId` — native issues it and
injects it into the WebView. Deciding from that value alone means the two runtimes reach the same
answer with **zero coordination**: no bridge message carries the decision, so none of the "the web
deploys before the app" problem a new message would bring applies.

The unit is **one app run, not one event**. A sampled run reports all of its metrics and an unsampled
run reports none, which keeps the distribution unskewed and preserves within-session correlation
("was the run with the slow boot also slow to switch?"). Per-event sampling breaks both, and would
also let the two runtimes roll different dice for the same session.

`hashRunId` is FNV-1a 32-bit — short, dependency-free and byte-identical wherever it runs, which
matters more here than avalanche quality because the value effectively crosses a runtime boundary.
`Math.imul` keeps the multiply in 32-bit integer space.

A missing `runId` is **never** sampled. Without it the two runtimes cannot agree, and an entry that
cannot be grouped with its session is not worth the queue space.

`PERF_SAMPLE_PERCENT` is 10, in one place, so raising it is a one-line change once the per-device
sample counts show which models are not accumulating enough runs to have a tail.

## The record

```ts
interface PerfMetricRecord {
    metric: PerfMetricName;
    ms: number; // rounded — sub-ms precision is noise at this scale
    budgetMs: number;
    overBudget: boolean;
    ok?: boolean; // switch metrics only
    bootType?: 'cold' | 'reload'; // boot only
    marks?: Record<string, number>; // boot only; unreached milestones are absent, not null
}
```

- **`overBudget` is derivable and carried anyway.** The server cannot query a numeric axis, so a substring search for `"overBudget":true` is the one cheap server-side filter this design leaves available. It is not the verdict — the verdict is the budget's `stat` over a population, computed offline. This key says only "this one sample exceeded".
- **`ok` means failures are reported, not skipped.** A switch slow enough to fail is exactly the sample that shapes the tail; dropping those biases the distribution optimistic.
- **`bootType` keeps two different measurements apart.** The budget is defined on `cold`, whose baseline is provider construction. A `reload` session re-baselines on a WebView content-process crash, so it measures something else — and it happens disproportionately on memory-pressured devices, which is the very population that shapes the tail. Mixing them silently would make the boot p95 answer a question nobody asked, so the sample says which it is and the analysis filters. Reloads are not discarded: a regression can show up as reload _frequency_.
- **`NaN`, negative and `Infinity` are not samples.** A clock that went backwards or an unmeasured value is an instrumentation failure, and the reporter drops it rather than publish it.

The record is the seam. Nothing in it mentions logging, so moving metrics to a dedicated endpoint
when the sample volume outgrows offline aggregation is a second `PerfMetricSink` implementation and
nothing else — the reporter, the budgets and every call site stay put.

## The entry it becomes

`LoggerPerfMetricSink` writes `logger.info('PERF', \`${metric} ${ms}ms\`, record)`.

- **`info`, not `warn`.** The level says what kind of record this is, not how much it matters. Promoting metrics to dodge the queue's drop order would pollute the signal levels exist to carry.
- **`tag = PERF`** is the whole server-side selection: download that tag, group by `metric`, take p95 or p75 as the budget's `stat` says.
- **The numbers are never written into the prose.** `message` is a sentence for whoever is scanning the monitor, `data` is the payload a script parses with `JSON.parse` rather than a regular expression. One string cannot serve both readers without one of them losing.

Every analysis axis comes free from `LogContext` — `runId`, `appVersion`, `webVersion`, `os`,
`osVersion`, `model`, `route` are on the entry already — so a metric adds no identifier of its own,
and per-version regression and per-device bias analysis cost nothing extra.

## Turning it on

```ts
configurePerfMetrics({ logger, runId, samplePercent?, sink?, budgets? });
reportPerfMetric('site-switch', ms, { ok: true });
```

**Default off, and off is a value rather than an absence.** The slot starts holding
`NOOP_PERF_METRIC_REPORTER` and returns to it on reset, so a host that never calls
`configurePerfMetrics` — `apps/desktop-web`, `apps/testbed`, a plain browser tab — reports nothing by
construction rather than by a flag someone has to get right. That is also why an unsampled run gets
the no-op reporter instead of a flag: the sampling verdict exists in the factory and **nowhere else**,
so no code below it contains an `if (sampled)` or a `?.`.

The verdict is taken once, at construction, because `runId` is fixed for the process; re-deciding per
report would spend a hash to reach the same answer.

Free functions rather than an injected instance, for the same reason `runtime.ts` exists for logging:
an instrumentation point — a site switch, a web-vitals callback, a boot finalizer — sits in unrelated
code and cannot be handed an instance without threading one through every layer above it. Anything
composing its own reporter calls `createPerfMetricReporter` directly and never touches the slot.

The one ordering rule is the pipeline's own: nothing may report before `configurePerfMetrics` runs,
or the record lands nowhere. Where the uploader is wired does not matter — this module does not know
it exists.

## Instrumenting a scenario

**Instrument the chokepoint, not the call site.** If two doors open the same measurement, one of them
will be missed. When choosing the chokepoint, ask whether the function has callers other than the
user action — and move one level in either direction until it does not. Both directions occur in
practice:

- `cloud-switch` is measured at the **mutation hook**, not at the service function, because the service function is also called on a failure-recovery path; measuring there would count a rare slow re-exchange as a user switch and drag the tail.
- `site-switch` is measured **inside the service function**, below its same-site early return, because measuring at the hook would turn every no-op switch into a 0ms sample and deflate the p95.

Callers today: boot from the app's boot-metrics service, `fcp`/`lcp` from the web-vitals receiver in
`apps/web`, `cloud-switch` from the cloud-session mutation hook, `site-switch` from `switchSite` in
`libs/app-runtime`.

```bash
grep -rn "reportPerfMetric\|configurePerfMetrics" --include='*.ts' --include='*.tsx' apps libs | grep -v node_modules
```

**INP is collected but not sent.** It keeps updating for the life of the page, and a WebView SPA's
page lasts the whole app session, so there is no point at which it is final — sending each update
would make one session produce many entries for one number.

## What loss does to a metric

An individual log line can go missing and still leave a diagnosis; a metric that goes missing
**selectively** makes the distribution itself a lie. `info` is second in the queue's drop order, and
devices that log a lot are generally the slow ones — so left alone, the samples that make the p95
would be the first to disappear.

The drop order is not changed for this: promoting metrics above `warn`/`error` is a worse trade. What
protects the distribution is session sampling — only one run in ten produces metrics at all, so
metrics barely compete for the queue's budget. How much was actually lost is answered by the
`queue-loss` observation, which joins on `runId`; see
[docs/observations/](../observations/README.md#queue-loss).

There was briefly an edge from here to the queue, when the reporter read the drop count to attach it
to each metric. It came out for two reasons: it broke the layering — a measuring module reading
transport state — and it did not work anyway, because in a hybrid run the late-arriving metrics read
a web queue that had stood down, and the one metric that read the native queue was boot, a second
into the run, where the count is always zero.

## Notes for implementers and tests

- `resetPerfMetrics()` is the teardown. The slot is module state; a suite that configures it and does not reset leaks a live reporter into the next file.
- `createPerfMetricReporter` returns the **same frozen no-op instance** every time it declines, so a test can assert identity rather than behaviour.
- `samplePercent` is the pin for tests — pass `100` or `0` rather than searching for a `runId` that hashes the way you need. Production never passes it.
- `sampling.spec.ts` checks determinism, the 0/100 boundaries, monotonicity in the percentage, and that a large sample lands near the requested rate. That last one is the assertion to preserve if the hash is ever changed.
- The reporter is stateless, and its spec asserts it: the same input twice produces the same record, and nothing accumulates between reports.

## Further reading

- [docs/entries/](../entries/README.md) — the entry a metric becomes, and the context it inherits
- [docs/upload/](../upload/README.md) — the queue these entries compete for
- [`apps/mobile/docs/boot-metrics.md`](../../../../apps/mobile/docs/boot-metrics.md) — how `boot`'s duration is defined and measured
