# ADR-0083: rebuild the admin-v2 log monitoring screen into a tracing console

> Status: Accepted · Decided: 2026-09-10

## Context

`apps/admin-v2`'s Report Logs screen (`features/report-logs`) reads issue reports, batch-uploaded log
entries, and now-retired automatic error reports from a single list via `GET /dou-{stage}/mocks/0/list`.
Putting it to operational use runs into three problems.

**1. Filtering is per page.** The search term and the App filter only operate **within the current page's
100 records**, client-side. With 7.7k records total, finding a specific user's logs is effectively
impossible.

**2. The axes the server can filter on are fixed.** `doGetList` runs query parameters through
`MockTransformer.bodyToModel` → `packSearchParam`, turning them into ES term filters on `MockModel`
fields. The only ones available are the copies of query axes that `saveLogEntry` hoists to the top of the
document.

| Category                | Axes                                                                         |
| ----------------------- | ---------------------------------------------------------------------------- |
| Server can filter       | `uid`, `sid`, `cid`, `runId`, `level`, `type` (stereo), `from`/`to`, `sort`, |
| `limit`/`page`/`offset` |
| Server cannot filter    | `tag`, `route`, `appVersion`, `webVersion`, `os`, `source`, message body     |

The excluded axes exist only inside the `meta` JSON string, with no hoisted copy. There is no full-text
search path either. And `aggr` is pinned to `aggregation: 'stereo'` inside `buildQuery`, so server-side
aggregation on any other axis is unavailable.

**3. There are two timestamps.** `LogEntry.timestamp` (when it occurred) differs from `createdAt` (when
it reached the server). Because uploads are batched, arrival is bunched, but server filtering and sorting
only work on `createdAt`. `bucketReportLogs` currently uses `createdAt`, so the trend graph does not show
the actual distribution of occurrences.

**Constraint**: this work is `apps/admin-v2` frontend only. `chatic-backend-api` is not touched.

**Target scenarios** (all four are in scope):

1. Track down a specific user's incident — narrow by uid and reconstruct that person's logs in time
   order
2. Monitor errors overall — watch what is failing right now
3. Respond to an issue report — take a report and cross-reference that user's logs at that time
4. Check a release regression — compare error distribution across versions

## Decision

Rebuild Report Logs into a **single-screen, three-pane tracing console**.

### 1. Screen layout — three panes plus tracking pins

- **Left**: filter rail
- **Center**: switch between list / aggregate / trend
- **Right**: a **pinned** detail panel — the current overlay `ReportDetailDrawer` is retired. Tracing
  requires looking at the list and the detail at the same time, and back-and-forth is the cost this
  removes.
- **Top**: a summary monitoring strip (per-level counts · spikes) plus **tracking pin chips**

**Tracking pins**: clicking `uid` / `cid` / `runId` in a row or in the detail pane pins it as a context
chip at the top, and **promotes it to a server-side filter**. This is the mechanism that makes scenarios 1
and 3 work. Since a `runId` is one span of an app run, pinning a runId opens that run's chronological
timeline.

The screen is not split into a monitoring dashboard and a separate trace explorer. The path from report →
user → logs must stay unbroken on one screen.

Filter and pin state is reflected in the URL query string (shareable by link). The socket-lab
`?observe=<uid>` linkage is kept.

### 2. Underlying data — narrow the window up front, then auto-page continuously

Since the server cannot filter on tag or version, the client secures a large enough population to work
with.

1. **Narrow on the server first** by period · level · type · pin
2. **Fetch continuously** in `limit=100` pages and accumulate the result (cap at 5,000, with a progress
   indicator)
3. Tag · version · route · message filters and aggregation run over the **entire accumulated
   population**
4. When the cap is reached, prompt the user to **narrow the period** — never silently truncate

`limit=-1` (noLimit) and one large single `limit` are not used. Issue records carry screenshot base64
data in `meta`, and a single response can blow up.

### 3. Freshness — a new-logs banner

The accumulated population does not auto-refresh. In the background, a single short peek at page one
checks for anything new, and if there is, a `N new logs · Load` banner appears at the top only. Clicking
it prepends the new items. The screen does not flip out from under an analyst mid-review.

### 4. Time basis — occurrence time first

- Server query · period filter: `createdAt` (no other option exists)
- Screen sort · timeline · trend graph: `timestamp` first, falling back to `createdAt` when absent
- Rows where the two values diverge significantly get a delay badge
- Sampling at period edges (occurred yesterday, arrived today) is called out explicitly on screen

### 5. Look — unified on ui-kit

Unify on `@chatic/ui-kit` (the shadcn-based library the memberships screen already uses). Report Logs is
currently raw inline Tailwind.

### Out of scope

- Any modification to `chatic-backend-api` — adding query axes (hoisting `tag`/`route`/`appVersion`),
  parameterizing `aggregation`, a full-text search path
- Using server-side aggregation (`aggr`) — pinned to `stereo`, so there is nothing to use it for
- Log retention, deletion, or notification (Slack, etc.) features

## Alternatives

**Also modify the backend** — hoisting `tag`/`appVersion` to the top level and parameterizing
`aggregation` would make scenarios 2 and 4 accurate. Rejected: this track's scope is frontend only, and
hoisting does not apply retroactively to existing records, which brings a re-indexing problem along with
it. Still, using this screen will eventually make this necessary, so it is noted above.

**Keep the current sample (last 1,000 records)** — lighter to implement. Rejected: scenarios 2 and 4 stay
a "feeling" at best. Neither per-tag spikes nor per-version distribution is representative over the last
1,000 records.

**One big limit (2,000–5,000) in a single shot** — short, with no continuous-fetch logic. Rejected: if
issue-report screenshot base64 gets mixed in, a single response could reach hundreds of megabytes and
freeze the screen.

**Split into two screens (dashboard / trace explorer)** — each stays simpler. Rejected: seeing something
on the dashboard and switching screens loses context. Scenario 3 breaks especially badly.

**Always-on auto-refresh (15s polling)** — always current. Rejected: re-fetching the accumulated
population every time scatters scroll position and selection, and hammers the network.

**Unify time on `createdAt`** — matches the server, and period boundaries are exact. Rejected: logs that
arrive in one batch end up at nearly the same timestamp, losing the order events actually happened in.
Order is the whole point of tracing, and this loses it.

## Consequences

**What is gained**

- uid / cid / runId tracing works against the full data set — not a page-scoped search
- Tag · version aggregation reflects "the entire population over that period" (within the cap)
- The screen shows the actual order events happened in
- List ↔ detail back-and-forth is gone
- Filter state is shareable by link

**What is accepted**

- Continuous fetching takes time beyond the initial screen. Progress and the cap prompt disclose this
  honestly.
- Anything beyond the 5,000 cap is invisible. Narrowing the period is the fix, and the screen says so.
- Sampling appears at period edges from the occurrence/arrival basis difference — it can't be eliminated,
  so it's labeled.
- Tag · version filters remain client-side. Without a backend hoist, this is the ceiling.
- Retiring `ReportDetailDrawer` means `ReportDetailDrawer.spec.tsx` (210 lines) needs to be rewritten
  against the new detail panel.
- The banner approach is not "fully real time." Getting new logs costs one click.
