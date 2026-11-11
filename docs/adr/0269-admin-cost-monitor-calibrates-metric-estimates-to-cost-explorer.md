# ADR-0269: The admin cost monitor estimates from metrics and calibrates daily to Cost Explorer

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/admin-v2-cost-monitor`
> · Scope: `apps/admin/src/app/features/cost-monitor/`

## Context

Operators need to see what each subscription cloud's AWS account costs, close to now. Two sources
exist and neither is enough on its own:

- **CloudWatch usage metrics**, which the goods service already relays per workspace
  (`POST /workspaces/{id}/metrics`). They have hours and arrive within the hour, but they are usage,
  not money: turning them into dollars needs list prices, a discount and a Lambda memory assumption,
  and seven metrics leave out what they do not measure (S3, log storage).
- **Cost Explorer**, which the cost service collects. It is what AWS actually billed, but it
  has whole UTC days only, and it fills the latest day late — one day collected the next afternoon was
  about 17% short of its final amount.

Until now the view existed only as a dashboard on one operator's machine, against locally started
goods and cost services and a script reading the relay's index.

The cost service's API is IAM-authorized, and the console's signing role is not allowed to invoke it;
the goods service and the relay are.

## Decision

1. **Hours come from the metrics, the level from Cost Explorer.** Each account's estimate is
   multiplied by `Cost Explorer ÷ estimate` of the calibration day; an account with no amount for that
   day takes the ratio of every account that has one. The hourly shape and the per-metric split stay
   the metrics'. A switch shows the raw estimate.
2. **The calibration day is the UTC day before yesterday**, the latest one Cost Explorer has finished.
   Yesterday is still shown against its estimate, flagged as not final.
3. **Cost Explorer is read through the goods service** (`GET /workspaces/0/costs`, which relays to the
   cost service server to server), not by calling the cost service.
4. **The screen writes nothing.** Collecting Cost Explorer is the cost service's nightly job
   (`sync-ce-daily`, 22:40 KST, the last two UTC days); the screen has no collect button. Its one
   billed action is the metrics calls, which the header counts.

## Alternatives

- **Show the raw estimate only.** Simplest, but the discount and the Lambda adjustment are guesses
  and the seven metrics miss whole cost categories; the number drifts with no way to tell by how much.
- **Show Cost Explorer only.** Exact, but a day late at best and with no hours — it cannot answer
  "what is this account spending right now".
- **Calibrate against yesterday.** One day fresher, but that day is still filling; calibrating to a
  short day would push every estimate down by the shortfall.
- **Call the cost service directly.** Needs the console's signing role widened to another API, an
  infrastructure change owned elsewhere; the goods service already makes server-to-server calls to it.
- **Keep a collect button on screen.** It was there in the local dashboard. Collecting costs money
  per call and the cost service's collect endpoint checks no admin role; with a nightly job it adds
  only a way to pay twice.

## Consequences

- **Today's figure is only as good as the calibration day's ratio.** A day with unusual usage mix
  carries its ratio into the next. Accounts with a tiny estimate can get a wild ratio; there is no
  clamp yet.
- **Nothing to calibrate until the first nightly collect.** Until then rows show the raw estimate and
  the screen says so.
- **Three KST days of metrics per account per load** (today and the two the comparisons cover).
  Finished days are kept by the query client for the life of the tab, so an hourly refresh and the
  Refresh button pay for the open day only.
- **The cost view depends on two backend pieces**: the cost service's nightly collect and the goods
  service's relay of its amounts.
