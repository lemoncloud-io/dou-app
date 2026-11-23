# Logs, crash reports and error reports

How the shell keeps what happened on a device, and what it does about what it cannot report itself.
The log API and its tags live in `libs/logger`; this describes the shell's side: the services under
`src/app/services/log`, `firebase`, `report` and `perf`, all built in `provider.ts`.

## One hub, three listeners

Native Kotlin/Swift lines, React Native lines and web entries relayed over the bridge all land on the
shared log hub from `@chatic/logger`. The shell wires three listeners onto it, before anything logs:

| Listener                 | Takes                               | Why                                                                                                                                                 |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Console (`__DEV__` only) | every level, with timestamps        | Read live in a terminal. Timestamps are on because web entries arrive later than they happened, so arrival order would misread the merged timeline. |
| Upload queue             | non-debug (all levels in `__DEV__`) | What has not reached the server yet; persisted.                                                                                                     |
| Crashlytics              | non-debug, non-statistics           | Breadcrumbs for a crash report.                                                                                                                     |

- **Every entry is stamped with a run id and device context** at dispatch (`nativeLogContext.ts`). The
  run id is issued once per process and is the axis that groups one launch; sid, uid and cid cannot,
  because they are tenancy axes. It is also injected into the WebView, so native and web lines from one
  launch carry the same id. The context is attached first, so nothing logged before it would be
  unattributable. Tenancy fields stay empty on the native side, because only the web session knows them;
  the server fills in what arrives. `sessionOwner` says which side holds the session this launch, and a
  source that throws leaves the field off rather than taking logging down.
- **Pure-native lines** reach the hub through `nativeLoggerBridge.ts`, which subscribes to the
  `ChaticNativeLog` events and signals `ready()` only after subscribing, so the native cold-start queue
  flushes into a live listener. A build without the native module degrades to a no-op.
- **Nothing in a listener may log.** A listener runs inside a hub publish, so a log call there would
  re-enter and recurse. The upload queue swallows its own failures, and its MMKV adapter
  (`uploadQueue/persistence.ts`) is built on a log service that only reaches `console`: the shared
  `MmkvStorage` reports its own failures through `ILogService`, and a failed write that published a log
  entry would be collected, written again and fail again for as long as the disk stayed full.

## The upload queue

`LogUploadQueueService` is the only log store on the device: what has not reached the server yet.
It uses the same `createLogUploadQueue` as the web, so the level policy, capacity drop order and id
dedup are shared. This class owns the platform contact only.

- **Nothing leaves before `ack`.** `fetch` hands back the oldest entries without removing them; only
  `ack` releases ids, so a repeated fetch returns the same entries.
- **Statistics get a smaller share** (`APP_STAT_QUEUE_CAPACITY`, `APP_STAT_QUEUE_MAX_BYTES`), because
  MMKV holds the whole queue in memory as one value.
- **Collection is debounced, acks are not.** Each entry re-serializes the whole queue, so a write per
  `logger.*` call would be an O(queue) MMKV write on every log line; collection persists after a
  one-second quiet window and may lose the last second in a hard crash. The web queue makes the same
  trade, and the crash itself is Crashlytics' job. `ack`, `clear` and teardown persist at once: they
  run on the upload rhythm, and losing that second would mean logs the server never receives.
- **`lastLogAt` is its own high-water mark**, stored under its own key and written with the queue. It is
  never derived from the queue's contents, because `ack` empties the queue on a healthy device and its
  newest entry is then not the last thing that happened. Debug entries move it too: a run's last line
  is its last line whatever the level, and boot logging is mostly debug.
- **The previous run's value is frozen at `init`.** `getPreviousRunLastLogAt()` is the only clock crash
  detection has; letting this run's entries advance it would answer with a time after the crash.

## Crashlytics

`FirebaseCrashlyticsService` is a sink outside the upload path, so it redacts for itself: the pipeline
keeps the raw value in the buffer and masks only in the wire mapper, so anything reading `entry.data`
directly reads unmasked input. Data is masked `strict` (bare placeholders only; the pipeline may keep a
token fingerprint for its own readers, and Firebase does not get that). Crashlytics attributes are a
flat string map, so nested values are stringified rather than spread.

- **`run_id` is set in `init()`**, not with the user. A native crash kills the process before anything
  can report, so the stack exists only in the Crashlytics console and the surrounding logs only in the
  collector; the shared run id is what lets the two halves be put back together, and setting it in
  `init()` tags a crash in the boot window while `setupUser` is still waiting for `DeviceInfo`.
- **`debug` is not a breadcrumb.** Crashlytics keeps roughly 64 KB of custom log per session and
  drops the oldest lines first. A debug line per HTTP request would spend that budget and evict the
  `info`/`warn` lines just before the crash. The upload queue drops `debug` for the same reason, so
  one level policy applies to both sinks.
- **Statistics entries (performance traces, usage events) are skipped** for the same budget reason.
- **Breadcrumbs carry the entry's own time**, so web logs relayed late keep their original timeline.

## Errors the shell sees but cannot send

The `/hello/report` signing token lives only in the web session, so the shell cannot send a report
itself. It queues it (`PendingReportQueueService`, MMKV, synchronous so a detection path can enqueue
without an async hop the process might not survive) and the web pulls and relays it. The queue keeps
the newest 20 (`MAX_PENDING_REPORTS`) so a crash loop cannot grow it without bound.

- **JS errors** (`installNativeErrorDetection`): uncaught exceptions through
  `ErrorUtils.setGlobalHandler` and unhandled promise rejections through the Hermes rejection tracker
  (the `promise` package's tracker where Hermes is not the engine). Each logs first, then queues a
  `native-error` report, and the previous handler is kept so RedBox and Crashlytics keep working.
- **Native crashes** (`checkCrashOnPreviousExecution`): a JVM or signal crash kills the process before
  anything can report, so Crashlytics keeps the stack and the _next_ launch queues a `native-crash`
  report. Its timestamp is the previous run's last log time, the nearest estimate of when the process
  died; with none recorded it is the time of detection, because the report is worth more than the
  timestamp it carries. It must run after `logUploadQueueService.init()`, which is what reads that
  value from disk.

## Native performance records

`nativeTelemetryRecorder.ts` writes native traces (`boot`, `first_screen`) as statistics entries into
the app's own upload queue, after the same catalogue check the pipeline applies. They carry **no
sampling decision**: native code does not read the sampling policy, the web does. The web uploader
judges each one when it draws the batch, by the run id it carries, and drops an unsampled one without
sending it. Native statistics are a handful per run, so holding them until then costs nothing.

`FirebasePerfTraceBackend` records `@chatic/perf` traces with Firebase Performance. Firebase times a
trace from its start call to its stop call, so the backend holds each open trace by id until the stop
arrives, and the attributes and metrics ride on the stop only. That keeps a trace to two bridge messages
however many phases it marks.

- **A trace not stopped within two minutes (`OPEN_TTL_MS`) is dropped unstopped**, which Firebase treats
  as never having happened: the room it waited for was never reached, or the WebView that owned it
  reloaded. Stopping it would invent a duration. The window is longer than the slowest path the web
  still closes on its own, so the slow samples the investigation is for are not the ones expired. A
  stop that arrives after the window is refused too, so time spent in the background is not recorded.
- **A trace name this build knows to be pipeline-only never becomes a Firebase trace.** An unknown
  name is recorded as before, and is cut to Firebase's limit of five attributes (the first five
  written), because the web deploys ahead of the app and a newer web's new trace must not wait for the
  app to update. For a known name the attributes are reduced to Firebase's own list; a stop that list
  refuses leaves the trace unstopped, which Firebase records as nothing.
- **A repeated start with the same id is ignored**: ids are generated per start, so a repeat is a
  duplicate delivery and the running trace is the one measuring from the real start. An unknown id on
  stop is expected (an expired trace, or a stop from a WebView whose start went to a replaced backend).
- **Measurement never surfaces as an app error**; a trace the SDK refused is simply absent.
