# ADR-0203: A cloud deploy run can turn off the goods service's Slack notices, but not its failure reports

> Status: Accepted · Decided: 2026-10-14
> · Scope: `apps/admin-v2/src/app/features/cloud-deployments/`
> · The module doc is [apps/admin-v2 cloud-deployments](../../apps/admin-v2/docs/cloud-deployments/README.md)
> · Related: [ADR-0165 (the cloud deploy console)](./0165-admin-v2-signs-its-own-goods-calls-on-the-relay-host-and-deploys-one-cloud-product-at-a-time.md)

## Context

The goods service posts a Slack notice to its operations channel for every auto-deploy it accepts,
and another when that deploy's result comes back. A run from the cloud deploy console redeploys
every subscription cloud's services after a server update, so one run posts two notices per product
deployed. Nothing could turn them off.

The same notices are the only human-readable record of who deployed what, and a failed deploy's
result notice is the only alert the goods service raises for that failure.

## Decision

**The deploy console gets a `slack` switch, on by default. Off asks the goods service to skip a run's
accepted notices and its successful result notices; failures still report.**

- **Off adds `slack=0` to every call of the run.** On, nothing extra is sent and the goods service
  behaves as before. The goods service also treats a missing `slack` as on, so every other caller of
  auto-deploy is unchanged.
- **Off skips the accepted notice and a successful deploy's result notice, nothing else.** A failed,
  mixed or unreadable result still reports, and so do the goods service's other failure reports. The
  flag travels with that one request; the goods service does not store it on the product.
- **The switch is not locked during a run.** The call list, and each call's flag with it, is fixed
  when the run is confirmed, and the confirmation dialog states the flag before the run starts.

## Alternatives

- **Turn off every notice of the run, failures included.** The quietest option, but a failed deploy
  would then raise nothing anywhere until someone refreshed this screen.
- **Leave the goods service alone and post one summary from the console.** No goods change, but the
  per-product notices keep coming, and the console would need its own way to post.
- **Off by default.** A deploy of a single cloud would then leave no record unless the operator
  remembered to turn it on. On by default keeps today's behavior unless someone chooses otherwise.
- **Skip only the accepted notice.** Half of the noise stays.

## Consequences

- **A quiet run's successes leave no Slack trace.** The result list on this screen and each
  product's last result time are where to look.
- **A goods service that predates the flag ignores it** and sends both notices, which errs on the
  side of more notices.
- **The flag is a request parameter, not a setting.** A deploy started anywhere else notifies as
  before.
