# Diagnostics and debug panel

Source: `common.ts`, `perf.ts`, `native-storage.ts`, `custom-zip.ts`, `test-record.ts`. See the
[index](./README.md) for conventions. Most of the debug-panel messages are answered only by non-production
shells, or by a production shell while its debug mode is on.

## Logs

The `LogEntry` contract is `@chatic/logger`'s; `AppLogInfo` mirrors it on the wire, and `@chatic/bridges`
asserts the agreement because this package cannot import the logger.

- **`SendLog`** (web→native) — one log entry, at whatever rate the web logs. Declared with a reply like every
  request, but the shell's handler returns nothing and the bridge sends none (see "Fire-and-forget" in the
  package README). Fields beyond `message`:
    - `id` is entry-unique and is the server's dedup key; the receiver fills it in if absent. In the hybrid app a
      web log lands in both its own queue and the native buffer, and the uploader pulls from that buffer again, so
      without it the same log would be stored as two documents; with it the upsert merges them.
    - `runId`, `sid`, `uid`, `cid` are captured **when the log happens**, not at save time: they are the lookup axis for
      batch upload and may differ from the value at save time.
    - `timestamp` (ms) is optional; an older web build does not stamp one and the receiver substitutes its
      arrival time. `source` is the runtime the entry came from (`web` or `native`); the web forwarder stamps `web`.
    - `kind` tells a log from a statistic (`trace`, `sample`, `event`); absent means a log. The rest
      (`durationMs`, `attrs`, `metrics`, `sr` = sampling rate `0..1` the entry was kept at, `pv` = sampling policy version, `seq` = order
      within the run, `httpStatus`,
      `errorCode`) are a statistic's numbers and dimensions, kept as numbers and objects end to end. Every one is
      optional: an app or web build older than these fields sends and accepts entries without them.
    - `sessionId` is the usage session id and is shorter-lived than `runId`. `platform` is `ios`, `android` or
      `web`; `host` is `app` (WebView or native) or `browser` (standalone web). `routeTemplate` is the route pattern
      (`/channels/:id/room`), the screen axis statistics aggregate on. `sessionOwner` is `web` or `native`: which side
      holds the session this run.
- **`FetchLogUploadQueue`** — a batch from the app's upload queue (since the old ring buffer was retired it is
  the only log store, and the debug view reads it through this message too). **Non-destructive**: the same
  entries can come back on a repeat call, and only `AckLogUploadQueue` releases them. If fetching removed
  entries the only copy would vanish before the upload succeeded, so a crash in that window would lose exactly
  the log that matters most, the one from the moment the app died. The reply's `size` is the whole queue's size
  at fetch time, not the batch's.
- **`AckLogUploadQueue`** — remove entries by `ids` after the server accepted them; replies the new `size`.
- **`ClearLogUploadQueue`** — discard the whole queue. Reserved for a device opt-out ("stop collecting on this
  device"), where letting queued entries still go out would contradict that. **Do not use it on logout:**
  entries carry the uid and cid captured at occurrence, so accounts never mix and they are safe to keep, while
  clearing would lose the very entries that record whatever session problem prompted the logout. The reply's
  `size` should normally be 0.
- **`FetchPendingReports`** / **`AckPendingReports`** — reports native detected but cannot send itself
  (`webview-crash`, `native-error`, `native-crash`). The `/hello/report` signing token is held only by the web
  session, so native queues a snapshot at detection time (in MMKV) and the web pulls it after boot to send it on
  native's behalf. `id` is the dedup key for the ack so it is not sent twice; `detectedAt` (ms) is used as the
  payload timestamp, not the time of the proxied send; `stack` exists for `native-error` when present; `extra`
  is platform specific (`isFatal`, exit reason, ...). Ack replies the remaining `size`.
- The four `*AppLogBuffer` requests, `FetchSafeArea` and `FetchBackgroundStatus` were retired in 2.8.0; a custom
  bundle that still sends one gets `NOT_FOUND`.

## Boot and performance

The web collects its half of the boot timeline and hands it to the shell once per page load; the shell merges it
with its native milestones and persists the combined record.

- **`SendBootMetrics`** (web→native) — the web snapshot: `marks` in ms relative to the WebView page-load start
  (`timeOrigin`), navigation timing for the document, per-bundle resource timing (tells cache hits from network
  downloads), `webVersion`.
- **`FetchBootRecords`** / **`ClearBootRecords`** — read back or drop the persisted records (so the web debug
  panel can show what only the shell could read). `records` are newest first, capped by the native ring buffer;
  `finalizedAt` is epoch ms; native milestones are relative to the session baseline; `totalMs` is baseline to
  `WebAppReady`, the headline "boot took N ms" number. `type` is `cold` (a cold launch), `reload` (a WebView
  content-process reload within a live app) or `restart` (since 2.35.0: a JS context the app started over itself,
  after a session its runtime held ended or after the owner switch). The reply adds `contentProcessReloadCount`
  (reloads in this app run) and `lastForegroundResumeMs` (`null` if the app has not backgrounded yet).
- **`SetDebugMode`** — propagate the web's debug unlock (MyPage 10 taps) to the shell so the native debug overlay
  opens in production builds too. `enabled: false` locks both sides again; the reply echoes the flag the shell
  persisted.
- **`StartPerfTrace`** / **`StopPerfTrace`** — a Firebase Performance trace. Firebase times a trace itself from its
  start call to its stop call and only the native SDK can record one, so the web sends the start the moment its
  measurement begins instead of a finished duration. `name` is one of `@chatic/perf`'s trace names, typed as a
  string here so this package does not depend on the one that produces it; `id` pairs a start with its stop.
  `attributes` are already within Firebase's attribute limits and `metrics` are integers within its metric limits
  (`@chatic/perf` enforces them at the source). A stop for an id the shell does not hold is ignored; a stop may
  also close a trace the shell started itself and handed over.
- **`OnNavigate.perfTrace`** (`HandedOverPerfTrace`) — a trace the shell started and the web must stop, the
  room-open trace a notification tap begins. `startedAt` is epoch ms of the native start, wall-clock because the
  two runtimes share no other clock. `syncId` is the `chat_room_sync` trace started at the same moment; absent
  from builds that predate it, and then the web starts that one itself at hand-over. `entry` is `push_tap` (a tap
  the notification library reported) or `deeplink` (an OS link, which on Android includes a tap on a notification
  the app drew itself, indistinguishable here). `coldStart` says whether the tap launched the app: the trace
  starts once the tap reaches JS, after the launch, so this separates opens that followed a cold boot.

## Native storage and cache control

- **`FetchNativeStorageSummary`** (web→native, debug panel) — inventory of what the shell persists: SQLite tables
  and MMKV keys, because the web can measure only its own half (localStorage, IndexedDB) while the chat cache and
  the invited-cloud list live natively. Each entry has `count` (rows; always 1 for an MMKV key) and `bytes`,
  approximate: summed text length of every column, or the length of the stored string. Good for "which one is
  big", not for disk accounting. `missing` marks a table that does not exist (a failed migration never created
  it) and `error` one that exists but could not be read. `sqlite` lists every cache table including those
  `ClearNativeCache` keeps; `mmkv` every key (preferences, the shell's config lane, the log and report queues);
  `unrecoverableTables` are tables the server cannot fill again, which `ClearNativeCache` empties only when asked;
  `keptTables` are never emptied. `invites` is one of those: it carries the invite-card dismissals that only this
  device writes, and the server refills the rows but not that stamp.
- **`ClearNativeCache`** — empty the native SQLite cache. MMKV is not touched: it holds the shell's own settings and
  its unsent log and report queues, not a copy of server data, so wiping it fixes no stale-cache bug and loses
  things nothing refills. `includeInvitedClouds` also empties the invited-cloud table; off by default because the
  server has no list of invited clouds to fetch again, so once cleared a cloud returns only when a push happens to
  name it. The reply lists tables `cleared`, `kept` and `failed` (a table whose clear threw is in neither of the
  first two).

## Custom web bundle (QA)

- **`ApplyCustomZip`** (web→native) — download a zip, unpack it and serve it from a local server; the reply's
  `serverUrl`, when present, is where the WebView reloads. **`DisableCustomZip`** reverts to the default web
  build. **`FetchCustomZipStatus`** reports `allowed`, `localRoot` and `serverUrl`: when `allowed` is `false` the
  feature itself is blocked on this build, so the web should say so rather than seem to fail.
- The URL decides the code the WebView runs, so the shell applies a **fail-closed gate at build time**: production
  builds reject it. The check uses the baked `VITE_ENV`, which a web page cannot tamper with (the phone shell's
  `customZipGate.ts` allows it only while `VITE_ENV !== 'PROD'`).

## Test records

Five messages (`FetchTestRecord`, `FetchAllTestRecords`, `SaveTestRecord`, `SaveAllTestRecords`,
`ClearTestRecords`) drive the shell's native DB scenario harness; `TestRecord` is `{ key, value, updated_at }`.
Used by the debug panel only.
