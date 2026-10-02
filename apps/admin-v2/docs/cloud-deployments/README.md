# cloud-deployments

**Where an operator redeploys the subscription clouds after a server update.** Every subscription
cloud runs the three chatic services — `chatic-backend-api`, `chatic-sockets-api` and
`chatic-socials-api` — as one goods service product each, and after an update each of those products
has to be deployed again. This screen lists them, groups them by cloud, says whose cloud each one is
from the relay's own record, and asks the goods service to deploy the picked ones, one call at a
time. Before it existed, the same work needed a goods service
running on an operator's own machine and a pair of local scripts. Feature code:
`apps/admin-v2/src/app/features/cloud-deployments/`. The decision record is ADR-0165.

## Design principles

- **The screen signs its own calls.** The three requests — the goods product list, auto-deploy and
  the relay's cloud list — are app-local signed requests
  (`runtime.boot.webTransport.buildSignedRequest`), the way the log console calls the relay. There
  is no goods gateway in the shared http layers, because this screen is the only thing in the repo
  that talks to the goods service, and a shared route for one caller is all cost. The shared layers
  do read the relay's clouds for admins, but for one owner at a time — the owner is required and
  always sent — so listing every owner's clouds would change a shared gateway for this screen alone.
  What that gives up is the shared layers' credential retry and their network log: a
  lapsed signing credential shows up here as a failed call, not as a silent retry. A failed deploy
  is therefore logged by the screen itself (`logger.error`), so it leaves a trace beyond the results
  list.
- **The goods address is derived, not configured.** The goods service sits on the same host as the
  relay, so its base is `VITE_DOU_ENDPOINT` with the `/dou-<stage>` segment swapped for
  `/cgs-<stage>` — no new env key, nothing to add to every operator's `.env`. The day the goods
  service moves to another host this stops working, and the fix then is an env key of its own.
- **The goods stage and the cloud stage are two different axes.** The goods stage (`cgs-d1`,
  `cgs-v1`) is which goods service is called. The cloud stage (`dev`, `prod`, read from the
  product's `project$.stereo`) is a mark on each subscription cloud. A `dev` subscription cloud
  lives on the production goods service like every other, so deploying it means picking Production
  above and `dev` in the filter.
- **One list per service, and a list that is not that service is refused.** Each list asks for one
  service by `code`. A goods service that cannot filter by `code` ignores the parameter and returns
  every product it has; the screen spots any product of another service and rejects that whole
  list rather than filtering it client-side, because an unfiltered catalog stops at the paging cap
  and whatever lies past it would be missing without a word.
- **Whose cloud it is comes from DoU, but the rows come from the goods service.** The goods service
  only knows its own owner ids — not DoU user ids — and on some products the owner it records is a
  service identity rather than a person. The relay's cloud list knows the subscriber, so each goods
  project is linked to the DoU cloud that carries the same `workspaceId` and shown with that cloud's
  owner (`owner$`), status and AWS account. The link is the `workspaceId` rather than the AWS
  `accountNo` because both sides carry it directly, while on the goods side the account is only a
  copy of the workspace on the product and is missing from some. The rows stay the goods products,
  because they are what gets deployed: a project with no DoU cloud — made in the goods service
  directly — keeps its goods owner, marked as such, and sorts after the DoU-owned ones. The two id
  systems are never merged into one owner. If the relay call fails, the table still loads on goods
  owners with a warning and DoU status reads "unknown" — the screen does not claim a cloud has no
  DoU record when it could not look. The DoU details say whose cloud it is, not what gets deployed.
- **One failed list blocks the table.** Grouping from two lists would mark every cloud as missing a
  service, and a missing service is never deployed — the run would quietly leave that service on
  the old build. So the table waits for all three, and an error names the service that failed.
- **One call at a time, 1.5 seconds apart, with a Stop.** That pace is what the scripts this screen
  replaces used; nothing on the goods service enforces it, since it has neither a deploy lock nor a
  rate limit. A full run is one call per product at that pace, long enough to need a way to stop
  other than closing the tab — so there is a Stop button, and leaving the screen stops the run
  as well. Stopping is cooperative: the signed request builder takes no `AbortSignal`, so the call
  already sent is waited out and what a stop guarantees is that no further call starts. Widening
  the builder for this was not worth it — its narrow surface is deliberate, and since auto-deploy
  answers as soon as a deploy is queued, the most a stop lets through is one more queued deploy.
  Only one run exists at a time; a second confirm while one is going does nothing.
- **Everything that goes out is shown before it goes.** admin-v2 is not deployed; every operator
  runs it locally against whatever their `.env` names, which in practice is production. The header
  badge and the confirmation dialog both name the goods service being called (red for production),
  and the dialog states the cloud and product counts, each service's branch and `force`.
- **The rules are pure functions in `lib/`** — grouping (`cloudGroups`), the call list
  (`deployPlan`), the paced run (`runDeploys`) and the target (`goodsTarget`). The run's lifetime —
  one at a time, stopped by Stop or by leaving the screen — is `hooks/use-deploy-run.ts`, and the
  page holds only the picks. The call list is fixed when the operator confirms; changing a filter
  during the run changes what the table shows, never what is being deployed.
- **Nothing is kept in the URL.** The membership and log consoles put their filters and stage in the
  URL so a refresh or a shared link keeps the view. Those screens read; this one deploys, and a link
  that reopened on production with clouds picked is the wrong thing to make easy. The screen opens
  on the stage the `.env` names, with nothing picked, every time.

## Scope

**In:** the three per-service product lists; the relay's cloud list; one row per subscription cloud,
its columns in the order an operator reads them — owner (name and id, from DoU when the cloud has a
DoU record), cloud (DoU name and id, with the AWS account and goods project id beneath; the goods
project id alone for a cloud DoU does not know), DoU status, cloud stage, and each service's product
id, `status` and `progress$`; sorting by owner name, owner id or DoU cloud id; a cloud stage filter
(All, dev, prod); picking clouds, with a box for every cloud shown; picking services, each with an
optional branch; `force`, on by default; a confirmation dialog; the paced run
with a progress count and Stop; one result line per call and a closing tally (succeeded, failed, not
started); a goods stage picker with a production badge; Refresh.

**Out:** whether auto-deploy checks for an admin itself (the goods service's concern — the screen
relies on the admin login); the subscription email, which the relay returns and the screen does not
read; filtering or holding back deploys by DoU status (it is shown, not acted on); the env sync and
workspace activation that follow a deploy on other paths (the HTTP auto-deploy does neither, and
neither did the scripts); a bulk deploy endpoint; setting up a new cloud or adding a
service to one; deploying admin-v2 itself; polling.

## The calls

`GET <goods>/products/0/list`, once per service, page by page:

| Param    | Value       | Why                                                                     |
| -------- | ----------- | ----------------------------------------------------------------------- |
| `view`   | `admin`     | Every owner's products. Refused with 403 for a caller who is not admin. |
| `detail` | `0`         | The default attaches each product's catalog — about four times the size |
| `code`   | the service | Ignored by a goods service that has no `code` filter yet                |
| `limit`  | `500`       |                                                                         |
| `page`   | from `0`    | Stops on a short page, at `total`, or at the cap                        |

`POST <goods>/products/{id}/auto-deploy`, with `force=1` only when `force` is on and `branch=<value>`
only when that service's branch is filled in, and an empty JSON body `{}`. The goods service reads
no body; the empty one is there for the signature. The signer signs a POST that has no body as if
its body were `{}` while the request goes out empty, so without it the gateway rejects the signature
— and because that 403 carries no CORS headers, the browser shows only a network error. Every signed
POST or PUT needs a body for the same reason.

`GET <relay>/clouds/0/list` on the relay of the same stage (`cgs-v1` → `dou-v1`), page by page:
`view=admin` lists every user's clouds, `valid=0` keeps expired ones (they still have products), and
`limit=100`. That endpoint enforces no admin role on the server — the memberships console documents
the same gap — so the admin login in front of this screen is the only gate on it.

## Behavior notes

- **`async` is never sent.** The goods service reads a present-but-empty `async` as a synchronous
  deploy, which outlives the gateway's 29-second limit. `dryRun` is not sent either.
- **A success is a queued deploy, not a finished one.** A 2xx reply is the product, now `busy`. How
  the deploy went shows later on the product's `status` and `progress$`, and only after Refresh —
  admin's query client never goes stale, so nothing refetches by itself.
- **A `busy` product is refused without `force`**, and the refusal is shown as the goods service
  worded it. With `force` on, a deploy can overlap one still in progress: no lock exists to stop it.
- **A deploy whose queueing failed still answers 2xx** and leaves the product `busy`. Such a product
  can only be deployed again with `force`.
- **The list stops at 2,000 products per service.** Past `page × limit = 2000` the goods service
  quietly clamps the page and returns one it already sent, so the walk stops there and the screen
  warns that products past the cap are missing.
- **A product with no id or no project, or a second product of one service in the same cloud, fits
  no row.**
  It is listed in a warning instead of being dropped, since a product that is not on the table is a
  product that never gets deployed.
- **The owner is DoU's when the cloud has a DoU record, and the goods service's otherwise.** Linked
  clouds show the DoU subscriber (`owner$`); a project with no DoU cloud shows the owner copied onto
  its goods products when they were saved, tagged "goods owner" — a renamed owner can show an old
  name there. A DoU cloud that has no `workspaceId` was never provisioned and links to nothing.
- **Owner name order is the default, and the headers re-sort.** By default rows go by owner name,
  comparing one name per owner so one owner's clouds stay together; Owner, its "id" and Cloud sort by
  owner name, owner id and DoU cloud id, and pressing the active one again flips the direction. Names
  compare in reading order, ignoring case; ids compare as numbers. Under either owner sort, DoU-owned
  clouds come before goods-owned ones in both directions — the two id systems do not compare — and a
  row with nothing to sort by goes last within its source. The run deploys in the order the table
  shows.
- **DoU status is the subscription's state, not the deploy's.** `active`, `suspended` and
  `expired` are told apart by colour; a suspended or expired cloud can still be picked and deployed.
  "not in DoU" means no DoU cloud shares the project's workspace; "unknown" means the relay's list
  could not be loaded. A failed Refresh of that list keeps the last one on screen, and the warning
  says the details are from the last load.
- **A blank branch box sends no branch.** The goods service then deploys the service catalog's own
  branch if it names one, and `develop` otherwise — which is why the box shows `develop` as the
  default and the confirmation reads "catalog branch, else develop". Typing `develop` is not the same
  thing: it overrides a catalog that names another branch.
- **A cloud missing a service is marked `partial`**; the missing service is simply not deployed.
- **A rejected signature looks like a network failure.** The gateway's 403 for a bad signature
  carries no CORS headers, so the browser reports no status at all; the screen says so instead of
  showing a bare "Network Error".
- **The goods stage opens on the relay stage the `.env` names** — `dou-v1` opens on `cgs-v1`,
  anything else on `cgs-d1`. Switching it clears the picks and the last run's results, which belong
  to the goods service they came from. It, the picks and the Deploy button are locked during a run.

## Verifying

```bash
npx nx test admin-v2
npx nx lint admin-v2
npx tsc -b apps/admin-v2/tsconfig.app.json
```

The specs cover, in `lib/`: the goods base, the paired relay base and the starting stage; the page
walk's stops and cap; how a failure reads, naming its service and keeping the original error;
grouping, `partial`, filling an empty owner or stage from another service, the per-owner sort, the
products that fit no row, and spotting another service's product; linking a project to its DoU cloud
by workspace, the goods-owner fallback, and DoU-owned clouds sorting first without the two id
systems merging; each table sort in both directions, names in reading order and ids as numbers; the
call list's stage-filter-and-pick intersection, service choice, branch trimming and the params with
`force` on and off; the run's order, its pause (none before the first call, none after a stop),
carrying on after a failure, starting nothing after a stop, the tally, and the pause a stop cuts
short. The `api/` specs cover the exact goods list and deploy requests, rejecting a mixed list on
its first page, and the relay's cloud list call. The page spec drives the assembled screen: a
confirmed pick becomes those calls on that goods service, a failed call is logged and shown while
the rest go on, a cloud's DoU owner and status show and a cloud DoU lacks is marked, a failed relay
load reads "unknown" rather than "not in DoU" and a failed refresh keeps the last details, a header
press re-sorts and a second one flips it, the goods stage is locked during a run, both Stop and
leaving the screen keep the next call from going out, and one failed list blocks the table and names
its service.

**Manually, once per goods service the `code` filter reaches:** each service's list holds only that
service's products — before the filter is deployed, the screen refuses the lists, which is the check
working. Then deploy one service of one `dev` cloud with the goods stage on Production: the result
line reads `status: busy`, and Refresh shows that product's `progress$` moving. And check that the
clouds DoU knows show their subscriber rather than a service identity, and that the rest read "not in
DoU".
