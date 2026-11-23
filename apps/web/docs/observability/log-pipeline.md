# log pipeline — what the web's log runtime does and why

[logging.md](./logging.md) lists the boot order and the pieces. This page holds the reasons behind the
pieces in `app/runtime/logging/` and the sibling modules under `app/runtime/`, for anyone changing them.

## The rule everything else follows: the upload path never logs

Nothing in the uploader, the store or the native source calls `logger`. A log from there would feed the
queue it is draining (`logger → send → fail → logger`), so problems on that path go to `console`. The same
rule applies to **anything that reports on the queue**: a log listener or the upload path must not call a
diagnostic reporter either, because listeners run synchronously while the collector is handing an entry
out. Reporters belong on screen and hook layers only.

## Where entries live

- **Context is read at dispatch, never cached.** `logContext.ts` supplies `uid`, `cid`, route, version and
  so on for every entry as it is written, because they change during a session (login, cloud switch,
  navigation); a cached value would relabel a queued entry with whatever is true when the queue drains. The
  version is read live too, since the phone's second boot pass can rewrite it.
- **`runId` groups one launch.** It is the only axis that does, since sid/uid/cid are tenancy axes. The native
  shell issues it and injects it so native and web entries share it; a browser tab mints its own. The native
  half of a log carries no `uid`/`sid`/`cid`/`route` (the native runtime does not know them), so inside the
  app a missing injection strands every native entry with no way back to a user. The web still mints an id,
  and that substitution is silent, which is why `reportRunIdJoin` warns once, **only where the `diagnostics`
  port sends logs through the app**. It runs after the queue is wired because the context provider is
  registered before the queue subscribes and an earlier entry would reach nobody. `readInjectedRunId` (absence
  preserved) is separate from `resolveRunId` (always answers) so performance sampling, which both runtimes
  must decide the same way, can tell "not the app" from a local substitute.
- **Platform and host.** Where the app holds the logs the platform is the one the shell injects; where the page
  sends its own (a standalone tab) it is `web` whatever it runs on, because the browser differs there, not the
  OS. `effectiveType` is only reported where it exists (Chromium, Android WebView).
- **One console per run.** In a standalone page this listener prints. In hybrid the app's console shows web and
  native logs on one timeline, so printing on both sides would only double the cost. The exception is a dev
  build in the WebView: `debug` is not relayed (the highest-volume level, dropped by both durable sinks), so
  this is the only place web `debug` can be read. Release hybrid never prints here.
- **The store follows the `diagnostics` port.** In hybrid the app's store holds every entry as it is dispatched
  and the web keeps no copy; standalone, the page's own queue is the store. An app below the version floor
  boots only as far as the update screen and may predate the app's log store, so its logs stay in the page's
  queue.

## The page queue (`logUploadStore.ts`, `logUploader.ts`)

- **`localStorage`, not `sessionStorage` or IndexedDB.** The queue exists to survive, so "logs from a few days
  ago arrive on the next launch" would be false on a store that dies with the tab, and IndexedDB's async writes
  are least likely to finish at `pagehide`/backgrounding, the moments that matter most.
- **Keys are per tab** so two tabs never read-modify-write one record. A closed tab leaves its queue behind, so
  each tab keeps a heartbeat (every `HEARTBEAT_INTERVAL_MS` = 15 s) and a booting tab adopts any queue whose
  heartbeat is older than `ORPHAN_AFTER_MS` = 60 s, or that has none. Orphaned heartbeats whose queue is
  already gone are swept, or they accumulate for the life of the origin. The tab's identity lives in
  `sessionStorage` (exactly tab-scoped, survives reloads); minting a fresh id per load would leak a pair of
  keys on every refresh and strand the previous load's queue. Without `sessionStorage` the run behaves as a
  fresh tab each load.
- **Entries are flattened through the wire mapper before they are written.** That applies masking and the
  per-field size cap. A failed request's log carries the live axios error, whose `config` holds auth headers
  and the body; writing it raw would put unredacted payloads where any script on the origin can read them. It
  also stops one circular `data` from throwing on every save and silently ending persistence, and bounds use
  of the ~5 MB origin quota shared with session tokens.
- **Writes are debounced** (`PERSIST_DEBOUNCE_MS` = 1 s) because per-entry serialisation and a synchronous
  write on every line (`NET` logs one per request) is expensive. Settling a cycle, backgrounding and unload
  flush at once, so the window only costs entries in a hard crash. The scheduler removes accepted batches
  itself, so the stored copy is rewritten after each cycle; otherwise a reload would bring back entries the
  server already took. Adopted entries live only in memory until written, so that write is immediate.
- **Batch size is `UPLOAD_BATCH_SIZE` = 100.** Twice the logger's default, because statistics now share the
  request with logs; the body stays small. Statistics have a share of their own in the queue, and what it
  loses is counted onto a later sample. One line per drop event is logged, not one per entry.
- **Flush cues.** Backgrounding is the last reliable moment, and a tab the OS discards never fires `pagehide`,
  so visibility is watched too. A flush is meaningful only standalone: in hybrid the tab is not the process
  that learns it is dying, and loss is prevented by the app's store being durable.
- **Logout flushes but does not clear.** Each entry carries the `uid`/`cid` stamped at dispatch and the collector
  files by the entry, so a batch leaving after the next person signs in still lands under the account that
  produced it, and switching accounts on one device is ordinary. The callback is not awaited, so a clear after a
  best-effort flush would destroy the only copy a failed send could retry from. Sign-out removes the queue's
  keys from the plain store only through the shared key prefix (`signedOutKeys.ts`) and the runtime declaration.
- **The device opt-out is enforced at boot, on flush, and in the listener.** It must run before the first
  write, so a device that boots opted out never has restored entries land on disk, and it clears both the
  page queue and, in a hybrid run, the app's. `load` still runs while opted out because adoption deletes the
  dead tab's key as it reads it; skipping it would leave orphan keys forever. In hybrid the restored entries
  were already relayed as they were dispatched, so the page copy is dropped.

## Upload switches (`logUploadSwitch.ts`)

Three levers, with deliberately different reach; all are read live so flipping one needs no reload:

| Lever                                                | Meaning                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Build flag (passed in from `main.tsx`)               | The collector is in trouble: stop sending, keep accumulating so logs go out when it recovers                |
| Device opt-out (`log.collection.enabled`)            | Do not collect on this device: nothing queued, nothing written, existing queue discarded; a privacy control |
| Hold (`log.upload.hold`, or the app's injected flag) | Keep accumulating, do not send; a debugging lever that turns the queue into a monitoring view               |

- The build flag arrives as an argument because touching `import.meta.env` here would make this module, and
  everything importing it, unloadable under the CommonJS test transform.
- `log.upload.enabled` can be overridden on the local lane; an explicit override wins outright over the build's
  answer, which is checked directly because the registry's `defaultValue` cannot express "the opposite of the
  build value". The hold is checked before that override, otherwise forcing sending on would silently defeat a
  hold someone just switched on, on exactly the device being debugged.
- The app's injected hold is native-owned and live; the web's own hold is writable but the injected one is not
  (the app's debug menu owns it), so the UI never claims to turn off a hold that is still on. Either being on
  holds.

## The read-only queue view (`logQueueView.ts`)

The queue lives in the uploader's closure and is not exported: a second writer would break the at-least-once
contract. The uploader registers a view (`snapshot`, `clear`, `flush`, `droppedCount`) and the debug monitor
and the loss observer read through it. Registration, not a singleton, so the monitor cannot create a queue and
can tell "no uploader running" from "no logs". `clear` exists because reproducing a bug wants a clean slate
and the alternatives (release the hold, which ships everything, or reload) are worse; it discards, and the
label says so. `flush` exists because the uploader only sends on its schedule or a lifecycle cue, so someone
who just reproduced a bug could not send the result without closing the app. `flush` resolves when the attempt
finishes, not when the server accepted. Unregistering only clears the view that registered, so a late teardown
cannot remove a newer uploader's.

## The app's store as a source (`nativeUploadSource.ts`)

It is an object literal, not a class, because it stores nothing: every call goes over the bridge. `peek`
returning empty is indistinguishable from an unreachable store and does not need to be, since both mean
nothing ships; nothing is released except by `ack`. Entries without an id cannot be released remotely (the app
stamps one on every entry, so this is a guard). The reported size is the last round trip's, not a fresh one:
both fetch and ack answer with the size, it is a display value only, and a bridge call for a number nothing
decides on would cost a round trip.

## Reporters that exist because something is silent

All of them are quiet when healthy, so they are safe on paths that run forever.

- **Divergence reporter.** These bugs never fail: two numbers just disagree, and the stored logs can only be
  narrowed by `level`, `runId` and date, with the payload inside a length-capped `data` string that is not
  queryable. So the client compares and emits one `warn` with `data.observation` set to `badge-divergence`,
  `unread-divergence`, `member-divergence` or `cloud-name-divergence`; matching values log nothing. `message`
  carries only the direction of the skew, never values, because a person scanning and a script aggregating
  cannot share one string. User ids are left out and cloud names are logged as lengths only.
  Skip rules: an unreadable device badge (Android has none, so `null` means skip, never zero); a room that
  marked nothing; messages that arrived after the read (a count is then correct, not stale); a join record
  count of zero (an unhydrated cache looks like an empty room); a channel row with no roster (not synced yet,
  not "nobody"); one side absent for the cloud name (cold cache). A join without its own `metaNo` snapshot
  errs high by the system events between, the same symptom as a cursor that never landed, so the entry says
  which.
- **Read marks (`readMarkRegistry.ts`).** What the room told the server it had read, kept module-level
  because the room is unmounted by the time the list draws a count and the only reader is a diagnostic; a
  render-triggering store would sit on a path nothing renders from. It is deliberately not cleared when a room
  closes (the divergence appears _after_ leaving) and is bounded to 100 rooms, evicting oldest first with a
  re-insert on update so a room being read stays.
- **Queue loss (`queueLossObserver.ts`, `QueueLossRunner`).** The queue drops on backpressure in a fixed order
  (`debug`, then `info`, then oldest first), and a device that logs a lot is usually the one with a problem, so
  without this "no warnings for this user" is ambiguous between healthy and evidence thrown away. It reads the
  cumulative counter through the queue view from outside the send path (the queue and uploader cannot log their
  own failures) and reports only growth; a smaller number means a newer uploader and is a fresh baseline. It
  runs on foreground return (when loss during suspension becomes visible) and every 5 minutes for a session left
  open for hours, and is not tied to the upload cycle, which would write into the queue it is measuring while it
  is overflowing. The entry itself can be evicted, so its absence is not proof nothing was lost.
- **Sync streaks (`syncStreakReporter.ts`).** The poll runs about once a minute, so a path broken all day would
  log over a thousand identical entries; the useful fact is "no progress for N minutes". The first failure is a
  `warn`, reaching `STUCK_THRESHOLD` (3 consecutive failures, about three minutes at the poll interval) is one
  `error`, recovery is one `info`, and everything between is silent. Paths are counted separately because one
  dying while others live is a real state (a channel delta stalled on a rejected cursor while profiles sync).
  Recovery is logged so a stuck device can be told from one that healed.
- **Push entry hand-off (`pushEntryRegistry.ts`).** "Tapped a push, the room was slow or never appeared" is
  unanswerable from either side alone. A single slot carries the push id from the tap to the room it opens, so
  the room's entry shares the receipt's correlation key, instead of threading a diagnostic field through router
  state. Only push-originated opens are recorded, otherwise every room mount would spend the log budget. A tap
  not claimed within 30 s did not reach its room and would invent a latency from an unrelated visit, so it
  expires. The foreground receipt entry never carries the title or body (message content).

## Crashes that happen while the page is gone

- **Page crash sentinel (`webCrashSentinel.ts`).** A liveness mark is set while the session is alive and
  foregrounded; one still set at next boot means the previous session died uncleanly. `pagehide` alone is not
  enough because an OS-discarded background tab never fires it, which would report false crashes, so the mark
  is also cleared when the page goes hidden and re-armed when it returns. The trade is deliberate: a crash
  while hidden goes unreported, which costs less than eroding trust in the signal. The mark lives in the tab
  store and an unavailable store reads as "no mark", never a reported crash.
- **The crash entry** is stamped with the _current_ run's context and time: the crash was detected now, and the
  dead run's context cannot be reconstructed. The dead run's own entries reached the collector under their own
  `runId`; admin correlates them by `uid` and time adjacency. There is nothing to schedule, since a log entry
  only has to reach the queue and the uploader is wired first.
- **Native pending reports (`pendingReportFlusher.ts`).** WebView crashes, RN exceptions and native crashes are
  detected while the web is gone or dying, so they queue natively and are flushed here after a short settle
  delay past load (so the bridge is answering), only where the `diagnostics` port has the queue. Each is turned
  into an entry through `ingestLogEntry`, not `logger.error`: `logger` stamps the time at dispatch, which would
  date last night's crash to this morning's boot and misorder it. The dead run's `runId`/`sid`/`cid` are left
  unset because a wrong `runId` silently folds the crash into another run. The queued JS stack is used instead of
  a synthetic one that would point at the relay, and `report.logs` is ignored because those entries are in the
  native merged buffer the uploader already drains. Relayed ids are acknowledged; a failure leaves the id
  unacknowledged so the next boot retries it.
