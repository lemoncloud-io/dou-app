# ADR-0063: Split the log upload source into a port, and make the app queue the single collection point in hybrid

> Status: Accepted · Decided: 2026-08-21
> Related: [ADR-0047](./0047-unified-logging-core-and-report-traceability.md) (unified logging core — §4 snapshot semantics, `LogSource`
> principle; periodic upload was out of scope) · [ADR-0050](./0050-redact-report-breadcrumbs.md) (breadcrumb redact)

## Context

ADR-0047 **explicitly excluded the periodic log upload pipeline from scope** ("a follow-up track. Needs backend
alignment"). That follow-up track has since been implemented — the `POST /hello/report-bulk` route is live — and its
design of record has lived in a vault lane outside this repo the whole time. This ADR brings the **client structure
decision** from that track into the repo.

The 2026-08-21 audit confirmed three defects in the webview-to-native log capture path.

### ① The breadcrumb buffer is drained destructively — a violation of ADR-0047 §4

ADR-0047 §4 already settled this:

> **Snapshot semantics** — reading the breadcrumb is always `peek` (non-consuming). `poll` (consuming) is forbidden
> because it erases the history for the next report or the debug UI and creates a consumption race between read
> paths (`poll` belongs to a follow-up track once a draining consumer — such as periodic upload — exists).

0047 anticipated a draining consumer would eventually appear, but it did not assume that consumer would **target the
same buffer as the breadcrumb**. The implementation did exactly that. `drainNative`
(`apps/web/src/app/runtime/logUploader.ts:94`) calls `PollAppLogBuffer` → `logBuffer.poll()`
([useLogBufferHandler.ts:37](../../apps/mobile/src/app/webview/hooks/useLogBufferHandler.ts:37)) on every flush,
sweeping the app buffer by `headroom()`. In steady state, headroom is 450+, which is effectively the whole buffer.

Meanwhile the report breadcrumb reads the same buffer non-destructively via `fetchAppLogBuffer` → `peek()`
(`apps/web/src/app/bridge/nativeLogSource.ts:41`). **One buffer has two consumers, and only one of them is
destructive**, so a crash right after a flush finds the breadcrumb nearly blank.

Worse, the `debug` entries that were swept up are immediately discarded by the filter in `pushAll`
([LogUploadQueue.ts](../../libs/logger/src/upload/LogUploadQueue.ts)) → **gone from the server and gone from the
buffer, pure loss.**

### ② Per-entry relaying plus no level filter pushes out logs that have no second copy

`createNativeForwarder` relayed every entry to `SendLog` regardless of level, and the largest source was the success
logs from `withNetworkLog` — **one `debug` per HTTP request** (`libs/web-core/src/transport/networkLog.ts:98`). Ring
buffer eviction is level-agnostic, oldest-first (`libs/logger/src/core/RingBuffer.ts`).

A comment in `pushAll` names exactly this risk — _"evict native-only entries that have no second copy."_ But that
guard sits in the **upload queue**, while the actual eviction happens one step earlier, in the **app ring buffer**.
Web entries have a copy in the web queue, but native-originated logs (RN global exceptions, FCM, Kotlin
`NativeLogger`) have no copy and are permanently lost.

Per-entry relaying is also a bridge-cost problem. The response round trip has already been removed
([AppBridgeHost.ts:214](../../libs/bridges/src/app/AppBridgeHost.ts:214)), but the upward `postMessage` itself still
fires once per log.

### ③ Destructive poll has a transmission-loss window

`logBufferService.poll()` immediately calls `persistNow()` to erase the entry from MMKV. The rest of the path is: web
memory queue → send → localStorage save in `onSettled`. **If the process dies between the delete and the save, that
entry exists nowhere.** The moment the app dies is exactly when its logs matter most, and that is the moment they
are lost.

The report path has already avoided this problem. `PendingReportQueueService` is a two-step
`FetchPendingReports` (read-only) + `AckPendingReports` (delete after successful send). **Only the log path failed
to follow this idiom.**

### Root cause

A single app ring buffer serves **two jobs with opposite natures.**

|                       | Required properties                                           |
| --------------------- | ------------------------------------------------------------- |
| Crash breadcrumb      | Keep all levels · never erased by reading · `debug` has value |
| Server transmit queue | Erase once sent · never send `debug`                          |

Put both in one container and one of them will always corrupt the other. All three defects trace back to this one
thing.

### Reusable existing assets

- `createLogUploadQueue` · `createLogUploadScheduler` (`libs/logger` — [LogUploadQueue.ts](../../libs/logger/src/upload/LogUploadQueue.ts)) —
  currently used only by `apps/web`. Mobile has never used it in its entire history.
- The `LogSource` port ([types.ts](../../libs/logger/src/core/types.ts)) plus the ADR-0047 §4 principle: **"the
  merged buffer's owner is always the outermost shell."**
- `PendingReportQueueService`'s Fetch/Ack two-step idiom and its MMKV persistence pattern.

## Decision

### 1. Give the app a dedicated transmit queue, and return the ring buffer to breadcrumb-only

The app gets two stores.

- **Ring buffer** (current, 500 entries, all levels) — breadcrumb only. **The upload path never touches it.** The
  ADR-0047 §4 peek-only rule is restored here.
- **Transmit queue** (new, non-debug, MMKV-persisted) — drain only. Reuses `createLogUploadQueue` from
  `libs/logger` as-is.

This makes the app symmetric with the structure the web already has (breadcrumb buffer separated from transmit
queue).

### 2. In hybrid, the web periodically charges the app in batches — per-entry relaying is retired

Web logs accumulate in the web queue, and the web hands them to the app **periodically, in batches** (called
_charge_ below). What used to be one bridge message per log entry becomes one message per period.

The app receives the charge payload and **splits it by level.**

- All levels → ring buffer (web logs keep joining the breadcrumb — the ADR-0047 §4 merged-buffer rule is preserved)
- non-debug → transmit queue

Why `debug` is included in the charge: it's batched so the cost is low, and the ring buffer is no longer drained
destructively, so it stays safely in the breadcrumb. HTTP request flow is the context crash investigations need
most often.

### 3. Specify the upload source as a port — `LogUploadSource`

The uploader must not know where it fetches from. This **extends** the principle ADR-0047 §4 already established
for the breadcrumb to uploading — it is not a new principle.

```ts
interface LogUploadSource {
    fetch(limit: number): Promise<LogEntry[]>; // non-destructive
    ack(ids: string[]): Promise<void>; // delete after successful send
}
```

| Environment           | Source                                | Meaning of `ack`               |
| --------------------- | ------------------------------------- | ------------------------------ |
| Hybrid                | App transmit queue (bridge Fetch/Ack) | Delete from the app MMKV queue |
| Web-only · legacy app | Web queue (local wrapping)            | `remove` from the web queue    |

The `isNative()` branch no longer scatters through the uploader — it collapses into **one injection point at
boot**, the same shape as `setReportLogSource`.

### 4. Poll becomes Fetch/Ack in two steps — destructive poll is retired

`fetch` (non-destructive) → send to server → confirm success → `ack(ids)` → delete from the app queue. This closes
the transmission-loss window from defect ③. If the send fails, the entry stays in app MMKV and is retried on the
next period or the next boot.

Duplicate charges (retries after a lost response) are already blocked by the id dedup that `pushAll` performs in
`createLogUploadQueue`. The server also does an id upsert, so this is a double safety net.

### 5. Split the rhythm into two

The current scheduler calls the queue synchronously (`nextBatch` · `remove` · `sendableSize` —
[LogUploadScheduler.ts](../../libs/logger/src/upload/LogUploadScheduler.ts)). The bridge is asynchronous, so in
hybrid the web cannot synchronously know the app queue's size. So the triggers are split into two rhythms.

| Rhythm                             | Trigger                                                              | Who decides                               |
| ---------------------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| **Charge** (web queue → app queue) | Web queue size · period · background                                 | Web looks at its own queue synchronously  |
| **Upload** (source → server)       | Period · background · app queue size reported by the charge response | The response carries `size` along with it |

Carrying size in the response is exactly what `OnPollAppLogBuffer` and `OnFetchAppLogBuffer` already do. In web-only
mode there is no charge target, so **the two rhythms naturally collapse into one** — no separate branch is needed.

### 6. Queue lifetime — opt-out deletes, logout keeps

- **Opt-out** (declining collection): stop charging and **delete the app queue**. Leaving existing accumulated
  entries to go out would contradict the intent to stop collecting.
- **Logout**: **keep** the queue. Entries carry their own `uid`/`cid` from the moment they were dispatched (ADR-0047
  principle 9), and the server derives its query axes from the entry itself, so a subsequent login on the same
  device does not mix accounts. Switching accounts on one device is ordinary for this app, and deleting the queue
  would lose exactly the entries left behind by a session problem (carrying forward the reasoning of commit
  `90ce5f7e` into the app queue).

### 7. Compatibility — legacy apps take the same path as web-only

Charge and Fetch/Ack are new bridge messages. A legacy app returns `NOT_FOUND`, so the web **checks the runtime
capability** and falls back to sending straight to the web queue. This is not decided by `isNative()` alone — the
web deploys before the app.

This fallback is also **what keeps the web from depending on the app.** If the app path is blocked, halting web logs
too would be a regression from the current state, and that is not acceptable.

### Out of scope

- **Ordering guarantees** — because charging is periodic, web entries land in the app queue later than their actual
  occurrence time. Server storage is nearly unaffected since entries carry their own `timestamp`, but **breadcrumb
  interleaving** is off. Follow-up discussion.
- **Capacity numbers and period values** — the app queue's cap, the charge period, and the MMKV serialization
  budget are set at the spec stage.
- **Server contract** — `POST /hello/report-bulk` is already deployed and unaffected by this decision.
- **Native code compile verification** — this remains unverified from the ADR-0047 track and is not resolved here
  either.

## Alternatives

- **(a) Add only a level filter to the destructive poll** — the minimal change, blocking only the `debug` loss of
  defect ①. ② (eviction) and ③ (transmission loss) remain, and the underlying structure of one buffer serving two
  jobs is unchanged. Rejected.
- **(b) Permanently block web `debug` relaying** — a web-only deploy resolves ② immediately. But it permanently
  gives up web `debug` (= HTTP request flow) from the hybrid breadcrumb. **Adopted only as an emergency measure** —
  see "Interim measure" below.
- **(c) Retire relaying and merge at report time** — cheapest, since bridge log traffic drops to zero. But it
  removes the hybrid merged buffer, conflicting with the ADR-0047 §4 "outermost shell owns it" principle, and native
  crash reports lose web context. Rejected.
- **(d) The app sends straight to the server** — doesn't hold up, since the signed token is issued and held only by
  the web session inside the WebView (the same constraint as ADR-0047 §8).
- **(e) Web sends directly, only native goes through the app queue** — leaves two queues, requiring dedup, ordering,
  and capacity to be managed in two places, and web logs never gain MMKV durability (lost during the debounce window
  if the WebView dies). Rejected.

### Interim measure (already applied)

Alternative (b) was **already applied as an emergency measure** — a `debug` relay gate in
[nativeForwarder.ts](../../libs/bridges/src/logger/nativeForwarder.ts). It's a web-only change, so it stops the
bleeding from ② without waiting for an app deploy. **The gate lifts** once this decision's app deploy goes out
(decision 2 carries `debug` back in batch form).

## Consequences

**What is gained**

- The ADR-0047 §4 peek-only rule is restored — the breadcrumb is no longer destroyed by uploading.
- Native-originated logs with no second copy are separated from the transmit queue, so ring buffer eviction no
  longer means permanent loss.
- The transmission-loss window is closed — logs from the moment the app dies stay in MMKV and are recovered on the
  next boot.
- Bridge log traffic no longer scales with log count (per-entry → per-period).
- Web logs gain MMKV durability — they survive a WebView death.
- Web and native logs merge into one queue and go out as one batch, with capacity and backpressure managed in one
  place.
- The uploader doesn't know its environment — the hybrid/standalone branch collapses to one injection point.

**What is accepted**

- In hybrid, web entries cross the bridge twice (charge upward, poll downward). Both are batched, so it's two calls
  per period — cheaper than the current one call per entry.
- The scheduler moves to an async source basis — the three current synchronous queue calls need fixing, and the
  `beforeFlush: drainNative` workaround is removed.
- Two new pairs of bridge messages are added, and the legacy-app fallback path must be maintained.
- Breadcrumb interleaving order stays off (out of scope).
- The app queue becomes a single collection point, so MMKV write volume and capacity cap design become a new
  concern.

## Related

- The detailed execution plan and server contract responses for this track live outside the repo, in the knowledge
  vault lane (`projects/@lemoncloud-io/dou-app/log-collection`). As of 2026-08-21 that lane is on the vault branch
  `feat/2026-08-13-dou-log-collection-lane` and **has not been merged.** This ADR brings only the client structure
  decision from that lane into the repo.
- Server-side record of truth: vault `projects/@lemoncloud-io/chatic-backend-api/log-batch-ingest`.
  </content>
