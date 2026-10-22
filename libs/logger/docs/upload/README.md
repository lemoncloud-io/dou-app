# upload — the queue and the schedule

> Overview in the [lib README](../../README.md) · Canonical code:
> [upload/LogUploadQueue.ts](../../src/upload/LogUploadQueue.ts) ·
> [upload/LogStore.ts](../../src/upload/LogStore.ts) ·
> [upload/LogUploadScheduler.ts](../../src/upload/LogUploadScheduler.ts) ·
> [upload/uploadPolicy.ts](../../src/upload/uploadPolicy.ts)

**There is exactly one store in this package: the queue of entries the server has not accepted yet.**
Two readers share it — the uploader and the debug monitor — and neither empties it by reading.

The package used to keep a second store, a ring buffer for diagnostics with its own persistence
port, on the grounds that the two had different lifetimes: one could die with the tab, the other
existed to persist. Making sending pausable collapsed that difference — a queue that is not being
drained _is_ the diagnostic window — so the buffer is gone and the queue serves both readers.

## Layout

```text
upload/
  uploadPolicy.ts        the numbers and the outcome vocabulary, separate from the machine
  LogUploadQueue.ts      the store itself — pure, no persistence, no timers
  LogStore.ts            three ports (reader · writer · both) + toLogListener
  QueueLogStore.ts       the adapter that presents a queue as a LogStore
  LogUploadScheduler.ts  when a batch goes out and what happens when it fails
```

Nothing here touches a disk, a clock or a network. Persistence belongs to whoever owns the queue
(`localStorage` in `apps/web`, MMKV in `apps/mobile`), the transport is a `send` function the host
injects, and the timer is injectable so every rule below is testable without waiting in real time.

## The queue

```ts
const queue = createLogUploadQueue({ capacity, maxBytes, acceptDebug, onDrop, statCapacity, statMaxBytes, onStatDrop });
```

| Name          | Default | What it bounds                          |
| ------------- | ------: | --------------------------------------- |
| `capacity`    |     500 | entries held before backpressure starts |
| `maxBytes`    |   512KB | serialized bytes, on top of the count   |
| `acceptDebug` | `false` | whether `debug` is stored at all        |

`statCapacity`, `statMaxBytes` and `onStatDrop` belong to the statistics share — see
[Two shares](#two-shares-logs-and-statistics). The table above is the log share, unchanged.

**Two axes, because either alone leaves a hole.** A count-only limit is cheap but says nothing about
size, so a handful of entries carrying large `data` can eat far more than intended — and on the web
that budget is shared with everything else on the origin, so logs winning it breaks features that
have nothing to do with logging. A byte-only limit closes that but pays a serialization per push.
The count does the everyday work; the byte ceiling stands behind it. Size is measured once per entry
and remembered in a `WeakMap`, and an entry that cannot be stringified at all is charged a nominal
1KB rather than zero — charging zero would let exactly those entries accumulate unbounded.

### The drop order

`debug → info → warn → error`, oldest first within a level, until **both** axes fit again.

That order is what makes storing `debug` possible. Without it a busy minute of request logging would
evict the `warn`/`error` lines the window exists for — which is the failure the old policy avoided by
refusing `debug` outright. Crashlytics still refuses it, because its budget is roughly 64KB per
session with oldest-first eviction and the competition there is much tighter.

`onDrop` fires **once per drop event**, not per entry: the store's own troubles must never become the
thing filling the store. Both hosts write that summary to `console`, not to `logger` — the queue is
inside the logging path.

The queue also keeps a cumulative `droppedCount()` for the life of the run, and **never resets it**.
It counts its own losses because nothing else can: the drop happens inside `push`, which runs inside
a hub publish, and the upload path may not log at all. A reader elsewhere picks the number up later
and carries it out on an entry that _is_ written — see
[docs/observations/](../observations/README.md#queue-loss).

### Two shares: logs and statistics

Statistics (`trace` · `sample` · `event`, see [docs/entries/](../entries/README.md#kinds)) ride the
same queue, but each kind of record is capped inside its own share and evicted only by its own
kind.

|               | Log share                                     | Statistics share                                                                                     |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ceilings      | `capacity` 500 · `maxBytes` 512KB — unchanged | `statCapacity` · `statMaxBytes`: web 500 · 256KB (the default), app 300 · 160KB (`APP_STAT_QUEUE_*`) |
| Drop order    | `debug → info → warn → error`, oldest first   | `sample → trace → event`, oldest first                                                               |
| Loss reported | `onDrop`, `droppedCount()`                    | `onStatDrop`, `droppedStatCount()`                                                                   |

**Neither share evicts the other.** With one shared budget the devices that log the most — the slow
ones — would lose their measurements first and every percentile would read better than the truth;
the other way round, a burst of measurements would push out the `warn`/`error` lines the queue is
for. The shares are arithmetic over the one array: storage, batching and order are unchanged, a
batch mixes both kinds oldest first, and with no statistics in the queue the log share behaves
exactly as before. An entry with no `kind` is a log. The statistics ceilings are design values, to
be replaced by measured ones.

The statistics share adds to the store's footprint: on the web the queue can now hold up to 768KB
of `localStorage` (512KB of logs plus 256KB of statistics) instead of 512KB.

`clearStats()` empties the statistics share and leaves the logs — the statistics kill switch. It is
not counted as a drop. `headroom()` is the log share's room, `statHeadroom()` the statistics share's.

### What each method is for

| Method                     | Note                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `push(entry)`              | The level gate, then both ceilings. Synchronous — it runs inside `publish`               |
| `nextBatch(limit)`         | A **slice**. Nothing leaves the queue here                                               |
| `remove(sent)`             | By `id`, with an identity fallback so an id-less entry is still removable                |
| `snapshot()` / `restore()` | The persistence pair. `restore` re-applies the level policy and **mints a missing `id`** |
| `droppedCount()`           | Cumulative log-share evictions this run (`droppedStatCount()` for the other share)       |
| `clear()`                  | The opt-out and the monitor's explicit discard                                           |
| `pushAll(entries)`         | A bulk drain that also de-duplicates against queued ids                                  |
| `headroom()`               | Log-share slots left before eviction, for a destructive producer to ask before it drains |
| `sendableSize()`           | How many entries a batch would carry right now                                           |

`restore` minting an id is not a nicety. `id` is both the server's dedup key and the key the host
acknowledges by, so an entry without one can be uploaded but never removed: it ships on every cycle
and the server stores a fresh document each time. Records written by a build whose persistence
dropped the field are exactly that case and are already on devices, so they are repaired on the way
in. A fresh id can let one already-uploaded entry through a second time, which is the strictly better
failure — the alternative is an entry that can never leave.

**Three of those have no production caller today.** `pushAll`, `headroom` and `sendableSize` are
reached only from `LogUploadQueue.spec.ts`; `headroom` is not reached even from there. They are the
surface a destructive bulk producer needs, and the bridge hop that was that producer is gone. Check
before assuming a behaviour change is safe:

```bash
grep -rn "pushAll\|headroom\|sendableSize" --include='*.ts' --include='*.tsx' apps libs | grep -v node_modules
```

## The ports

```ts
interface LogStoreReader {
    peek(limit: number): Promise<LogEntry[]>; // oldest first, NOT removed
    ack(entries: LogEntry[]): Promise<void>; // the only normal way out
    clear(): Promise<void>;
    size(): number; // best-known, may lag a cycle
}

interface LogStoreWriter {
    push(entry: LogEntry): void;
}

interface LogStore extends LogStoreReader, LogStoreWriter {}
```

**Reader and writer are split on purpose.** In a hybrid run the web has no store of its own — the app
owns it — so what `apps/web` holds is a bridge-backed reader that stores nothing. Folding `push` into
one interface would force that object to carry a method it cannot honour. The split also makes "the
uploader is not a subscriber and cannot append" true at the type level rather than by convention: the
scheduler is given a `LogStoreReader` and has no way to write.

`peek` / `ack` / `clear` are async because a bridge implementation exists and a round trip is a
promise; local implementations resolve immediately. `size` is not, because it is a display value and
the remote implementation answers from the count its last round trip reported — asking across the
bridge would cost a trip per read. Its first call therefore answers 0 until a `peek` has happened.

`ack` takes **entries** rather than ids so an entry that somehow carries no `id` is still releasable;
a remote implementation extracts the ids itself before putting them on the wire.

`toLogListener(writer)` turns a writer into a hub listener whose whole body is `writer.push(entry)`.
`QueueLogStore` (or `createQueueLogStore(queue)`) presents an in-process queue as a full `LogStore`:
every method is a one-liner, because the queue already has the semantics the port asks for.

## The schedule

```ts
createLogUploadScheduler({ store, send, isEnabled, onGiveUp, onSettled, selectTelemetry, ... });
```

| Name              | Default         | Meaning                                            |
| ----------------- | --------------- | -------------------------------------------------- |
| `batchSize`       | 50              | entries per `peek`                                 |
| `intervalMs`      | 60,000          | the tick                                           |
| `backoffMs`       | `[5s, 30s, 2m]` | delay after the 1st, 2nd, 3rd+ failure             |
| `maxAttempts`     | 5               | attempts for **one batch** before it is dropped    |
| `selectTelemetry` | none            | which statistics in a drawn batch are sent — below |

**The interval is the only trigger.** There is no `notify`, and the scheduler does not observe
dispatched entries at all — which is what makes "the hub's subscribers are the listeners, and only
the listeners" true without any wiring to enforce it. An `error` waits for the next tick like
everything else; the thing that needs to react immediately, Crashlytics, is a listener and already
does.

`flushNow()` is the one way to send off-schedule. It is a lifecycle cue (pagehide, logout), not a
trigger, and it is only meaningful web-standalone: in a hybrid run the app owns the store, and the
web is not the process that learns it is dying. What prevents loss there is the store being durable.

One cycle, in order:

1. **Not running, or already in flight?** Return. The in-flight flag is held for the _whole_ cycle, not just the send: `peek` is non-destructive by contract, so two overlapping flushes would draw the same batch and send it twice.
2. **`isEnabled()` false?** Re-arm and return — keep accumulating, just do not send.
3. **`peek` threw?** Treat it as an empty cycle. Nothing was lost, because nothing was released.
4. **`selectTelemetry`, when given**, sees only the statistics in the batch and returns the ones to send (re-stamped copies allowed, matched by `id`). The rest are acknowledged at once, unsent. See below.
5. **Empty batch?** Skip the request entirely. An idle device would otherwise call the collector once per interval forever. The `peek` round trip itself still happens every cycle — a cached size cannot stand in for it, because in a hybrid run the app's store receives native-origin entries the web never saw.
6. **`send(batch)`** answers an `UploadOutcome`.

| Outcome     | Means                                               | Then                              |
| ----------- | --------------------------------------------------- | --------------------------------- |
| `'ok'`      | 2xx — accepted, individually dropped items included | `ack` the batch, reset attempts   |
| `'discard'` | the request will never succeed as-is                | `ack` the batch — same path as ok |
| `'retry'`   | worth another attempt                               | back off, keep the entries        |

**Mapping a status code onto one of the three is the host's job**, inside the `send` it injects. The
scheduler never sees a status. A rejected promise is indistinguishable from a 5xx here and is treated
as `'retry'`.

**The attempt cap is what guarantees termination.** Without it a server answering 5xx to something it
will never accept — an expired session, say — would have the client resending forever. With it the
client stops on its own, so termination does not depend on the server choosing 4xx over 5xx. On
give-up the batch is **released**, not returned to the store: leaving it would make the same content
eligible forever, which is the endless resend the cap exists to prevent. It has to be the batch that
actually failed rather than a freshly composed one, because entries that arrived during the backoff
window were never attempted.

A failing `ack` is swallowed. The source still holds the entries, so the next cycle re-fetches and
resends them — at-least-once, which the server's id upsert absorbs. Throwing instead would abort the
cycle without arming the next timer and stall the pipeline for good, trading a duplicate request for
permanent silence.

**`selectTelemetry` is how statistics are judged on the way out.** Two cases need it. A native
statistic (`boot`) is recorded before anything in the process knows the sampling policy, so it is
queued unjudged and the web uploader decides when it draws it; and the statistics kill switch has to
empty what is already queued. Both are "acknowledge without sending", and both are limited to
statistics by construction: the selector is never handed a log, so no policy bug can hold one back.
A selector that throws sends the batch as drawn. A batch the selector empties entirely is
acknowledged and the cycle draws again — up to ten times — so logs queued behind a run of unsampled
statistics are not held back an interval per batch. `TelemetrySampler.selectForUpload` is the
implementation — [docs/sampling/](../sampling/README.md).

`onSettled` fires after every cycle that mutated the store. The owner persists there: removing a
batch happens inside the scheduler, so without the hook the on-disk copy would still list entries the
server has already taken, and a reload would resurrect them.

## Two different levers

They are often confused, and combining them makes one of the two wrong.

| Lever                           | Means                           | The queue                                                                      |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| **Hold** (`isEnabled` false)    | "accumulate, do not send"       | **kept** — this is the debug workflow: turn it on, reproduce, read the store   |
| **Opt-out** (device preference) | "do not collect on this device" | **discarded** — a privacy control that keeps what it already holds is cosmetic |

Both are host-side switches; what belongs here is that the scheduler implements only the first, and
the second is a `clear()` on every store the device has.

## Naming history

Old names still appear in sibling modules and in review comments. Recorded as of 2026-09-14.

| Old                                                    | Now                                       |
| ------------------------------------------------------ | ----------------------------------------- |
| `LogUploadSource`                                      | `LogStoreReader`                          |
| `QueueLogUploadSource`                                 | `QueueLogStore`                           |
| `LogBuffer` / `RingBuffer` / `LogPersistence`          | gone — the queue is the only store        |
| `LogChargePump`, `SendLogBatch`                        | gone — the relay is one message per entry |
| `LogUploadScheduler.notify()`, size and error triggers | gone — the interval is the only trigger   |

The `LOG_BUFFER` tag outlived the buffer it was named for; it is now the tag for entries _about_ the
log pipeline itself. `apps/web`'s `nativeUploadSource.ts` and `logQueueView.ts` keep the older
vocabulary in their filenames.

## Notes for implementers and tests

- `LogUploadScheduler` takes `schedule`/`cancel` overrides. Use them, or a suite waits in real time.
- A test that asserts an exact drop count needs its own file. `logHub` is a module singleton, and a suite sharing a process with a service another file left subscribed will see the same entry evicted by two queues.
- `nextBatch` returning the same entries twice is correct, not a bug to fix. Any test that treats `peek` as destructive is asserting the opposite of principle 5.
- Both hosts build their queue through `createLogUploadQueue`, so the level policy, the drop order and the id de-duplication are shared rather than reimplemented. A change here lands on both.

## Further reading

- [docs/pipeline/](../pipeline/README.md) — the listener that fills the queue, and why the uploader is not one
- [docs/redaction/](../redaction/README.md) — what `send` puts on the wire
- [docs/observations/](../observations/README.md) — how the queue's own losses get reported
- [docs/sampling/](../sampling/README.md) — the selector that judges statistics as a batch is drawn
