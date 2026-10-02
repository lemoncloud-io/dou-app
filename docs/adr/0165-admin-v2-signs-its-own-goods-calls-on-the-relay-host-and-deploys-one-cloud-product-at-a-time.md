# ADR-0165: admin-v2 signs its own goods calls on the relay's host, and deploys one cloud product at a time

> Status: Accepted · Decided: 2026-10-02
> · Scope: `apps/admin-v2/src/app/features/cloud-deployments/`
> · The module doc is [apps/admin-v2 cloud-deployments](../../apps/admin-v2/docs/cloud-deployments/README.md)
> · Related: [ADR-0101 (the admin membership console)](./0101-admin-membership-console-and-app-override-parity.md)

## Context

Every subscription cloud runs three chatic services — backend, sockets and socials — and the goods
service holds each of them as a product of that cloud's goods project. After a server update every
one of those products has to be deployed again. Until now that meant running the goods service on an
operator's own machine, listing the products with a local-only patch, and feeding the result to two
scripts that grouped the products per cloud and called auto-deploy for each, 1.5 seconds apart. The
work was tied to one person's environment.

admin-v2 had never called the goods service: no address for it, no request code. The facts the
screen had to be built on:

- **The goods service sits on the relay's host.** `https://<host>/dou-<stage>` is the relay and
  `https://<host>/cgs-<stage>` the goods service, with `d1` for development and `v1` for production.
- **Its admin list needs an admin.** `GET /products/0/list?view=admin` lists every owner's products
  and answers 403 to anyone else. An admin-v2 login was confirmed to pass it.
- **Auto-deploy queues and answers at once** with the product, now `busy`. The outcome lands on the
  product's `status` and `progress$` later. Neither the goods service nor the deploy pipeline behind
  it holds a lock or limits the rate of these calls.
- **admin-v2's signed request builder takes no `AbortSignal`.** The sealed transport exposes
  `setBody`, `setParams` and `execute` only.
- **A signed POST has to carry a body.** The signer signs a POST without one as if its body were
  `{}`, while the request goes out empty, and the gateway rejects the mismatch with a 403 that has no
  CORS headers. That surfaced on the first real auto-deploy, which had been specified with no body.
- **The shared http layers have no goods route**, and nothing else in the repo calls the goods
  service.
- **The goods service does not know who the subscriber is.** Its owner ids are its own, not DoU
  user ids, and on some products the recorded owner is a service identity. The relay's cloud list
  does know, and each of its clouds carries the goods `workspaceId` it was provisioned into — the
  same id the goods products carry. Measured on production, the AWS `accountNo` agrees with that link
  on every linked cloud; the clouds without a link were made in the goods service directly and have
  no DoU record on either relay.

## Decision

**The deploy screen calls the goods service with app-local signed requests, derives its address from
the relay endpoint, says whose cloud each one is from the relay's own record, and works through the
picked products one call at a time with a stop that keeps the next call from starting.**

- **App-local signed requests.** The list and auto-deploy go out through
  `runtime.boot.webTransport.buildSignedRequest` from the feature's own `api/goodsApi.ts`, as the log
  console already does for the relay. No gateway is added to `libs/http`, and no `libs/**` file
  changes. Auto-deploy sends `force` and `branch` as query params and an empty JSON body `{}`, which
  the goods service ignores and the signature needs.
- **The address is derived.** The goods base is the host of `VITE_DOU_ENDPOINT` — the endpoint with
  its `/dou-<stage>` segment removed — followed by `/cgs-<stage>`. No env key is added. The screen
  opens on the stage the relay endpoint names (`dou-v1` → `cgs-v1`, anything else → `cgs-d1`), and
  the operator can switch it. With no relay endpoint configured, nothing is called.
- **One call at a time, 1.5 seconds apart.** The call list is fixed when the operator confirms. A
  failed call is recorded and the run carries on. A Stop button, and leaving the screen, both signal
  the run to stop: the next call does not start, and the one in flight is waited out because it
  cannot be cancelled. Nothing polls afterwards; Refresh re-reads the lists.
- **Whose cloud it is comes from DoU; the rows stay goods products.** The screen also reads the
  relay's cloud list (`GET /clouds/0/list?view=admin&valid=0`, same stage as the goods service) and
  links each goods project to the DoU cloud with the same `workspaceId`. Linked rows show that cloud's
  owner (`owner$`), status and AWS account, and are grouped and sorted by the DoU owner; unlinked rows
  keep the goods owner, marked, after them. The two id systems are never merged. A failed relay call
  leaves every row on its goods owner with a warning, and never blocks a deploy.

## Alternatives

- **A goods gateway in the shared http layers.** That is the route the membership console took
  (ADR-0101), and it brings the layers' credential retry and network log. It was not taken because
  this screen is the goods service's only caller: a gateway, a data source and their tests for one
  screen is cost with nothing shared, and the layers would gain a second service to keep sealed. If
  a second caller appears, that changes.
- **A new env key for the goods endpoint.** The cleanest separation, and the one to switch to if the
  goods service ever leaves the relay's host. Today it would mean a new `.env.example` entry, a new
  row in the env table, and a new line in every operator's own `.env`, all to hold a value that is
  already determined by the relay endpoint.
- **Parallel calls, or a bulk deploy endpoint.** Faster, but the goods service and the pipeline
  behind it have no lock and no rate limit, so nothing would push back if a burst were too much; the
  sequential pace is the one the scripts used without trouble. A bulk endpoint is a goods change and
  outside this work.
- **Widening the transport builder to take an `AbortSignal`.** It would let Stop cancel the call in
  flight. The transport's narrow surface is deliberate, and what a cancelled request saves here is
  small: auto-deploy answers as soon as the deploy is queued, so at most one more deploy goes into
  the queue after a stop.
- **No Stop button.** Leaving the screen would still be a way out, but a full run is one call per
  product, three per cloud, 1.5 seconds apart, and an operator who notices a wrong pick partway
  through should not have to navigate away to end it.
- **Rows from the DoU cloud list.** It would make the subscriber the primary key, but the goods
  projects with no DoU record would vanish from the table — and a project that is not on the table
  is never deployed. The deploy targets have to come from the service that deploys them.
- **Keep the goods owner only.** No second call and no endpoint to lean on, but the owner shown is
  a goods id, and for some clouds a service identity, so an operator could not tell whose cloud it
  is — the point of grouping by owner.
- **Join on the AWS `accountNo`.** It agreed with `workspaceId` on every linked cloud, but on the goods
  side it is only a copy of the workspace onto the product, missing on some of them; the
  `workspaceId` is on both sides directly. `accountNo` is shown, not joined on.
- **Read the relay's clouds through the shared subscription gateway.** The shared http layers already
  have an admin cloud read, but for one owner: the owner is required and always sent, so it cannot
  list every owner's clouds. Widening it would change a shared gateway for this screen alone, so the
  read is app-local like the goods calls and the log console's relay reads.

## Consequences

- **These calls get no credential retry and no network log**, the relay read included. A lapsed
  signing credential fails the call; the operator refreshes the session and runs again. A signature
  the gateway rejects reaches the browser as a status-less network error, because that 403 carries
  no CORS headers — the screen names this case rather than showing a bare network error.
- **The goods address breaks if the goods service moves host.** The swap of `dou-` for `cgs-` is the
  whole of the coupling, in one file (`lib/goodsTarget.ts`), and the replacement is an env key.
- **A stop is not instant.** The call already sent finishes, so its deploy is queued even after Stop.
- **A run is slow by design.** It is one call per product, three per cloud, 1.5 seconds apart.
- **A goods service without the `code` filter cannot be used from here.** Its lists come back
  unfiltered, and the screen refuses them rather than walking the whole catalog.
- **A second thing now stands on the relay's cloud list endpoint**, which checks no admin role on the
  server (the memberships console documents the gap). The admin login in front of the screen is the
  only gate, and the subscription email it returns is not read.
- **Owners come from two systems.** A cloud without a DoU record shows a goods owner whose id means
  nothing in DoU; the screen marks it rather than pretending the two line up, and when the relay
  cannot be read it says the DoU state is unknown rather than absent.
- **A queued deploy is not a finished one.** The screen reports what the goods service accepted;
  whether the deploy succeeded is read off the product after Refresh.
