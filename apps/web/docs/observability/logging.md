# logging — how this app wires the shared logging core

> Scope: `apps/web/src/main.tsx`, `apps/web/src/app/app.tsx`, `apps/web/src/app/runtime/logging/`
> (14 files) and three sibling modules under `app/runtime/`. The entry contract, the hub, masking
> and the upload queue itself are owned by [`@chatic/logger`](../../../../libs/logger/README.md);
> this document covers only what `apps/web` does with them.

Every call site uses one API — `logger.{debug,info,warn,error}(tag, message, data)` — imported from
`@chatic/bridges` (which re-exports `@chatic/logger`). Where an entry ends up is decided by whoever
subscribes to the hub, and this app is one of those subscribers.

## Boot order (`main.tsx`)

| #   | Call                                                     | Why it has to sit there                                                                             |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `setupBridgeLogger()`                                    | wires the native forwarder (hybrid only) before anything can log                                    |
| 2   | `attachConsoleListener()`                                | the web-standalone console sink                                                                     |
| 3   | `attachLogContext()`                                     | registers the context provider the core reads at every dispatch                                     |
| 4   | `startLogUploader({ … })`                                | subscribes the upload queue — **the only log store**                                                |
| 5   | `reportRunIdJoin()`                                      | one entry saying whether native and web share a `runId` this launch                                 |
| 6   | `attachWebCrashSentinel()` → `schedulePageCrashReport()` | reads the previous session's fate, logs `[page-crash]` if it died uncleanly                         |
| 7   | `schedulePendingReportFlush()`                           | hybrid only — drains the native side's own crash/exception queue into this one via `ingestLogEntry` |

The core keeps no ring buffer of its own — the queue is filled purely by a hub subscription — so an
entry dispatched above step 4 is published to nobody and lands nowhere. That is the one ordering
constraint that matters when touching this file: nothing that can log belongs above
`startLogUploader`, and `attachLogContext` has to precede it too, since context is stamped at
dispatch, not backfilled later.

```bash
grep -n "setupBridgeLogger\|attachConsoleListener\|attachLogContext\|startLogUploader\|reportRunIdJoin\|attachWebCrashSentinel\|schedulePendingReportFlush" apps/web/src/main.tsx
```

## The upload queue is the only store

`startLogUploader` (`app/runtime/logging/logUploader.ts`) is the composition point: it builds a
`LogUploadQueue`, persists it through `logUploadStore.ts` (debounced, tab-scoped `localStorage`),
and hands a `LogStoreReader` to the scheduler. Nothing else keeps a copy — the ring buffer this
pipeline used to keep alongside the queue is gone, and so is its own persistence.

- Only `info` and above are queued; `debug` is console-only. Both durable sinks the app wires
  (this queue, and Crashlytics on `apps/mobile`) drop `debug`, so in a `prodRelease` build it never
  reaches storage — that is `debug`'s purpose, not a bug in the debug overlay.
- `logUploadSwitch.ts` composes three independent controls the uploader checks before every send:
  the device opt-out (`log.collection.enabled` — stops collecting entirely), a build-time flag
  passed in from `main.tsx` (never reads `import.meta.env` itself, so the module stays loadable
  under the test transform), and a hold toggle (`log.upload.hold`, plus a native-injected
  `CHATIC_APP_LOG_UPLOAD_HOLD`) that keeps the queue filling without draining it — a debugging lever,
  not a privacy one.
- `logQueueView.ts` is a read-only window the debug monitor and the loss observer share:
  `snapshot()`, `clear()`, `flush()`, `droppedCount()`. The uploader registers it and nothing else
  may — a second writer would break the queue's at-least-once contract.

## Global error detection (`app.tsx`)

Every path below ends the same way: one `logger.error` call. There is no separate error-report
pipeline any more — `runtime.report.reportIssue` (used by the feedback form) is the only remaining
caller of the report endpoint, and it is for user-submitted text, not automatic capture.

| Path                      | Entry                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `window.onerror`          | `[window.onerror] …` — `filename`/`lineno`/`colno`, `data.errorWasNull` when the browser gave no stack |
| `unhandledrejection`      | `[unhandledrejection] …`                                                                               |
| `error` (capture phase)   | `[resource-error] …` — a failed `<img>`/`<script>`/`<link>` load                                       |
| `securitypolicyviolation` | `[csp-violation] …`                                                                                    |
| react-query `onError`     | `[query] …` / `[mutation] …`                                                                           |
| `ErrorBoundary`           | `[error-boundary] …` (`data.componentStack`)                                                           |

```bash
grep -n "logger.error" apps/web/src/app/app.tsx
```

The message prefix is the only classification left — admin groups by it — which is coarser than
the retired `category` field (no more splitting by HTTP status or network shape). What that split
cost, and why the report path was retired in its favor, is not repeated here: both endpoints wrote
to the same store, and the detection paths above were already calling `logger.error` first.

## Debug UI (`LogBufferScreen`)

The debug overlay's log screen reads the **unsent queue**, never a separate log store: on a hybrid
build it calls `appBridge.fetchLogUploadQueue()` (a bridge round trip against the native-held
queue); on plain web it reads `getLogQueueView()` synchronously. Because the view is
registration-based rather than a singleton, the screen can tell "no uploader running" from "nothing
logged yet" — an `undefined` view is the former.

While uploads are enabled the screen normally empties itself, since the uploader is draining what
it shows. The **hold** toggle in this same screen is what turns it into a monitoring view — flip it
on, reproduce something, read it back. A device-level opt-out is a different lever: it discards the
queue instead of pausing it.

## Related

- The entry contract, the hub, masking, and the upload schedule are canonical in
  [`@chatic/logger`](../../../../libs/logger/README.md).
- The web→native relay (`setupBridgeLogger`) is [bridge.md](../bridge/README.md).
- The debug overlay itself is [debug feature](../feature/debug/README.md).
