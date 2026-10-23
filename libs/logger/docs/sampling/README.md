# sampling — which statistics a run keeps, and how they are built

> Overview in the [lib README](../../README.md) · Canonical code:
> [sampling/policy.ts](../../src/sampling/policy.ts) ·
> [sampling/TelemetrySampler.ts](../../src/sampling/TelemetrySampler.ts) ·
> [sampling/catalog.ts](../../src/sampling/catalog.ts) ·
> [sampling/TelemetryRecorder.ts](../../src/sampling/TelemetryRecorder.ts)

Performance measurements and usage events travel the log pipeline as statistics entries (`kind`
`trace`, `sample` or `event` — see [docs/entries/](../entries/README.md#kinds)). This module decides
which of them a run keeps and builds the ones it keeps. **Logs never pass through it**: every log is
sent, as it always was. Sampling a log would drop exactly the run someone later needs to debug.

## Layout

```text
sampling/
  bucket.ts             fnv1a32 · samplingBucket — where a run falls in [0, 1) for a stream
  policy.ts             TelemetryPolicy · DEFAULT_TELEMETRY_POLICY · parseTelemetryPolicy · resolveTelemetryRate
  TelemetrySampler.ts   the per-run verdict, and the drain-time selector for the uploader
  catalog.ts            TelemetryCatalog · validateTelemetryRecord — the closed list of records
  TelemetryRecorder.ts  catalogue check → verdict → entry → publish
```

## The verdict

```text
sampled(stream) = bucket(runId, salt(stream)) < rate(stream, tag, context)
bucket          = FNV-1a(runId + ":" + salt) % 10000 / 10000
stream          = perf (trace · sample) | usage (event)
```

- **It is a pure function of the run id.** A sampled run sends every record of that stream, so a slow trace can be read beside the rest of its run. The same run gets the same answer in a later upload cycle and in another runtime, which is what lets a native record be judged after the fact (below).
- **Each stream has its own salt** (`perf`, `usage`), so a run can be sampled for one stream and not the other. The salts are part of the contract: changing one reshuffles every run.
- A rate of 0 keeps nothing, 1 keeps everything, and a fractional rate needs a run id — without one the record is not kept, since its answer could not be consistent.
- The hash is the one `@chatic/perf` already uses for its own run sampling, restated because this package imports nothing.

## The policy

The server owns the policy document; `parseTelemetryPolicy` is the only way one enters the code.

```jsonc
{
    "version": 7,
    "ttlSec": 3600,
    "enabled": true, // false is the statistics kill switch; logs are unaffected
    "defaults": { "perf": 0.2, "usage": 1.0 },
    "rules": [{ "match": { "stream": "perf", "tag": "perf.chat_room_open" }, "rate": 1.0 }],
    "force": [{ "uid": "<uid>", "until": "2026-10-26T00:00:00+09:00" }],
}
```

`resolveTelemetryRate` reads it in this order: the kill switch; a live override (`force` — 100%,
and an override past its `until` is ignored); the **first** rule whose every `match` key equals the
record's (`stream`, `tag`, `platform`, `host`, `appVersion`, `webVersion`); the stream's default. A
stream with no default is not collected — a policy has to say what it wants.

The parser is conservative item by item. A document without an integer `version` is not a policy
(the caller falls back to the last stored one, then the default). `enabled` must be exactly `true`.
A rate outside `0..1` is dropped, a rule with a match key this build does not know is dropped whole
rather than read more broadly than it was meant, and an override without a readable expiry is
ignored.

**The default is off.** `DEFAULT_TELEMETRY_POLICY` is `{ version: 0, enabled: false }`: a run that
never received a policy creates no statistics entries at all. That is what lets the client ship
before the server serves a policy — no statistics entry reaches the wire until one does.

### When it applies

`TelemetrySampler` takes the policy once, at the run's start, and keeps its rules and rates for the
whole run: a rate that changed mid-run would leave half a run's records. Only the two switches meant
to act at once are refreshed while the run goes on, through `updateSwitches` — the kill switch and
the overrides, read on every upload cycle. Pass it only a policy that was actually read: handing it
the default after a failed read would switch statistics off and empty every queued one.

## Who judges

- **A statistic made on the web** is judged when it is made, and an unsampled one never becomes an entry — no queue slot, no bridge hop.
- **A statistic made natively** (`boot`, `first_screen`) is queued unjudged, because native code does not read the policy. `TelemetrySampler.selectForUpload`, handed to the uploader as `selectTelemetry` ([docs/upload/](../upload/README.md#the-schedule)), judges it as the batch is drawn: kept ones are stamped with `sr`/`pv`, the others are acknowledged without being sent.
- **With statistics switched off** (`enabled: false`), `selectForUpload` keeps nothing, so whatever statistics are already queued are acknowledged and gone as they are drawn.

A record kept only because of an override carries the attribute `forced: '1'`, so it can be told
apart from a sampled run.

## The catalogue

Statistics take a **closed** list: `TelemetryCatalog`, keyed by full tag (`perf.chat_room_open`,
`usage.screen_view` — the same name can be a trace and an event). Each item lists the kinds it can
be, the attributes it may carry and the metrics it may report. An attribute either has a closed set
of values — usage events take only enumerations and number bands like `2-5`, never free text — or
`true` for any short string, for performance dimensions such as a route template.

`validateTelemetryRecord` refuses a record the catalogue does not name, one of the wrong kind, and a
trace without a usable `durationMs`. An attribute or metric outside the item is dropped and the rest
of the record kept: one stray dimension should not cost the measurement. Metrics are integers — a
fractional value is rounded, a non-finite one dropped. Every attribute key becomes a field the server
stores, which is why keys cannot be made up at a call site.

The catalogue itself is supplied by the host; this module holds the mechanism, not the list.

## The recorder

```ts
const recorder = new TelemetryRecorder({
    publish: ingestLogEntry, // the same hub, listeners and queue a log reaches
    context: provideLogContext, // the provider the host also gives setLogContextProvider
    sampler: new TelemetrySampler({ policy, runId }),
    catalog,
    onReject: rejection => console.warn(rejection), // development builds
});

recorder.trace('chat_room_open', { durationMs, attrs: { entry: 'list' }, metrics: { mount } });
recorder.event('screen_view', { attrs: { screen: '/channels/:id' } });
```

In order: the catalogue check — refusals are reported even while statistics are off, so a bad call
site shows up in development before the policy is ever opened; the verdict; then the entry, stamped
like a log (context, `id`, `timestamp`) plus `kind`, the structured fields, `sr`, `pv` and a `seq`
that increases per kept record. The level is always `info`, the tag `perf.<name>` or `usage.<name>`,
and the message the bare name.

`onReject` must not call `logger`: a refusal is a coding mistake to fix, not an event worth a queue
slot. A throwing context provider or hook never stops a record.

## Notes for implementers and tests

- `policy.spec.ts`, `TelemetrySampler.spec.ts` and `TelemetryRecorder.spec.ts` pin the contract above: same run → same verdict, first match wins, an expired override is ignored, the default policy yields no entries, and catalogue refusals.
- The web wires it (`apps/web/src/app/runtime/telemetry/`, documented in `apps/web/docs/observability/telemetry.md`): it builds the sampler at boot from the stored policy, passes `selectForUpload` to its scheduler, and refreshes the switches every minute. The policy source is a statistics-off stand-in until the server route exists. The app records its native traces unjudged (`apps/mobile/src/app/services/perf/nativeTelemetryRecorder.ts`), for the web to judge on upload.

## Further reading

- [docs/entries/](../entries/README.md#kinds) — the statistics fields on an entry
- [docs/upload/](../upload/README.md#two-shares-logs-and-statistics) — the statistics share of the queue
