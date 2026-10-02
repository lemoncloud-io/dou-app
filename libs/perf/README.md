# @chatic/perf

**Performance traces, and the backends they are recorded on.** A trace has a start and a stop,
and in between it collects low-cardinality attributes and integer metrics. Where it is recorded
depends on the host: Firebase Performance in the mobile app (directly in the native shell, over the
bridge from the WebView), the log pipeline for a WebView inside an app build that cannot do that,
and nowhere at all for a host that never configures a backend.

This package holds the trace API, the limits every backend has to respect, and the two backends
that do not need a native SDK. The Firebase-backed backend lives in `apps/mobile`, because only the
app has the SDK.

## Why traces, and why Firebase

Firebase Performance times a trace itself, from its start call to its stop call. That shapes the
whole API: a call site opens a trace when the measured thing begins and stops it when it ends,
rather than measuring a duration and handing it over afterwards. Firebase gives two things the log
pipeline could not:

- **Percentiles in the console, with no offline work.** The log pipeline carried a number inside a
  length-capped `data` string, so every p95 meant downloading raw entries and computing it by hand.
- **Every session, not a sample.** The log pipeline sampled one run in ten, because metrics competed
  with diagnostic logs for the upload queue. Firebase traces do not use that queue, so the native
  shell records every run. The sampling only survives in the log fallback, which still shares that
  queue.

The WebView cannot record Firebase traces itself. The Firebase JS SDK would register the WebView as a
separate web app in the console, apart from the iOS and Android apps it runs inside. Its automatic
page-load and network traces would also see very little: messages arrive over the socket and the
bridge, not over HTTP. So the WebView forwards both ends of each trace to the native shell.

## Layout

```text
src/
  types.ts        PerfTraceName (closed) · PerfTraceStart · PerfTraceResult
  limits.ts       Firebase's per-trace limits, enforced for every backend
  PerfTrace.ts    PerfTrace (the handle) · PerfTraceBackend (the port) · NOOP_PERF_TRACE_BACKEND
  runtime.ts      the process slot: configurePerfTraces · startPerfTrace · adoptPerfTrace ·
                  recordPerfSample · resetPerfTraces
  traceId.ts      createPerfTraceId
  sampling.ts     PERF_SAMPLE_PERCENT · hashRunId · isSampledRun (log fallback only)
  perfNow.ts      performance.now() where it exists, else Date.now()
  backends/
    LogPerfTraceBackend.ts       info/PERF log entries, sampled by run
    DeferredPerfTraceBackend.ts  holds calls until the destination is known
```

## The traces

`PerfTraceName` is a closed union. A name becomes a row in the Firebase console and a console alert
is set against that exact string, so a typo must not open a second row that nobody watches.

| Trace            | Start                                     | Stop                                     | Target                         |
| ---------------- | ----------------------------------------- | ---------------------------------------- | ------------------------------ |
| `boot`           | native provider construction (≈ JS entry) | `WebAppReady` received                   | 1500ms at p95                  |
| `cloud_switch`   | cloud selected (the mutation hook)        | switch mutation settles                  | 1000ms at p95                  |
| `site_switch`    | place selected, past the same-place no-op | `auth.switch` settles                    | 1000ms at p95                  |
| `web_vitals`     | — a sample (see below)                    | —                                        | FCP 1800ms / LCP 2500ms at p75 |
| `chat_room_open` | the tap that opens a room                 | the room's first commit showing messages | none yet                       |
| `chat_room_sync` | the same tap                              | the room showing its synced, latest page | none yet                       |

The targets are not in code. They are judged in the Firebase console, where each is configured as a
performance alert threshold on its trace. They used to be a runtime table (`PERF_BUDGETS`) so a
log entry could carry an `overBudget` flag. That flag existed to give a server with no numeric query
one cheap filter. The console answers the question directly, so the table went with the flag.
`chat_room_open` has no target: it exists to find where the time goes, and a target should wait
until its distribution has been seen.

The attributes and metrics each trace carries are documented where the trace is taken. The boot
trace is in [`apps/mobile/docs/boot/boot-metrics.md`](../../apps/mobile/docs/boot/boot-metrics.md).
The room-open trace and the web side are in
[`apps/web/docs/observability/performance.md`](../../apps/web/docs/observability/performance.md).

## The handle

```ts
const trace = startPerfTrace('site_switch');
trace.putAttribute('outcome', 'ok'); // a low-cardinality dimension
trace.putMetric('message_count', 12); // an integer, last write wins
trace.mark('mount'); // ms since the trace started, first write wins
trace.stop(); // once; everything after is a no-op
```

- **`stop` is idempotent, and so is everything after it.** A caller that can end from two places
  (a success path and an unmount, say) records the first one, and the second cannot corrupt it.
- **`mark` keeps the first write.** A phase boundary that fires twice, through a re-render or a
  retry, was first reached at the first write.
- **Limits are enforced here, once.** The rules are Firebase's:
    - 5 custom attributes per trace
    - an attribute key is a letter, then up to 39 letters, digits or underscores, and must not use
      a reserved prefix
    - an attribute value is at most 100 characters
    - a metric name follows the key shape, up to 100 characters
    - metric values are integers

    The React Native SDK throws on an out-of-limit value, and the native SDK drops what gets past
    it, so the trace ships without it either way. The log fallback has no limits at all. Enforcing the stricter rule at the source means a trace
    carries the same fields on either backend.

- **A trace keeps the backend it started on.** Swapping the process slot mid-flight leaves open
  traces where they began, so a start is never paired with a stop on another backend.

### Traces that cross the bridge: `adoptPerfTrace`

A notification tap happens in the native shell, but the room it opens is drawn in the WebView. The
native side starts `chat_room_open` at the tap and passes `{ id, startedAt }` with the navigation.
The WebView calls `adoptPerfTrace(name, id, startedAt)`, which returns a handle that does not
announce a start: the native side already has one running. It only delivers the stop, by id.

`startedAt` is wall-clock epoch ms, because the two runtimes' monotonic clocks share no origin. An
adopted handle's marks are measured from the native start, not from the hand-over, and that is what
makes the native half of the wait visible.

### Numbers that arrive finished: `recordPerfSample`

A web vital is reported by the browser after the fact, so it cannot be timed by a start and a stop.
`recordPerfSample('web_vitals', { attributes: { vital: 'lcp' }, metrics: { value_ms } })` records it
as a zero-length trace carrying the value in a metric. For these traces, read `value_ms` in the
console. The trace's own duration means nothing.

### Traces several modules contribute to: the active trace

`chat_room_sync` is begun by a tap in the web, has its phases marked by the sync hooks in
`libs/app-runtime`, and is ended by the room page. None of them can hand the handle to the next, so
they meet at `setActivePerfTrace(name, subject, trace)` / `getActivePerfTrace(name, subject)`: one
trace in progress per name, keyed by what it is about (the channel, here).

- **One per name.** The things measured this way happen one at a time — a user opens one room at a
  time — and a slot that overwrites needs no cleanup to stay small. A replaced trace can no longer be
  found by name; a module already holding it may still mark and stop it, and otherwise it is never
  stopped, which records nothing.
- **`clearActivePerfTrace(name, trace)` clears only that trace**, so a module finishing an old trace
  cannot clear the newer one that replaced it. `endActivePerfTrace(name, subject, outcome)` records
  the outcome, stops the trace and clears it, for whichever module learns the measured thing is over.
  `endPerfTrace(name, trace, outcome)` does the same to a handle the caller already holds: a module
  ending the trace it took must not look it up by subject, which would end whichever trace replaced
  it.
- **`trace.hasMetric(key)`** lets the module that ends a trace ask whether a phase another module
  marks has been reached — the room page ends `chat_room_sync` on the first list emission after the
  sync marked `feed_done`.

## Backends

A backend has two methods and no return values. Nothing a caller does may wait on, or fail because
of, where a measurement is recorded.

- **The no-op backend** is what the slot holds until `configurePerfTraces` runs. It is also what it
  returns to on `resetPerfTraces`. That is why `apps/desktop`, `apps/desktop-web`, `apps/testbed` and
  a plain browser tab record nothing: none of them configures a backend.
- **`LogPerfTraceBackend`** writes each finished trace as
  `logger.info('PERF', '<name> <ms>ms', { trace, ms, attributes, metrics })`.
    - It is the WebView's fallback for app builds without the bridge handlers. The web deploys ahead
      of the app, so for a while that covers most sessions, and new traces start producing data the
      day the web ships.
    - It is sampled by run: `hashRunId(runId) % 100 < PERF_SAMPLE_PERCENT` (10). The run id is the one
      the native shell injects, so the verdict is a pure function both runtimes agree on. With no run
      id, nothing is sampled.
    - Its `start` records nothing. Only a finished trace is a sample.
- **`DeferredPerfTraceBackend`** holds starts and stops, in order, until `resolve(target)` names
  the destination. It then replays everything onto it and forwards from then on.
    - The WebView uses it because the destination is only known from the WebAppReady reply, which
      lands after boot has already produced its first vitals.
    - It holds at most 100 calls, and drops new ones past the cap. That can keep a start whose stop
      is lost, which on the bridge leaves the native trace to expire unrecorded. Only boot-time
      samples are ever held, far fewer than the cap.
    - A replayed start reaches its backend late by however long the answer took. That is harmless
      for finished samples. It is also why nothing timed by its own start and stop should begin
      before boot completes.

The Firebase backend (`apps/mobile/src/app/services/firebase/perf/FirebasePerfTraceBackend.ts`)
holds each open Firebase trace by id until its stop arrives. It drops a trace left open for two
minutes without stopping it, and refuses a stop that arrives after that window. Firebase treats an
unstopped trace as one that never happened, which is the honest record of a wait that had no end.
Dropping only forgets the JS handle: the SDK keeps a started trace in native memory until the process
ends, which is why a trace should only be started where something is certain to stop it. The bridge
handlers check a name's shape rather than membership in `PerfTraceName`: the web deploys ahead of
the app, and an app build checking its own copy of the list would drop every trace added after it
shipped.

## Wiring in each host

| Host                  | Backend                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile` native  | `FirebasePerfTraceBackend`, configured first in `DependencyProvider`, before the boot service opens its trace                                                                        |
| `apps/web` in the app | `DeferredPerfTraceBackend` at boot. It resolves to the bridge (`StartPerfTrace`/`StopPerfTrace`) when the WebAppReady report lists both messages, otherwise to `LogPerfTraceBackend` |
| `apps/web` in a tab   | Resolves to `LogPerfTraceBackend` with no run id, so nothing is recorded                                                                                                             |
| everything else       | Nothing configured, so the no-op backend                                                                                                                                             |

## Notes for implementers and tests

- `resetPerfTraces()` is the teardown. The slot is module state, and a suite that configures it
  without resetting leaks a backend into the next file.
- A fake backend is `{ start: jest.fn(), stop: jest.fn() }`. Assert on what `stop` received, which
  is the whole record.
- `samplePercent` pins the log backend's sampling in tests. Pass `100` or `0` rather than searching
  for a run id that hashes the way you need.

## How to verify

```bash
npx tsc -b libs/perf/tsconfig.json
npx jest --config libs/perf/jest.config.js
```

On a device, turn on Firebase Performance's debug logging and watch the traces go out:

- iOS: add `-FIRDebugEnabled` to the scheme's launch arguments, then look for `Logging trace metric`
  in the Xcode console.
- Android: add
  `<meta-data android:name="firebase_performance_logcat_enabled" android:value="true" />` to the
  manifest, then run `adb logcat -s FirebasePerformance`.
