# ADR-0066: Reorganize the log pipeline into "one collector + independent listeners", and revert web→app to per-entry publishing

> Status: Accepted · Decided: 2026-08-24
> Related: [ADR-0063](./0063-log-upload-source-port-and-native-charge-queue.md) (**partial revision** — the source
> port, app queue, and Fetch/Ack are kept; batch charging is retired) · [ADR-0097](./0097-unified-logging-core-and-report-traceability.md)
> (unified logging core) · [ADR-0050](./0050-redact-report-breadcrumbs.md)
> Implementation narrative doc: `libs/logger/docs/architecture.md` — once this ADR is accepted, that document is
> due for another revision.

## Context

The log pipeline has shrunk three times, through ADR-0097 (unified core) → ADR-0063 (source port, app queue, batch
charging) → ring buffer retirement. The code works, but measured against the target structure, **only the name
"pub/sub" survives — in practice the procedure is one lump.**

The target structure is:

- One **collector (hub)** each for app and web, with **independent listeners** on top of it
- `libs/logger` is the single source of truth for shared types and parts, and also owns the **uploader**, which
  swaps sources by platform and sends to the server
- Mobile storage uses the `apps/mobile/src/app/database/mmkv` module

### Confirmed gaps

**① The web has 1 listener.** The single `logHub.subscribe` callback in
`apps/web/src/app/runtime/logging/logUploader.ts:206` performs queue push, storage persist, native charge, and
upload notify in sequence. That's not 3 listeners — it's "1 listener wrapping 4 procedures."

**② `apps/web` doesn't own the web's console listener.** [setupBridgeLogger.ts](../../libs/bridges/src/logger/setupBridgeLogger.ts)
branches on `isNative()` to attach the console/native sinks. The web listener lives in `libs/bridges`.

**③ There are 2 web→native paths.** Per-entry `nativeForwarder` (bridges) and batched `LogChargePump` (web)
coexist, barely held together by a runtime switch called `standDownNativeRelay()`.

**④ The biggest conflict — one listener contains a batcher.**

The web's native sender is a listener, but it sends in batches. `LogListener`'s signature is `(entry) => void` —
**per entry.** So to send batches, the listener has to carry its own buffer, timer, and trigger rules (size, an
`error` floor, a period) on its own — and that's `LogChargePump` (`apps/web/src/app/runtime/logging/LogChargePump.ts`),
185 lines.

The result is that this one listener has a different nature from the other two.

|                  | Console                  | Storage                  | Native sender                                |
| ---------------- | ------------------------ | ------------------------ | -------------------------------------------- |
| State            | None                     | Storage                  | **Buffer + timer + last charge time**        |
| Failure handling | Ends inside the listener | Ends inside the listener | **Leaks async out of the listener**          |
| Entry retention  | Discards immediately     | Passes on and discards   | **Holds for tens of seconds**                |
| Trigger policy   | None                     | None                     | **Has its own (separate from the uploader)** |

The last row is the most expensive one — the rules that decide send rhythm end up in **two places**, the sender and
the uploader, and when they drift apart there's no single place to look.

> **Correction to a prior misdiagnosis in this spot.** This section used to say "the batched `charge` goes straight
> to the queue, so the app's Crashlytics and console listeners never see web logs." **That's not true.**
> useLogBatchHandler.ts:48 calls
> `entries.forEach(ingestLogEntry)` **before** `charge`, so the batched path already publishes to the hub too, and
> all three listeners already see web logs. The `source === 'web'` filter isn't "a device that excludes web" either
> — it's **a guard against double-loading when the hub publish and the charge overlap.** For the same reason,
> `standDownNativeRelay()` was a safe cleanup, not a dangerous patch. This ADR's reason for choosing per-entry is the
> listener-symmetry argument above alone, and the "listeners can't see it" reasoning is **withdrawn.**

**⑤ Mobile storage bypasses the @mmkv module.** [persistence.ts](../../apps/mobile/src/app/services/log/uploadQueue/persistence.ts)
calls `createMMKV()` directly.

**⑥ pub/sub has a hidden listener.** In [runtime.ts:17](../../libs/logger/src/runtime.ts:17), `CoreLogger` holds a
`fallback: ConsoleLogSink`, so when there are 0 subscribers, the console still prints even though nobody subscribed.
This fallback is also why `standDownNativeRelay` unsubscribes nothing and just "sits still" — reducing the
subscriber count would resurrect the console.

**⑦ The monitor shows a blank screen in hybrid.** [LogBufferScreen](../../apps/web/src/app/features/debug/overlay/screens/LogBufferScreen.tsx:8)
looks only at the **web queue** via `getLogQueueView()`. In hybrid, once the web queue empties after a charge, the
backlog the app is holding is invisible.

**⑧ A barrel bypass — already fixed.** Three files under `services/log/native/` were importing
`from 'libs/logger/src'`. `tsc` silently accepts this because of `tsconfig.base.json`'s `baseUrl: "."`, but mobile
jest builds its `moduleNameMapper` only from `compilerOptions.paths`, and so does Metro, so this **blows up at load
time** (`Cannot find module 'libs/logger/src'`). It was fixed in `b9f3163f` to `@chatic/logger`, and after the fix
the three files were byte-identical to the originals, so git recorded it as a pure R100 rename — **a class of
defect that leaves no trace in the diff once fixed**, worth recording as a case study. There are 0 other
`from 'libs/...'` imports left in the repo.

## Decision

### 0. The subscriber roster, and what is not a subscriber

**Right now there are three per platform.** This is today's roster, not a ceiling.

|          | `apps/web`                | `apps/mobile`                   |
| -------- | ------------------------- | ------------------------------- |
| Exporter | Sends per entry to native | Sends to Firebase (Crashlytics) |
| Storer   | Saves to localStorage     | Saves to mmkv                   |
| Printer  | Prints to console         | Prints to console               |

**The subscriber count will grow.** That's the point of this reorganization — when a new consumer of logs shows up
(performance trace collection, a diagnostic sink that filters a specific tag, session replay, a third-party SDK
integration), the goal is to reach a state where **subscribing a fourth listener is enough**, rather than reworking
one of the existing three to fit it in. The reason today's structure can't do that is exactly the lumped-together
callback at [logUploader.ts:206](../../apps/web/src/app/runtime/logging/logUploader.ts:206) — adding a new consumer
means threading a line through someone else's procedure.

So what this section fixes is **not a count but two boundaries.**

**① The uploader and the monitor are not subscribers.** Both only read what the storer left behind — they **never
see entries one by one.** This is exactly where the current implementation is broken: the subscribe callback calls
`scheduler.notify(entry)`, so the uploader is effectively bolted on as a fourth subscriber. §1 removes this.

**② Subscribing is the only way to see a log.** Once the ring buffer is gone, there is no "look it up later" path.
You either read what the storer left, or you subscribe. One or the other.

**③ Batching happens only at the server boundary.** The whole pipeline moves per entry, and **the uploader is the
only thing that batches.**

| Stage                | Unit               | Why                                                                                                          |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `logger.*` → hub     | Per entry          | The moment of publishing is the moment it happened                                                           |
| hub → listener set   | Per entry          | `LogListener`'s signature is per entry                                                                       |
| web → app (bridge)   | Per entry          | It's in-process IPC, so batching gains little. Batching would make the listener carry a batcher (§Context ④) |
| Storer → storage     | Per entry (`push`) | It's on the listener path, so it can't `await`                                                               |
| **Storage → server** | **Batch**          | Network round trips are expensive, and the server has a bulk-ingest endpoint                                 |

This line means we don't have to keep answering "why is the sender per-entry but the uploader batched." The answer
is: **the only boundary worth batching is the single place that crosses out of the process.**

#### What a new subscriber must honor

Growing the roster is allowed, but joining it comes with obligations — all of them lessons this codebase has
already paid for.

- **Never call `logger`.** A listener runs synchronously inside `LogHub.publish`. If a listener logs, it re-enters
  immediately, an infinite recursion. Report failures with `console` only.
- **Never mutate the entry.** [LogHub.publish](../../libs/logger/src/core/LogHub.ts) passes the **same object
  reference** to every listener. If one listener touches `entry`, every listener after it sees the corruption. Treat
  it as read-only.
- **Swallow your own failures.** The hub isolates listeners with `try/catch`, but that's _to protect the other
  listeners_, not you. A throw is silently swallowed, so the listener itself learns nothing.
- **Be fast.** `publish` is a synchronous `forEach`. A slow listener **slows down the code that logged.** Heavy work
  doesn't belong inside a listener — hand it off.
- **Decide your own level policy.** The hub passes every level through unfiltered. Whether to accept `debug` is the
  listener's own call — the console takes it; the storer and Crashlytics drop it.
- **Mask your own data outside the upload path.** Redaction happens inside wire serialization, so a listener that
  reads `entry.data` directly sees the **unmasked original.** That's why the Crashlytics listener calls
  `redactSensitive` itself.
- **Subscribe before the entries you care about.** There is no buffer, so anything published before you subscribe
  is gone forever. Claim your spot in the boot order.

### 1. The uploader runs **only on a schedule**

The size trigger and the immediate `error` trigger based on `notify` are **retired.** The uploader wakes on its own
timer, pulls a batch from storage, sends it, and sleeps again. There's no longer a reason to observe entries as they
occur, so §0's boundary ① holds without any wiring for it.

The only other time a send happens is an explicit **`flushNow()` call.** A host calls it at moments like
`pagehide` or logout — "if we don't send now, there's no other chance." This is a lifecycle signal, not a trigger,
so it doesn't conflict with §0's boundary ①.

#### An empty period never calls the server

Every period does the same thing: **pull from storage → if empty, do nothing and sleep again.** If `peek` returns an
empty array, `send` is never called. The same applies when storage isn't even reachable (a failed bridge round trip
in hybrid) — nothing was ever released, so nothing is lost, and the next period tries again.

Today's [LogUploadScheduler.ts:255](../../libs/logger/src/upload/LogUploadScheduler.ts:255) already does this. It's
written down here because it's **the kind of rule that quietly disappears during a rewrite.** Drop it and an idle
device fires empty requests at the server every period.

`ack` follows the same rule — if there's nothing to release, it's not called.

**However, `peek` itself still crosses the bridge once per period in hybrid.** This can't be removed and shouldn't
be. `size()` is a cached value from the last round trip (§3), so it's tempting to skip the call with "it was 0 last
time, so it's probably 0 now" — but **native-originated logs (RN exceptions, FCM, Kotlin/Swift) can land in the app
store without the web knowing.** Deciding from the cache means those logs never go out. The one round trip of asking
is once per period, and that stays.

**`flushNow()` only has real effect when web-only.** In hybrid, the uploader lives in the web, but knowing about a
background transition is the app's job ([useAppStateHandler](../../apps/mobile/src/app/webview/hooks/useAppStateHandler.ts:12)),
and whether `visibilitychange` fires in the WebView when the app backgrounds varies by platform. More fundamentally,
**by the time the app is dying, the web is already dead or dying.**

This gap is **not** patched with an app→web "flush now" message, because it doesn't need patching — in hybrid, logs
persist in app mmkv, and anything unsent goes out in the next run's first period. Web-only is the same, via
localStorage. `flushNow()` is an optimization ("nice to send it fast"), not a loss-prevention device — storage
persistence is what prevents loss.

The cost of `error` not going out immediately is written in §Consequences.

### 2. Revert the web→app sender to **per-entry** — a listener shaped like a listener

**The only justification is alignment with the listener pattern** (§Context ④). It's not that batching is
functionally lacking — it already publishes to the hub, and that part works fine.

Switching to per-entry turns the sender listener into this:

```ts
const nativeSender: LogListener = entry =>
    adapter.postMessage({
        type: 'SendLog',
        data: { ...toAppLogInfo(entry), message: entry.message },
    });
```

No buffer, no timer, no trigger rules, no async failure path. It satisfies the contract §0 asks of listeners
(stateless, immediate, swallows its own failures, holds no entries) **without effort.** The app publishes what it
receives to the hub via `ingestLogEntry` — **the same thing the current batch handler already does** — and each of
the three listeners picks it up.

`charge()` and the `source === 'web'` filter disappear along with it. Both existed to handle the overlap of "one
message both publishes to the hub and loads the queue"; per-entry has no such overlap — the sender only publishes,
and loading happens when the app's storage listener receives it from the hub.

#### Level policy — the sender does not send `debug`

The previous version said "omit `debug` only in `prodRelease`." **That's not implementable** — the web has no way
to know the app's build variant (the handshake has no such field). Pairing a web prod bundle with an app dev build
is common, so if the web decides from its own bundle mode, that combination breaks, and adding a field to the
handshake isn't the answer either — a legacy app has no such field, which just moves the same problem one level
over.

So **the sender sends `debug` only when the app is actually able to print it.** The basis is
`window.CHATIC_APP_CONSOLE_ENABLED`, which the app injects at WebView load time — the exact same flag the app uses
to decide whether to subscribe the console. It doesn't guess the build variant from a stage string — it directly
answers "is anyone printing this on the other side?" A legacy app never injects it, so it reads as false, and the
default is "don't send."

The reason for not sending in release is unchanged: this is the sender listener's only policy, and it's an instance
of §0's "level policy is the listener's own call." The reasoning is consumer accounting — the app's two persistent
sinks (storage, Crashlytics) both drop `debug`, so putting the largest source (one per request from
`withNetworkLog`) onto the bridge just for the sole consumer — the app console — isn't a trade worth making.

**In exchange, hybrid needs somewhere to see web `debug`.** That's why §5 revives `consoleInNative` as a dev
exception.

#### Relation to ADR-0063 — this means accepting a cost

The previous version said "what 0063 objected to was the unfiltered levels, not per-entry itself." **That reads the
original text charitably.** 0063 wrote, in its own paragraph:

> Per-entry relaying is also a bridge-cost problem. The response round trip has already been removed, but the
> upward `postMessage` itself still fires once per log.

So this decision is not "0063 was wrong" — it's **"we accept the cost 0063 correctly identified, in exchange for
listener symmetry."**

**This isn't a leap into an unknown shape, though.** The actual sequence this repo went through says as much.

| Date                    | Shape                               | Notes                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-08 (`3d29e1f5`) | Per-entry **+ response round trip** | The congestion amplification recorded by [useLogHandler.ts:29](../../apps/mobile/src/app/webview/hooks/useLogHandler.ts:29) happened here. The cause was the per-entry `evaluateJavascript` **response**. |
| 2026-08-14 (`91eae1d8`) | Per-entry **one-way**               | The response round trip was removed. **The exact shape this ADR is returning to.**                                                                                                                        |
| 2026-08-21 (`1c4bcab6`) | Batched                             | Motivated by ADR-0063's ring buffer / destructive poll (①②③); the bridge cost was a secondary point tacked on                                                                                             |

In other words, **per-entry one-way already ran for real for about a week, with no recorded incidents during that
window.** The incident 0063 cited when it flagged per-entry belongs to the response-round-trip era, and its cause
was removed a week before batching was even introduced. Returning to per-entry isn't introducing a new risk — it's
**going back to where things stood 10 days earlier.**

Measurement is still needed, not because of incident history but because **volume is different from back then** —
`e954a18d` planted roughly 30 new log triggers into `apps/web`, so per-second counts are now higher than during the
week per-entry one-way was validated.

What **survives** from 0063: the idea of splitting the source into a port, the app's transmit-pending storage, and
the two-step `Fetch`/`Ack` (delete after a successful send).

### 3. Interface — separate the reading side from the writing side

The point of this section is to remove the platform branch **from the call site into injection.** But one port isn't
enough — in hybrid, the web **only reads, and never stores** (§context). Binding writing into the same interface
would give that implementation methods it can't perform, and the type would lie.

```ts
/** The window through which the uploader and monitor reach storage. Same whether local or across the bridge. */
export interface LogStoreReader {
    /** Up to `limit`, oldest first. Non-destructive — does not remove. */
    peek(limit: number): Promise<LogEntry[]>;
    /**
     * Releases entries that were sent or given up on. The only normal drain path.
     * Takes entries, not ids — because entries without an `id` must be releasable
     * too. If it only took ids, such entries would be queried forever.
     */
    ack(entries: LogEntry[]): Promise<void>;
    /** Discards everything. The monitor's explicit clear. */
    clear(): Promise<void>;
    /** The pending count reported by the last round trip. Display-only, so an approximation is fine. */
    size(): number;
}

/** The side the storer uses to load what it gets from the hub. Always local, always synchronous. */
export interface LogStoreWriter {
    /** Load. Drops the oldest entries once the cap is exceeded. Does not accept `debug`. */
    push(entry: LogEntry): void;
}

/** Whatever actually holds something implements both. */
export interface LogStore extends LogStoreReader, LogStoreWriter {}

/** The adapter that turns a writer into a hub listener. This is the "storer." */
export const toLogListener =
    (writer: LogStoreWriter): LogListener =>
    entry =>
        writer.push(entry);
```

The reason `peek`/`ack`/`clear` return a `Promise` is **because a bridge implementation exists.** The local
implementation finishes synchronously and returns an already-resolved value. `push` and `size`, in contrast, are
synchronous — `push` runs on the listener path inside a hub publish and can't be awaited (§0), and `size` is
display-only, so it caches and answers with the value the last round trip reported.

Two things satisfy the port. **No third class like `BridgeLogStore` is created.**

|                       | What satisfies the port                                      | Notes                     |
| --------------------- | ------------------------------------------------------------ | ------------------------- |
| Web-only              | localStorage-based store                                     | Both reader and writer    |
| App                   | mmkv-based store (via the @mmkv module)                      | Both reader and writer    |
| Hybrid's web uploader | **An object wrapping `appBridge` calls to look like a port** | Reader only. Not a store. |

The last row isn't a class because **it isn't a store.** It holds nothing — it just forwards `peek`/`ack`/`clear`
straight through as bridge calls. A name with `Store` in it would imply it holds something, which would be a lie.

And this role is **already in the code** — [createNativeUploadSource()](../../apps/web/src/app/runtime/logging/nativeUploadSource.ts:98)
already returns an object literal that satisfies `LogUploadSource`. What this reorganization needs isn't a new
object — just **adjusting that literal to match the widened port `LogStoreReader`** (adding `clear`).

| Call           | Bridge message        | Status                                                             |
| -------------- | --------------------- | ------------------------------------------------------------------ |
| `peek(limit)`  | `FetchLogUploadQueue` | Exists (non-destructive, response includes `size`)                 |
| `ack(entries)` | `AckLogUploadQueue`   | Exists (extracts ids to send)                                      |
| `clear()`      | `ClearLogUploadQueue` | Exists                                                             |
| `size()`       | —                     | Answers with the cached `size` from the last `peek`/`ack` response |
| `push(entry)`  | —                     | **Doesn't exist.** It's a reader, so it was never required         |

`size()` needs no round trip because `OnFetchLogUploadQueuePayload`/`OnAckLogUploadQueuePayload` already carry the
updated size. Since §1 removes the size trigger, this value's only consumer is the monitor's display, and a
one-period-stale approximation is enough.

The absence of `push` is the real payoff of splitting reader/writer. The uploader and monitor only hold a reader,
so **there is no way for them to attempt loading**, and §0's boundary ① holds at the type level. Let's not overstate
it though — that's as far as it goes; accidentally attaching the web's storer listener in hybrid is a runtime
condition, so it still compiles. That's the test suite's job.

#### What this shape gives us

- The `isNative()` branch **disappears** from the uploader. The current
  [logUploader.ts](../../apps/web/src/app/runtime/logging/logUploader.ts) asks `useNativeSource()` again at three
  separate spots — `fetch`/`ack`/`pendingSize` — and deciding which reader to inject once at boot removes that
  branch entirely.
- The monitor also looks at just one `LogStoreReader` — "the interface is the same, only the platform behind it
  differs" is realized through this port.
- The uploader only receives a reader, so **it has no ability to load logs at all.** §0's boundary ① is enforced at
  the type level.
- The uploader batches with `peek(limit)` and releases in batches with `ack(entries)` — §0 boundary ③'s "batching
  happens only here" shows up directly in the port's shape. The writer's `push`, by contrast, is per-entry.

```ts
export interface LogUploaderOptions {
    store: LogStoreReader; // the platform decision is already made here
    send(entries: LogEntry[]): Promise<UploadOutcome>;
    isEnabled?(): boolean; // debug-menu on/off
    intervalMs?: number;
    batchSize?: number;
}
```

The existing `LogUploadSource` (`fetch`/`ack`/`pendingSize`) is **promoted and absorbed** into `LogStoreReader`. The
practical change is just that `clear` joins the port (giving the monitor's existing use a proper home), and
`pendingSize`'s `undefined` return goes away.

### 4. The storer has **caps on both web and app**

`push` enforces the cap. Once exceeded, it drops **the oldest first**, and reports the drop **once per event, not
per entry** — the storage problem must never become a cause of filling the storage.

The reason for capping both is different in each case.

- **App (mmkv)** — the only normal drain is `ack`, so if offline or a server outage runs long, this grows
  unboundedly. Without a cap, disk is the only limit.
- **Web (localStorage)** — the whole origin shares 5–10MB. If logs eat all of it, **unrelated features break
  first.** This side needs the cap more urgently than the app does.

The cap needs to be enforced on **both count and bytes.** Count alone lets a handful of large-`data` entries blow the
budget; bytes alone means paying serialization cost on every `push`. The exact numbers are set at the spec stage.

### 5. `apps/web` — 1 collector + 3 listeners

The listeners are **always these three** — only which combination is turned on differs by platform.

| Listener                        | Web-only | Hybrid |
| ------------------------------- | -------- | ------ |
| Sends per entry to native       | OFF      | **ON** |
| Prints to console               | **ON**   | OFF    |
| Saves to storage (localStorage) | **ON**   | OFF    |

In hybrid, the web **stops accumulating anything once it's confirmed the app is serving the store.** With per-entry
handoff there's no batch to hold accumulated storage for, and once confirmed, "the app does the loading" becomes a
single rule. The exception during the pre-confirmation boot window is below. During this time, the web's uploader
is injected the bridge-based `LogStoreReader` (§3), reading the app's store.

`logUploader`'s single callback is dismantled. Of the four things that one callback currently does — queue push,
storage persist, native charge, upload notify — the first two fold into the **storer**, the third becomes the
**per-entry sender**, and the fourth is retired in §1.

The console listener's ownership moves from `libs/bridges` to `apps/web`.

**In dev builds, the web console stays on even in hybrid** — that is, the current `consoleInNative` isn't retired,
it's kept as a dev exception. The previous version put this on the retirement list, but §2 removes `debug` from the
sender, which means **there's nowhere left to see web `debug` in hybrid.** In release it still turns off, so the
intent behind "one console per platform" (saving resources) still holds — what comes back is only the webview
inspector path during development.

**A legacy-app fallback stays.** The first draft decided against one, and that **was wrong** — see the correction
box below for the reasoning.

If the app rejects `FetchLogUploadQueue` with `NOT_FOUND` in hybrid, the web falls back to its own store and sends
directly. And **for the boot window before that answer arrives, hybrid also accumulates locally at first** —
discarding that copy the moment the app is confirmed to be serving the store. Choosing not to accumulate before
confirmation would lose exactly the window that explains the rest of the session.

This weakens §5's "the web stops accumulating anything in hybrid" to **"stops accumulating once confirmed."** The
weakening is intentional, and the cost is one duplicate copy during the boot window.

> **Correction (2026-08-24, after checking against the deployed build).**
> The first draft treated skipping the fallback as an "intentional exception," reasoned as _"`SendLog` is a path
> that has existed since 2026-07-08, so the NOT_FOUND window is narrow."_
> **That reasoning holds only for `SendLog`, and is wrong for `Fetch`/`Ack`/`Clear`** — those three are new messages
> introduced by the ADR-0063 work, and `develop` (the deployed baseline) doesn't have them.
> Checking the actual deployed build confirmed it: the develop app has **no** handlers for
> `FetchLogUploadQueue`/`AckLogUploadQueue`/`ClearLogUploadQueue`, and no app transmit queue exists at all; develop
> web has no standing uploader, so logs only reached the server as report attachments.
> So skipping the fallback wouldn't fail "users on legacy app versions" — it would fail **every hybrid user until
> the app is deployed.** Not an edge case — the default state.

### 6. `apps/mobile` — 1 collector (hub) + 3 listeners

All three are always on. Unlike the web, there's no platform branch.

- **Sends to Firebase (Crashlytics)** — excludes `debug` (unchanged from today)
- **Prints to console** — uses `libs/logger`'s shared `ConsoleLogSink`. Mobile's own `ConsoleLogger` is **deleted.**
- **Saves to mmkv** — excludes `debug`. Keeps loading up to the cap.

`LogUploadQueueService` shrinks to an mmkv-based `LogStore`. `charge()` and the web filter go away, leaving just the
`LogStore` implementation plus mmkv persistence. It's **the app hub's only storage subscriber**, and the uploader
only reads it across the bridge — it never subscribes.

There are three paths by which **storage shrinks**. The main one is the uploader.

- The uploader's `ack` — releases what the server has received (the main path)
- The monitor's `clear` — an explicit wipe from the debug menu
- Cap-exceeded eviction — §4

The **lever that turns uploading off** is controlled from the debug menu (monitor). Turning it off keeps loading
going and only stops sending.

Storage uses the `apps/mobile/src/app/database/mmkv` module. **With one re-entrancy constraint** — see Consequences.

### 7. `libs/logger` — the shared source of truth, and the uploader's owner

- Source of truth for types and contracts (`LogEntry`, `LogLevel`, `LogContext`, `LogListener`, **`LogStore` /
  `LogStoreReader` / `LogStoreWriter`**) and shared parts (hub, `CoreLogger`, redaction, serialization, the
  uploader, `ConsoleLogSink`)
- **Moves the uploader's composition point from `apps/web` to `libs/logger`.** logger becomes the thing that swaps
  sources and sends to the server.
- logger never asks `isNative()` directly. Depending on `libs/bridges` would invert the dependency direction, so
  instead it's **injected `LogStoreReader` and `send`** (§3).
- **Removes `CoreLogger`'s console fallback.** A sink that quietly turns on based on subscriber count isn't
  pub/sub. If the console is needed, subscribe to it explicitly.

The uploader runs **only on the web** (web-only or hybrid, either way). The reason the app doesn't send directly is
in Alternatives.

### 8. Monitor — one interface, only the injected store differs

The monitor reads with `LogStoreReader` (`peek`) and clears (`clear`). Web-only gets the local store injected;
hybrid gets the bridge-based reader — **the same object the uploader receives.** The `clearLogUploadQueue` and
`fetchLogUploadQueue` bridge calls already exist, so there's nothing new to build.

**The monitor is not a subscriber either** (§0 boundary ①). It only sees what the storer left, so what the storer
drops (`debug`) is invisible to the monitor too. In hybrid, the place to see web `debug` is the app console, not the
monitor.

### Retirement list

`LogChargePump` · `SendLogBatch` batch charging · `standDownNativeRelay()` · `CoreLogger`'s console fallback ·
mobile `ConsoleLogger` · `LogUploadQueueService.charge()` · the `source === 'web'` filter ·
**`LogUploadScheduler.notify()` and the size/`error` immediate trigger** · **`LogUploadSource`** (absorbed into
`LogStoreReader`) · **the `useNativeSource()` branch inside the uploader**

**Reversed back from "retire" to "keep"**

- The hybrid dev web console — the `consoleInNative` option itself is gone, and its rule now belongs to
  `apps/web`'s `attachConsoleListener({ isDev })` (§5).
- The legacy-app fallback — see the correction box in §5.

**Also added**: **repetition folding** for the per-entry sender. Within a 1-second window, once an identical
`level|tag|message` combination exceeds 5 occurrences, further ones are only counted, and reported together at the
first occurrence after the window closes, as `(+N identical suppressed)`.

This path becomes the sole always-on path in hybrid, which is why it's needed, and it targets one thing — a
feedback loop where a stalled network produces the same `error` on every timeout, each one uses `postMessage` on the
UI thread, and the resulting contention slows the cache down and produces more warnings. In the ordinary case it
does nothing: anything crossing the bridge at `info` or above is event-like (the largest source, request logs, is
`debug` and never crosses at all), and the same line occurring sparsely is not folded.

**It's a counter table, not a buffer.** It holds no entries, so its listener shape matches the other two (§0
boundary ③). The cost is that **a folded entry is lost, not delayed** — the judgment call is that once past the
threshold, the n-th identical line carries essentially only a count as information, and the count survives.

## Alternatives

**The app sends straight to the server.** Attractive because it could send even without the webview, right after a
crash on the next boot. But `apps/mobile` has **no authenticated backend API client.** The session lives only in
the web (lemon-web-core), so this would require porting a signing path to RN from scratch — far beyond this track's
cost. Not adopted.

**Keep batch charging, and have the app republish the batch to the hub.** A way to save bridge round trips while
still letting all three listeners see everything. Rejected because (a) the web would again need accumulation space
to build the batch, breaking "the web doesn't accumulate in hybrid"; (b) Crashlytics breadcrumbs would lag by the
batch period, leaving the moment right before a crash blank; (c) `LogChargePump`'s trigger rules (size, period,
`error` floor) would remain as-is. Per-entry removes all three at once.

**Turn on web storage even in hybrid, as a safety net for charge failures.** Switching to per-entry removes the
event "a charge failed" entirely, weakening the rationale, and having two stores breaks the single rule "the app
does the loading." Rejected.

**Keep mobile's `ConsoleLogger`.** Early interviews leaned toward "each platform implements its own," but since both
implementations do the same thing, they were unified into the shared `ConsoleLogSink`. Only the **on/off condition**
differs by platform.

**Also remove `libs/logger`'s `ConsoleLogSink` and have each app implement its own.** Most faithful to the goal
phrase "implemented separately," but leaves identical code duplicated twice. Not adopted.

## Consequences

**What is gained**

- There is no path to seeing a log other than subscribing to `logHub`. Both the hidden fallback and the direct-queue
  path disappear.
- With one web→app path, a runtime switch like `standDownNativeRelay` is no longer needed. The double-publish guard
  disappears along with it.
- The app's Crashlytics breadcrumb **receives web logs immediately.** The blind spot equal to the batch delay is
  gone.
- **Adding a fourth consumer becomes work that doesn't touch existing code.** Today it means threading a line
  through a lumped callback, so every new consumer has to relearn the order, failure handling, and level policy of
  the existing procedure. It changes to a state where satisfying §0's contract is enough.
- Since the uploader no longer observes entries, it's fully decoupled from `logHub`. The uploader's tests no longer
  need a hub, and "never call `logger` on the send path" changes from a rule to keep to **a structural fact.**
- Consolidating into one `LogStoreReader` removes the `isNative()` branch from the uploader and monitor. The
  platform decision ends with one injection at boot. Splitting read/write turns "the uploader doesn't load" and
  "hybrid web doesn't load" from comments into types.

**What is accepted**

- **Bridge load goes up.** One upward `postMessage` per entry. ADR-0063 flagged this cost, and that point still
  holds. But the shape being returned to (per-entry **one-way**) ran for real between 2026-08-14 and 2026-08-21 with
  no incidents (§2 table) — the congestion amplification 0063 cited belongs to the earlier **response round-trip**
  era. The one remaining risk is that **volume has grown since then** (roughly 30 new triggers from `e954a18d`), so
  measurement is still needed, but this is not treated as an unknown gamble.
- **On legacy apps, that device's web logs are lost entirely.** A deliberate exception to "the web deploys first."
  The reasoning: the per-entry relay isn't a new message type — it uses the **already-existing `SendLog`** — so the
  window where `NOT_FOUND` occurs is actually very narrow. If this judgment turns out wrong (say, a legacy version
  without a `SendLog` handler is still in active use), logs silently vanish, so **the minimum supported `SendLog`
  version must be measured during implementation.** If that measurement comes back bad, only this decision gets
  reverted.
- **`error` no longer reaches the server immediately.** Since the uploader runs only on schedule (§1), an error can
  take up to one full period to reach the server. The reasoning for accepting this: (a) the crash itself is caught
  separately by Crashlytics, and that path is a listener, so it's immediate; (b) what didn't get sent persists in
  storage and goes out in the next run's first period. `flushNow()` only has real effect web-only and can't be
  relied on in hybrid (§1) — **what prevents loss is storage persistence, not flush**, and it matters not to
  confuse the two in this design.
- **With no size trigger, storage grows for the whole period during a burst.** In a stretch where `info` fires
  dozens of times per second, the only backstop until the next period is the cap (§4). Too low a cap drops old
  entries; too high and storage swells — which is why period and cap must be set together, and why it's a
  measurement item at the spec stage.
- **Entries past the cap vanish silently.** Since eviction is oldest-first, the **front** of a burst (usually the
  logs closest to the cause) gets dropped first. The drop is logged once per event, but that log itself rides the
  same pipeline.
- **Unsent web logs are lost on a webview refresh.** Since the web accumulates nothing in hybrid, there's no copy
  beyond whatever already made it onto the bridge right after publishing. The reasoning is that being per-entry
  keeps the window as narrow as one entry.
- **mmkv re-entrancy risk appears.** [MmkvStorage:27](../../apps/mobile/src/app/database/mmkv/MmkvStorage.ts:27)
  takes an `ILogService` in its constructor and logs storage failures via `logService.error`. If the log storer
  listener uses this as-is, a loop runs: `storage failure → log published → hub → storer listener → storage
failure`. Today's direct `createMMKV()` call happens (intentionally or not) to avoid this loop. **Reuse the @mmkv
  module, but give it an instance that doesn't log on the log path** — failures go to `console` only. This is the
  storage-path version of the same rule as vault catalog §prohibition 4 ("never call `logger` on the send path").
- **The `libs/logger` → `apps/web` direction reverses.** As the uploader moves into logger, the wiring that injects
  the source and `send` grows. Accepted as the cost of having one composition point.
- **Documentation debt.** `libs/logger/docs/architecture.md` went Live in `e1bb4376`, and this ADR invalidates a
  substantial part of its narrative (batch charging, stand-down, batched storage). It must be updated alongside the
  implementation.
- **ADR number congestion.** 0064 and 0065 were claimed by another session's uncommitted worktree, and 0063 has
  already collided once in the past. This document uses 0066.

## Open items

- **Measure the per-entry relay's bridge load.** The shape itself was already validated for a week (§2 table), so
  what needs checking is **the increase in volume** — how many `info`-or-above entries per second under release
  conditions, including the new triggers from `e954a18d`, and whether it competes with cache round trips.
- **Set the upload period and storage cap together.** They aren't independent — a longer period needs a bigger cap,
  and a low cap loses the front of a burst. The concrete count/byte values on both axes are set through measurement
  at the spec stage.
- Measure the minimum supported app version for `SendLog` — the fallback covers apps without `Fetch`/`Ack`, and if
  even `SendLog` is missing from an app version still in active use, that device's app console and Crashlytics
  paths go empty (server transmission is still covered by the web fallback).
- Measure the per-entry relay's bridge load in dev builds too.
- Decide whether the app console listener's gate is `__DEV__` or "not a `prodRelease` build." The two differ — in a
  staging release build, `__DEV__` is false.
- The first call to `LogStoreReader.size()` — before the round trip, the cache is empty and reads as 0. Either show
  it only after the first `peek`, or distinguish an initial `undefined` value, so the monitor's first entry doesn't
  look like an empty screen.
  </content>
