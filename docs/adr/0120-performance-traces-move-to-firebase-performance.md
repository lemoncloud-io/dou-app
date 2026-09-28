# ADR-0120: Performance traces move to Firebase Performance, recorded natively and forwarded from the WebView

> Status: Accepted · Decided: 2026-09-28 · Implemented: `feat/firebase-perf-monitoring`
> · Scope: `libs/perf/**` (new) · `libs/logger/src/perf/**` (removed) ·
> `apps/mobile/src/app/services/firebase/perf/**` · `apps/web/src/app/runtime/perf/**` ·
> `libs/app-messages` (`StartPerfTrace` / `StopPerfTrace`, `OnNavigate.perfTrace`)
> · Supersedes in part: [ADR-0071](./0071-performance-budget-and-metric-events-over-the-log-pipeline.md)
> decisions 2 (sampling), 3 (transport) and the runtime budget table of decision 1. Its endpoints and
> targets stand.
> · The module docs are [libs/perf](../../libs/perf/README.md),
> [apps/web/docs/observability/performance.md](../../apps/web/docs/observability/performance.md) and
> [apps/mobile/docs/boot/boot-metrics.md](../../apps/mobile/docs/boot/boot-metrics.md)

## Context

Users report that opening a chat room is slow, both from a notification tap and from the chat list.
Nothing in the app can say where that time goes.

- ADR-0071 metrics cover boot, cloud switch, place switch and two web vitals. None of them covers a
  room opening.
- ADR-0099's push-entry logs follow individual pushes by `messageId`, but only for the in-app
  banner. An OS notification tap never reaches `pushEntryRegistry.begin`, so the case with the most
  reports produces no entry.
- ADR-0099 alternative 3 had already turned down making the room open a sampled `PERF` metric. Its
  reason was that a 10% sample leaves most reported sessions out.

ADR-0071 carried its metrics as `info` log entries on the upload pipe, sampled one run in ten. It
accepted two costs for starting with zero backend work:

- the server cannot aggregate, so every p95 means downloading raw entries and computing it offline
- metrics compete with diagnostic logs for the upload queue, which is the whole reason they were
  sampled

The app already ships Firebase (Crashlytics, Messaging, Installations). Firebase Performance
aggregates traces into percentiles by version, device, OS and country, with no work on our side, and
its traces do not use our queue.

Two facts shape the design:

1. **Firebase times a trace itself**, from its start call to its stop call. There is no API for
   submitting a duration measured elsewhere. ADR-0071's `reportPerfMetric(name, ms)` shape cannot be
   carried over. The instrumentation has to open a trace when the measured thing begins.
2. **Only the native SDK can record them for the app.** The WebView could run the Firebase JS SDK.
   The console would then show it as a separate web app, with a separate installation, apart from
   the iOS and Android apps it lives in and from their `_app_start`. Its automatic traces would also
   see little, because chat messages come over the socket and the native cache bridge, not over
   HTTP.

## Decision

### 1. A trace API in a new `libs/perf`, backed by a port

`@chatic/perf` holds the trace handle, the process-wide slot call sites use, the closed set of trace
names, and Firebase's per-trace limits. The handle's calls are `startPerfTrace` → `putAttribute` /
`putMetric` / `mark` → `stop`.

A `PerfTraceBackend` port (`start`, `stop`, no return values) decides where a trace is recorded.
The lib ships only the backends that need no native SDK: the log fallback and a deferring buffer.
The Firebase-backed one lives in `apps/mobile`.

The limits are enforced in the handle, for every backend: 5 attributes, the key and value shapes,
integer metrics. The React Native SDK throws on an out-of-limit value and the native SDK drops it. The log
fallback has no limits. Enforcing the stricter rule once is what makes a trace carry the same fields
on either backend.

The old `libs/logger/src/perf` is removed rather than kept alongside. Its surviving parts, the
run-hash sampling and the clock, moved into `libs/perf`, and logger goes back to being about logs.

### 2. The WebView forwards both ends over the bridge

Two new fire-and-forget web messages carry the ends of a trace to the native shell, which holds the
open Firebase trace by id:

- `StartPerfTrace { id, name }`
- `StopPerfTrace { id, name, attributes, metrics }`

Attributes and metrics ride on the stop only. The SDK sends them at stop anyway, and this keeps a
trace to two messages however many phases it marks. Traces that are never stopped are dropped after
two minutes and never recorded. That is Firebase's own meaning of an unstopped trace, and the honest
record of a wait with no end.

A notification tap is traced from where it happens. The native shell starts `chat_room_open` when
the tap reaches JS — only for a room target, since nothing would ever stop any other — and passes
`{ id, startedAt, entry, coldStart }` on `OnNavigate`. The web adopts it by id, marks its phases from
the native start, and stops it when the room draws. This is the only way the trace covers the
handshake and router gate the web was waiting behind. It does not cover the launch: on a cold start
the tap reaches JS after the runtime and the WebView are up, and that stretch is the `boot` trace's.

### 3. The destination is asked, and the log pipe remains the fallback

The web deploys ahead of the app, so the web cannot assume the installed app has the handlers. It
starts every trace on a deferring backend. When the WebAppReady reply arrives, the reply's
`supportedWebMessages` (already the handshake's capability list) decides:

- It lists both messages: the bridge.
- It does not: `LogPerfTraceBackend`, which is ADR-0071's transport in the new record shape
  (`{ trace, ms, attributes, metrics }`) and still sampled by run.
- There is no reply, in a plain tab: no run id, so nothing is recorded.

Keeping the fallback means the new room-open trace produces data the day the web ships, on the app
versions users already have, rather than after the app update reaches them.

### 4. No sampling on Firebase, no budgets in code

- **The native shell records every run.** Sampling existed to protect the upload queue, and Firebase
  traces do not touch it. It also removes ADR-0099's objection for the aggregate question. The
  individual question, what happened to this person, still belongs to the `messageId` logs, which
  stay.
- **The targets move to the Firebase console as performance alert thresholds.** ADR-0071's runtime
  table (`PERF_BUDGETS`) existed so each entry could carry `overBudget`, the one cheap filter a
  server with no numeric query allowed. The console answers "what is the p95 against the target"
  directly. The endpoints and targets are unchanged and are listed in the lib README.

### 5. `chat_room_open`

One trace from the tap to the room's first commit that shows messages.

- **Phases are metrics:** `handler`, `switch_done`, `mount`, `cache_emit`, and `message_count`.
- **Dimensions are attributes:** `entry`, `start`, `switch`, `cache` hit/miss, and `outcome`
  shown/empty/timeout/background/left. That is Firebase's cap of five, so adding a dimension means
  removing one.
- **The end is the skeleton gate (channel and chats) plus at least one message.** Chat loading
  alone is not the end, because a cold cache first emits an empty list. A room proven empty (it holds
  its first row and shows nothing) ends as `empty`.
- **Timeouts, leaves and backgrounding are recorded, not dropped.** A room slow enough to give up on
  is the sample this trace exists for. Backgrounding is its own outcome because timers stop there,
  and the duration would otherwise include the time away.
- **It measures only.** The page's existing push-entry log still gates on chat loading alone, and
  the empty-room flash on a cold cache is still there. Both are left as they are, so the first data
  describes the app as it is.

## Alternatives

- **Firebase JS SDK inside the WebView.** No native release, no bridge messages, and automatic
  capture of the web's HTTP and page load. Rejected:
    - It appears as a separate web app, detached from the native app, its installs and
      `_app_start`.
    - It cannot see the push-tap time spent before the WebView exists.
    - Its automatic traces cover transports the room path barely uses.
- **Keep the log pipe and add `chat_room_open` as a sixth sampled metric.** The smallest change.
  Rejected: the offline aggregation stays, and so does the 10% sample ADR-0099 already rejected for
  this question. The complaint is about the tail, and the tail needs every session.
- **Keep `reportPerfMetric(name, ms)` and record the duration as a custom metric on a zero-length
  Firebase trace.** Every call site would stay as it is. Rejected for timed scenarios: the console
  judges a trace by its own duration, so the real number would sit in a secondary metric while the
  headline column read ~0ms. The pattern survives only for values that genuinely arrive finished:
  the web vitals, as `recordPerfSample`.
- **Send traces only once the capability is known, dropping earlier ones.** Simpler than the
  deferring buffer. Rejected: boot-time FCP and LCP always land before the WebAppReady reply, so they
  would never be recorded.
- **Extend `libs/logger/src/perf` instead of a new lib.** No new project to wire. Rejected: traces
  are not logs, the logger's layering was already bent by a module that reached for transport state,
  and the backends are the part that grows.
- **Budgets kept as code alongside Firebase.** Rejected: two sources of truth for one threshold. The
  console is where the verdict is taken, so that is where the number lives.

## Consequences

**What is gained**

- Percentiles for boot, both switches, the two vitals and room opening, by version, device, OS and
  network, in the console, over every native run.
- The room-open wait split into phases, including the part before the WebView exists, and by entry,
  so "push is slow" and "the list is slow" can be told apart and compared.
- The trace data starts on current app versions, through the fallback, the day the web ships.

**What is accepted**

- **A native release is needed** for traces to reach Firebase (the `@react-native-firebase/perf`
  pod and Gradle dependency). Until it ships, every trace is on the sampled log fallback.
- **The Android Performance Gradle plugin is not added.** It only instruments HTTP clients and the
  `@AddTrace` annotation. Custom traces and app start work without it, and it costs build time. So
  the native shell's own HTTP is not auto-traced on Android.
- **iOS auto-traces native network requests, and that is kept on.** The iOS SDK instruments
  `NSURLSession` with no plugin, so native requests (the log upload, native file transfers, the
  Firebase SDKs' own calls) appear as network traces. Firebase records host and path, not the query
  string. Turning it off (`FirebasePerformanceInstrumentationEnabled`) would also switch off the
  automatic app-start and screen traces, which are worth more than the noise costs. So the two
  platforms' network rows are not comparable. Collection is on in every build, including debug; a
  local Debug build reports to whichever Firebase project its plist names.
- **The pod brings `FirebaseRemoteConfig` and `FirebaseABTesting` with it.** FirebasePerformance
  depends on them, which adds to the iOS binary. Neither is used directly.
- **`@react-native-firebase/perf` is pinned to 24.0.0**, the version of the `RNFBApp` and
  `RNFBMessaging` pods the app actually links. The root `package.json` still pins most other RNFB
  packages to 23.8.8 while `apps/mobile` resolves 24.0.0. That drift predates this change and is left
  alone.
- **Bridge latency sits inside WebView-timed traces.** The start and stop each cross the bridge, and
  on a busy JS thread either can be late. The phase metrics are measured on the WebView's clock and
  carry no bridge delay, so they are the cross-check.
- **Android notification taps are indistinguishable from OS links.** The app draws its own
  notification and the tap reaches JS as a plain URL, so it is tagged `deeplink`. Telling them apart
  needs an intent marker.
- **During the transition, the fallback data has a new shape.** `metric` became `trace`, names use
  underscores (`site_switch`), and `ok` became the `outcome` attribute. `budgetMs` and `overBudget`
  are gone. Nothing in the repo parsed the old shape. Offline scripts written against ADR-0071
  entries need updating.
