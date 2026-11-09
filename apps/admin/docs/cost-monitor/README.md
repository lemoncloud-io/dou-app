# cost-monitor

**What each subscription account costs.** One row per AWS account: today's cost by KST hour —
estimated from metrics and calibrated daily to what Cost Explorer billed — yesterday's estimate against
Cost Explorer, the slot pool, and how a user, their workspaces, slots and the account connect. Feature
code: `apps/admin/src/app/features/cost-monitor/`. It replaces a local dashboard that ran only on an
operator's machine against locally started services. The decision record is ADR-0269.

## Design principles

- **Two services, one stage.** The goods service (`cgs-XX`) gives workspaces, slots, the
  per-workspace CloudWatch metrics, and the Cost Explorer amounts it relays from the cost service at
  `GET /workspaces/0/costs`; the relay (`dou-XX`) gives DoU cloud names. Each stage's bases are its own
  keys, `VITE_<STAGE>_GOODS_ENDPOINT` and `VITE_<STAGE>_RELAY_ENDPOINT` (ADR-0268), and every call is an
  app-local signed request. The cost service is not called directly: its API is IAM-authorized and this
  console's signing role does not include it, while the goods service already calls it server to
  server.
- **An estimate is seven metrics × the Seoul list price × (1 − discount).** The same formula as the
  cost service's own estimator. The discount (0 by default) and the Lambda adjustment (1, 512 MB
  assumed) are inputs on screen. The account's real discount is not kept in source: with calibration on,
  Cost Explorer carries it.
- **Today is a KST day; yesterday is a UTC day.** Cost Explorer bills UTC days, so the comparison
  takes KST 09:00 the day before to 09:00.
- **Hourly cost is calibrated once a day by Cost Explorer.** Cost Explorer has no hours and fills its
  latest day late (one day collected the next afternoon was about 17% short), so the calibration day
  is the UTC day before yesterday: each account's estimate is multiplied by Cost Explorer ÷ estimate of
  that day, its own ratio when it has one, else the ratio of all accounts together. The hourly shape and
  the per-metric split stay the metrics'. A switch turns it off to see the raw estimate.
- **Cost Explorer is collected every night by the cost service, not by this screen** (22:40 KST, the
  last two UTC days, so the late-filled one is collected again). The screen has no collect button:
  nothing here writes or pays Cost Explorer. Until a day has been collected, calibration says "no
  actuals" and the rows stay raw estimates.
- **Spending money is said out loud.** Every metrics call makes the goods service call
  `GetMetricData` (billed per metric), so the header counts them. A finished KST day is fetched once and
  kept for the life of the tab; a day still filling refetches every hour, and Refresh refetches only
  those. Metrics calls run five at a time (`createLimiter`), and a call whose query was dropped before
  its turn (another date or stage) is not sent.
- **A failure narrows the screen, it does not blank it.** Without DoU names the table still loads;
  without actuals the estimates still show; an account whose stored credentials are no longer accepted
  shows "error" in its own row, and a failed hourly refetch keeps the hours it already had.
- **The rules are pure functions in `lib/`** — the estimate and day arithmetic (`cost`), the
  account rows, calibration and card sums (`relations`, `costRows`). The reads are react-query
  queries in `api/costQuery.ts`, one per workspace per KST day; the page holds only the picks.
- **English only**, like the deploy screen; the nav label is translated.

## Scope

**In:** workspaces with an account, every slot and the pool status; seven metrics per account for
three KST days (today and the two the comparisons cover); Cost Explorer actuals for the two UTC days
before today; DoU cloud names by account; filters by kind (all / DoU) and slot state; a detail panel
with relations, an hourly chart (cost stacked by metric, or one metric's usage) and the per-metric rate
table.

**Out:** budgets and alerts, billing a DoU owner, collecting Cost Explorer, and anything that writes.
