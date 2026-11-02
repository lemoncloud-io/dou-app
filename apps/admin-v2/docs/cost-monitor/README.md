# cost-monitor

**What each subscription account costs.** One row per AWS account: today's cost by KST hour —
estimated from metrics and calibrated daily to what Cost Explorer billed — yesterday's estimate against
Cost Explorer, the slot pool, and how a user, their
workspaces, slots and the account connect. Feature code:
`apps/admin-v2/src/app/features/cost-monitor/`. It replaces a local dashboard that ran only on an
operator's machine against locally started goods and cost services.

## Design principles

- **Two services, one stage.** The goods service (`cgs-XX`) gives workspaces, slots, the
  per-workspace CloudWatch metrics, and the Cost Explorer amounts it relays from the cost service
  (bespin) at `GET /workspaces/0/costs`; the relay (`dou-XX`) gives DoU cloud names. Each stage's
  bases are its own keys, `VITE_<STAGE>_GOODS_ENDPOINT` and `VITE_<STAGE>_RELAY_ENDPOINT` (ADR-0268),
  and every call is an app-local signed request. Bespin is not called directly: its API is
  IAM-authorized and this console's signing role does not include it, while goods already calls
  bespin server to server.
- **An estimate is seven metrics × the Seoul list price × (1 − discount).** The same formula as the
  cost service's own estimator. The discount (8.4%, September's measured Cost Explorer discount) and
  the Lambda adjustment (1, 512 MB assumed) are inputs on screen, not constants to trust.
- **Today is a KST day; yesterday is a UTC day.** Cost Explorer bills UTC days, so the comparison
  takes KST 09:00 the day before to 09:00.
- **Hourly cost is calibrated once a day by Cost Explorer.** Cost Explorer has no hours and fills its
  latest day late (one day collected the next afternoon was about 17% short), so the calibration day
  is the UTC day before yesterday: each account's estimate is multiplied by Cost Explorer ÷ estimate of
  that day, its own ratio when it has one, else the ratio of all accounts together. The hourly shape and
  the per-metric split stay the metrics'. A switch turns it off to see the raw estimate. Covering that
  day is why each row fetches three KST days of metrics; finished days are cached in the tab, so an
  hourly reload pays for today only.
- **Cost Explorer is collected every night by the cost service, not by this screen** (`sync-ce-daily`,
  22:40 KST, the last two UTC days so the late-filled one is collected again). It saves to DynamoDB and
  its stream syncs each day into the cost service's OpenSearch index, which is what the relay reads.
  The screen has no collect button: nothing here writes or pays Cost Explorer.
- **Spending money is said out loud.** Every metrics call makes the goods service call
  `GetMetricData` (billed per metric), so the header counts them, finished KST days are cached in the
  tab, and a newer load drops the calls an older one has not sent. The screen flags actuals under two
  days old.
- **A failure narrows the screen, it does not blank it.** Without DoU names the table still loads;
  without actuals the estimates still show; a failed account shows "error" in its own row.
- **The rules are pure functions in `lib/`** — the estimate and day arithmetic (`cost`), the
  account rows (`relations`, `costRows`). The load and its hourly refresh are `hooks/use-cost-monitor.ts`.
- **English only**, like the deploy screen; the nav label is translated.

## Scope

**In:** workspaces with an account, every slot and the pool status; seven metrics per account for two
KST days; Cost Explorer actuals for the two UTC days before today; DoU cloud names by account;
filters by kind (all / DoU) and slot state; a detail panel with relations, an hourly chart (cost
stacked by metric, or one metric's usage) and the per-metric rate table.

**Out:** budgets and alerts, billing a DoU owner, collecting Cost Explorer, and anything that writes.

## Known gaps (2026-11-02)

- **Four accounts fail their metrics** with "The security token included in the request is invalid":
  their stored credentials are no longer accepted. They are the same accounts the 2026-10-30 slot
  adoption skipped or held, and the row shows "error" without blocking the rest.
- **Actuals need two deploys.** The `sync-ce-daily` cron (bespin-opsnow-api) and the
  `GET /workspaces/0/costs` relay (codes-goods-api). Until both are live and a night has passed,
  calibration shows "no actuals" and the rows stay raw estimates.
- **Checked on a logged-in session (2026-11-02, Production):** workspaces, slots, metrics, DoU names
  and the cost relay load. Cost Explorer has no data until the first nightly collect, so actuals read
  "not collected".
