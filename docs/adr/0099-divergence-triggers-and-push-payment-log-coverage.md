# ADR-0099: Establish divergence-check triggers — the client judges value mismatches and leaves them as `warn`

> Status: Accepted · Decided: 2026-09-07
>
> Related: [ADR-0097](./0097-unified-logging-core-and-report-traceability.md) (unified logging core) · [ADR-0066](./0066-log-pipeline-collector-listener-split.md) (collector/listener split — canonical pipeline structure) · [ADR-0063](./0063-log-upload-source-port-and-native-charge-queue.md) (upload source port) · [ADR-0071](./0071-performance-budget-and-metric-events-over-the-log-pipeline.md) (performance metrics — **the lane this ADR chose not to use**) · [ADR-0048](./0048-unread-count-derivation-contract.md) (unread derivation contract — the reference value for comparison) · [ADR-0056](./0056-place-cloud-unread-dot-from-cache-and-push.md) (badge and push marks)
>
> **This document is not the canonical trigger catalog.** Where and at what level/tag things get
> logged is owned by the knowledge vault's
> `projects/@lemoncloud-io/dou-app/log-collection/triggers.md`; this ADR records **the decision to
> add a new section (divergence checks) to that table** and the reasoning for it. The
> implementation narrative lives in
> [`libs/logger/docs/architecture.md`](../../libs/logger/README.md) (Live). (Note: this
> path has since moved — see [libs/logger's documents table](../../libs/logger/README.md).)

## Context

This started from a list of 15 field issues (2026-08-03 to 09-07). Picking out the ones logging
could answer revealed a common thread — **they are not failures, they are mismatches.**

- The app icon badge and the in-app unread count disagree (#1)
- Leaving a room, yet the list still shows it as unread (#11)
- A member who left still shows up in the channel settings (#2)
- A cloud was renamed, but one screen keeps showing the old name (#14)

None of these throw an exception or fail a request. Two values simply disagree. But the existing
trigger catalog is **failure-oriented** — it's designed to record "what failed," so it has no hook
for a mismatch where nothing failed. Adding more triggers per the catalog as it stands would never
catch this class of issue.

Facts from the investigation — the basis for this decision.

1. **The badge has three writers and zero transition logs.** Web derives a total (active cloud +
   other clouds) → the native icon → a native base store → later background pushes increment from
   that base. On top of that, web's write is **fire-and-forget**, so web doesn't even know whether
   the value it pushed took effect. The read path (`FetchBadgeCount`) has a bridge type and **the
   native handler is already implemented, but web has no call site** — though only on iOS does that
   query actually answer with the real icon value (§5).
2. **Android's background/killed-state push receipt and badge increment are `debug`.** `debug`
   leaves no trace anywhere — console, bridge, or storage — in release builds. In production, the
   decisive moment for #1 has zero footprint.
3. **Web's only push-receipt log lives inside a debug-screen hook.** It only runs while that screen
   is open. Its tag is also `PUSH`, mismatched against the catalog (`PUSH_EVENT`), and **it logs
   the push title verbatim** — a violation of Prohibited Rule 6.
4. **Payments are almost fully covered on the web side, with three holes in the native service
   layer.** Web already has pre-rejection, start, timeout, receipt validation, and finish-failure
   logging. The native IAP service layer — which the catalog explicitly says belongs at the
   **service layer, not the handler** — has 3 log lines, but **initialization, purchase failure,
   and finish failure** are empty, and initialization and finish don't even have a try/catch.
   #13 (payment failure after Google sign-in on iOS) is most likely already answered by the existing
   `IAP warn: purchase refused before store {reason:'social-link-missing'}` — it's not that the log
   doesn't exist, it's that **there's no way to find that log.**
5. **The query axes are narrow.** Admin filters server-side only by `stereo`, date, `level`, and
   `runId`. `uid`, `tag`, and message search are client-side filters within the fetched page
   (default 100 entries), and `data` is a 2000-character string cap, so numeric-axis server queries
   don't work. Every QA issue is "this specific user at this specific moment," and there is no axis
   to narrow to that.
6. **The `PERF` lane can't be used for incident diagnosis.** With **10% session sampling** based on
   a `runId` hash, the reported session has a 1-in-10 chance of even being in the sample. Metrics
   are for distributions, not incidents.
7. **A cold-start push tap splits receipt and entry across different `runId`s.** When the app is
   dead, a push's receipt happens natively, and the room entry after the tap is a new run. `runId`
   joins alone break the chain.
8. **The code where mismatches happen has no logging.** The channel change/leave mutation, the join
   (read cursor) mutation, and the unread-derivation hook all have zero log lines — even the
   catalog-specified "leave failure = error CHANNEL" isn't implemented.

## Decision

### 1. Establish divergence checking as a new trigger class

Wherever two sources are supposed to agree, **the client compares them directly and only records
when they diverge.** Nothing is recorded when the values match.

The level is `warn`. This is not a functional failure, it's an abnormal-but-proceeding state, which
fits the catalog's level criteria as-is, and **more importantly, `level` is the only meaningful axis
the server can filter on** (Context 5). Moving the judgment to the client is how the narrow query
axis gets sidestepped — "upload every value and compare them later" only works if the server can
filter by value, which it cannot.

To avoid mixing with ordinary `warn`s, a mismatch entry has a dedicated key in `data` for the
comparison result. No mixing numbers into message sentences (same reasoning as ADR-0071 Principle 2) — both values and the delta each need their own key, so analysis is `JSON.parse`, not regex.

There are four comparison pairs in this round.

| Pair         | Left side                                    | Right side                                           | Target issue |
| ------------ | -------------------------------------------- | ---------------------------------------------------- | ------------ |
| Badge        | Web-derived total (active + other clouds)    | The icon value native is holding (**iOS only**)      | #1, #7       |
| Unread       | The count rendered in the channel list       | Recomputed from the read cursor settled at room exit | #11          |
| Members      | The member list rendered in channel settings | Actual participants as resolved from join records    | #2           |
| Display name | The cloud name in the local name cache       | The same cloud name as answered by the relay catalog | #14          |

**The check runs on foreground return and on value change.** Both are already points with a
re-sync hook attached, and drift that happened in the background surfaces on return.
**It does not run on every render or polling tick** — for the same reason as Prohibited Rule 2 —
since a single chatty room could produce dozens of entries and push out the unsent-queue budget.

> **Correction made during implementation (2026-09-07):** "on value change" didn't hold for every
> pair. Since the badge write is fire-and-forget and the icon is designed to lag, comparing right
> when the value changes would flag **every normal read as a mismatch**. So the badge is checked
> against "the last pushed value" at **the app run's first push and on foreground return**. Unread
> is checked once per list mount; members are checked once when leaving the screen (a snapshot
> mid-hydration produces a false positive). The principle — not continuous, not per-render — holds.
> The reasoning for each timing lives in
> [divergence checks](../../libs/logger/docs/observations/README.md) §Implementation detail. (Note:
> this path has since moved — see [libs/logger's documents table](../../libs/logger/README.md).)

### 2. Judge only, do not correct

Finding a mismatch does not push a corrected value back. This ADR is diagnostic only. Adding
correction alongside it would make the symptom disappear while **hiding the cause** — silently
patched over, the metrics look fine while nobody knows where it diverged. Correction is a separate
track, once the root cause is identified.

### 3. The push correlation key is the FCM `messageId`

One push is referred to by the same key at four points — native receipt, tap, deep-link routing,
and the web's room entry. The chain holds even through the cold-start path where `runId` splits
(Context 7), and repeat-push detection can use the same key too. `messageId` is not personal data,
so it doesn't widen the redaction boundary. **Push title/body still never get logged**
(Prohibited Rule 6) — this also sweeps up the existing violation (Context 3).

### 4. Query axes are requested from the server

Request `uid`/`tag` server-side filters from the backend. The channel is the vault lane's
`client-upload-spec.md` reply — following the existing convention where the server writes the
concrete API shape and the client only conveys requirements. Since §1's `warn` judgment already
narrows things down before this ships, **this track does not wait on the server deploy.**

### 5. Split into two lanes

| Lane                     | Content                                                                                                                                                                      | Deploy constraint             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Web-only                 | iOS badge check, unread, members, display-name check, promoting the push-mark drain, payment gaps, channel mutations, socket reconnect subscription                          | None — ships once web deploys |
| Waiting on an app deploy | Android badge check (`BadgeSync.getBase` + new `FetchBadgeBase`), promoting background push-receipt level, native IAP service layer, native half of the push correlation key | Valid only after app deploy   |

**The badge check only stands on web alone for iOS** (corrected 2026-09-07 while writing the spec).
iOS's `FetchBadgeCount` returns the real icon value, so shipping web alone is enough. On Android,
notifee's badge API is a hard no-op on non-iOS, so that query **always answers 0**, and there's no
bridge to read the native counter that actually holds the real value — checking against it as-is
would flag every Android device as a permanent mismatch. So Android moves to the app-deploy lane
along with adding the native getter. (The same investigation surfaced this no-op as a candidate
cause for #1's Android side, but fixing that is out of this track.)

### 6. Update the canonical catalog and clean up existing debt along the way

Add a divergence-check section to vault's `triggers.md`, and reflect the push/payment
enhancements. On the way, fix existing mismatches too — `CLOUD` vs `APP` in cloud switch/manage,
and `PUSH` vs `PUSH_EVENT` in web push receipt. To honor the catalog rule "fix the table before the
code," the table is fixed first and the implementation follows.

### Scope

**In** — the 7 target issues (#1 badge, #2 member sync, #7 notification, #10 push entry, #11
lingering unread, #13 iOS payment, #14 display name), the push/payment catalog gaps, socket
reconnect/give-up subscription, channel-leave/member-sync triggers, and the vault catalog update.

**Out**

- **Comparing cache values against server values.** #14 is handled without a server round trip — it
  is caught with a **client-side, two-reader comparison.** (The interview stage assumed the two
  screens read the same value differently, but the actual structure confirmed while writing the
  spec is different: MY's two screens share one relay-catalog query, so they can't diverge from
  each other; the real second source is the **local name cache** that the home header prioritizes
  over the catalog. The comparison pair was adjusted accordingly, and the conclusion that no server
  round trip is needed still stands.)
- **Observing unsent-queue loss rates.** More triggers mean more drops, and right now there's no
  way to know whether evidence was thrown away — real, but a separate task (already noted as a
  follow-up in ADR-0071 §Out of scope).
- **Issue #15 (missing contact name)**, **automatic correction**, **new `PERF` metrics**,
  **server-side implementation/dashboards**.
- **Issues #3, #5, #6.** These are fix/feature tracks, not logging tracks, and each has its own
  decision record.

## Alternatives

1. **Only add more value snapshots, judge offline.** Log the badge, cursor, and counts as `info`
   and compare them offline by script. Rejected — the server can't filter by value, so every
   incident requires someone to download and compare by hand, and that cost is the cost of "nobody
   looks at it." A one-line client comparison lets `level` alone find it.
2. **Server filter expansion without client-side judgment.** Opening `uid`/`tag` narrows to a user,
   but after narrowing, someone still has to eyeball the two values. Judgment and querying are
   complements, not substitutes, so §1 and §4 are both done.
3. **Treat issue #10 as a `PERF` metric.** Add the push-tap-to-room-display span as a 6th budget.
   Rejected — with 10% session sampling, there's a 90% chance the reported session isn't in the
   sample. Metrics answer "did things slow down overall," and this need is "what happened to this
   person at this moment."
4. **Auto-correct on finding a mismatch.** The user's symptom disappears immediately, but the cause
   gets hidden (§2).
5. **`runId` plus timestamp correlation is enough.** Works in the foreground, but breaks at cold
   start — the core situation in issue #10 — where receipt and entry land in different runs
   (Context 7).
6. **Keep push receipt at `debug`.** Saves volume, but nothing survives in release. The catalog
   already specifies `info`, so the code is already out of step with the table.
7. **Run checks continuously (every render/poll).** Highest resolution, but burns through the
   unsent queue's count/byte budget and triggers eviction, and eviction discards the oldest first —
   **exactly the incident's cause gets dropped first.**

## Consequences

**What is gained**

- Mismatch-class issues become queryable with a single `level=warn` filter — starting today, with
  no server change.
- The badge becomes a **readable value** for the first time (iOS first, Android in the app lane).
  The one-way, fire-and-forget-only write path closes.
- Background push receipt and badge increment survive in release builds — half of #1 becomes
  visible for the first time.
- A single push can be traced end-to-end by `messageId`, so the #10/#12 class leaves a chain if it
  recurs.
- Socket reconnect/give-up subscription opens up "why did it disconnect" — a signal #7, #10, and
  #11 all depend on.

**What is accepted**

- **Entry volume grows.** Since checks only leave a record on mismatch, the cost is near zero in
  the normal case, but on a genuinely diverged device, `warn` can repeat. Tying the timing to
  return/value-change is the cap on that.
- **`warn` now carries two meanings** — "abnormal but proceeded" and "values diverged." They look
  mixed together in admin, so they are distinguished by a dedicated key in `data`, and the catalog
  spells this out as its own section.
- **A risk that the check code itself triggers logging.** Calling `logger` from within a listener
  is immediate re-entrancy, and this recursion has actually been reproduced on the transport path
  (Prohibited Rules 3, 4). Checks run only at the **screen/hook layer**, never inside a listener or
  the transport path.
- **Half of the app-deploy lane remains outstanding.** Until the native lane goes live, #1's
  background half and #13's store-failure cause stay invisible. The split assumes the web lane
  ships first on its own.
- **The `uid`/`tag` filter waits on a server deploy.** Until then, narrowing to a user is still a
  client-side search within a page.
- **The catalog and code pass through a brief mismatch.** Because the table is fixed first, until
  the implementation catches up, the table says "this is how it will be recorded" while the code
  isn't there yet. Consistent with the existing principle that the catalog is a contract, not a
  status table.
