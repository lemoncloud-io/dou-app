# ADR-0082: put an admin membership management console in admin-v2, and align the app's subscription

judgment with the admin override

> Status: Accepted · Decided: 2026-09-10

## Context

Operators have no screen for handling user subscriptions for CS or policy purposes. Right now the only
option is calling the backend directly.

### The backend is already ready

`chatic-backend-api`'s `feature/subscription-admin` has been merged into develop (`250ee59`) and deployed
as `v0.26.811a`. The design and contract of record live in the vault at
`projects/@lemoncloud-io/chatic-backend-api/specs/subscription-admin/` (README, high-levels, SPEC, plans).

| Endpoint                                   | What it does                         | Status                                   |
| ------------------------------------------ | ------------------------------------ | ---------------------------------------- |
| `GET {relay}/memberships/0/list`           | Admin membership list. Filter · page | Available                                |
| `PUT {relay}/memberships/{userId}/admin`   | Admin override. `?auto=1`            | Available                                |
| `GET {relay}/clouds/0/list?view=admin`     | Cloud list + status aggregation      | Available                                |
| `POST {relay}/memberships/{userId}/cancel` | Store-linked cancellation            | **Missing** (Google wiring pending, TBD) |

The admin override is a single axis separate from the receipt. `adminStatus` (the status to pin),
`adminUntil` (override expiry), and `adminProductId` (tier) together express grant, block, and release.
Because it is a single axis there is no priority rule to worry about. The override does not overwrite the
stored value — it only wins at the derivation step.

- **Override active** = `adminStatus` is set, and `adminUntil` is either absent or `adminUntil > now`
- **Grant** = `adminStatus: 'active'`, **block** = `'expired'` or `'canceled'`, **release** = an empty
  string
- **Indefinite** = leaving the expiry time unset. No sentinel value (`-1`, a separate flag) is used
- The server rejects past timestamps and negative values

### What the investigation found (measured 2026-09-10)

**1. The admin override is not reflected in the app screen.** `apps/web`'s `summarizeMembership`
([membershipStatus.ts](../../apps/web/src/app/features/subscription/lib/membershipStatus.ts))
**deliberately** does not use the server's `isValid`. A scheduled cancellation would otherwise zero out
the remaining paid period. Instead it derives status directly from the receipt's `validUntil` and
`status`. So the override only works on the server.

| Admin action                         | Server                    | App screen                                       |
| ------------------------------------ | ------------------------- | ------------------------------------------------ |
| Grant a period (receipt has expired) | Valid · Cloud restored    | "Expired" — because `validUntil` is in the past  |
| Block (receipt still alive)          | Invalid · Cloud suspended | "Active" — because `validUntil` is in the future |
| Grant a tier                         | Ceiling raised            | Unchanged — the app only reads `productId`       |

This gap is not written down in the backend spec. Building the console alone would produce a state where
"the server changed but the user's screen didn't."

**2. The app still reads `isSuper`.** The backend spec's open question Q5 says "once it is confirmed the
app no longer reads `isSuper` from the response, the field will be removed." Checked it — the app does
read it. `membershipStatus.ts:60` returns early on it before any other judgment. The backend already
removed it from its own decision-making at B0 (2026-08-31), so right now only the app is still looking at
the old axis.

**3. A parameter name in the spec is wrong.** The docs describe the per-user Cloud query as
`?view=admin&userId=`. In the code, `userId` is only used in the `view=mine` branch
(`chatic-backend-api`'s `src/modules/clouds/api-clouds.ts:220`). To filter a user in an admin query you
must pass `ownerId`. Also, `valid` defaults to `1`, so expired Clouds are excluded.

**4. `status` and `isValid` can disagree.** The list's `status` is a value derived and stored at the last
write, while `isValid` is derived again at query time. There is no batch job that rolls back an expired
override (spec trap #2), so after a granted period ends, the record can still read `status='active'` with
`isValid=false` until the next re-query.

### Constraints

- **admin-v2 is not deployed anywhere.** Both the dev and prod workflows force-skip it — `admin:build` is
  broken by `libs/socket → web-core` ([deploy-dev.yml:12](../../.github/workflows/deploy-dev.yml)). The
  console runs on each developer's local machine against their own `.env`. Since report-logs reads the
  default `v1` (production), running locally against production data is the current mode of operation.
- The pinned `@lemoncloud/chatic-backend-api` is `0.26.810`, which has no override fields. `0.26.811` on
  npm does.
- Admin judgment is the server's `hasAdminRole()`, and console entry is already blocked by
  `ProtectedRoute`'s `$role.role === 'admin'` gate.

## Decision

### In scope

**1. Build three screens in admin-v2.** Membership list · admin override · per-user Cloud list. Add one
more item to the top nav.

**2. Wiring uses the shared libs three-layer stack.** `libs/http`'s `subscriptions` gateway →
`libs/data`'s `SubscriptionHttpDataSource` → extend `SubscriptionRepository`, and the app gets it via
`runtime.data.useRuntimeRepositories()`. This follows the precedent set by the `users` feature. The
subscription surface already exists across those three layers, and the repository is already wired into
the runtime, so admin-v2 can use it directly.

**3. Types come from bumping the package to `0.26.811`.** `package.json` already says `^0.26.810`, so only
the lockfile needs updating. The diff between 810 and 811 is six added fields plus a `@deprecated`
comment, with no breaking changes (verified against both tarballs).

**4. Users are identified by `userId` only.** The membership response has no name and no email. The list
shows only `userId`, status, product, and period; a specific user is found by filtering on `userId`. No
per-row user lookup is added.

**5. The target server is display-only.** The current backend endpoint and a dev/prod badge are shown on
screen. The screen does not switch stages — to point at a different server you edit `.env` and restart.

**6. Four safeguards on write operations.**

- A reason (`adminReason`) input is made required by the console. It is optional on the API, but the
  console enforces it.
- A confirmation dialog states in a sentence what will change before execution. Blocking stops the Cloud,
  `auto` creates one.
- `auto` (immediate Cloud creation) defaults off. It is only sent when explicitly turned on.
- The target-server badge is also shown on write screens.

**7. Align `apps/web`'s subscription judgment with the override.**

- `summarizeMembership` reads `adminStatus`, `adminUntil`, and `adminProductId`. Active status is derived
  with the same rule the server uses.
- Add `blocked` to `SubscriptionState` for the block case. It is not folded into `expired` — a state where
  billing continues must not be labeled "expired."
- If an active override has `adminProductId`, that becomes the effective tier.
- **Remove the `isSuper` read.** Only the override is read. This closes the backend's Q5 and clears the
  way to delete the field.

### Out of scope

- **Subscription cancellation.** The backend has no endpoint. Apple's store does not offer server-side
  cancellation, so an admin block substitutes for it; Google's wiring is not done yet.
- **Restoring admin-v2 deployment.** The `libs/socket → web-core` issue that breaks `admin:build` is a
  separate matter. This track assumes local execution.
- **Switching stages from the screen.**
- **Physically removing the `isSuper` field.** That is the backend's job. This ADR only creates the
  precondition by making the app stop reading it.
- **Override history log.** The backend only keeps the most recent entry on the membership record and
  sends the rest to Slack. The console shows only that most recent entry.

### Measured values to hand off to the dev-2 spec

- Per-user Cloud: `GET {relay}/clouds/0/list?view=admin&ownerId={userId}&valid=0`. It is `ownerId`, not
  `userId`. `valid=0` is required to also see expired Clouds. The status aggregate comes along as `aggr`.
- `status` and `isValid` can disagree in the list. The screen shows both, and makes the disagreement
  visible when it happens.
- Indefinite means leaving `adminUntil` empty. Do not put a far-future date in it.
- Release is `adminStatus: ''`. The server clears `adminUntil` and `adminProductId` together.
- The list is an ES search, so re-querying right after a write can return a stale value. The `PUT`
  response is the updated view, so use it to refresh the row.

## Alternatives

**Put the wiring in the app locally** (the precedent of `report-logs`'s
`runtime.boot.webTransport.buildSignedRequest`). Admin-only surface would not enter the shared libs, so
the mobile bundle would not grow, and this would also align with ADR-0070's direction of pushing
console-only surface down into the app. Rejected — the subscription surface already exists across all
three layers, and routing only the admin methods a different way would split one domain into two paths.

**Declare types locally inside the feature** (the precedent of `report-logs`'s `RawMockView`). Leaves
dependencies untouched, with no ripple to other apps. Rejected — here the SDK types really are the
contract of the same server, and the version difference is a pure addition with no risk.

**Switch stages from the screen.** The gateway builds its baseURL from a single config value via
`exec.resolveEndpoint('relay')`. Switching stage per call would require punching a base override through
the gateway, data source, and repository all three. The cost of leaking a console-only concept into all
three shared layers outweighs the convenience.

**Fold blocking into `expired`.** No new state, so the screen doesn't need touching. Rejected — showing
"expired" to a user who is still being billed becomes a CS incident on its own.

**Leave the app's `isSuper` read in place.** No one is suddenly expired even if some record was missed in
the migration. Rejected — letting both axes coexist means the backend can never delete the field. Whether
anything was missed can be checked with this console (below).

**Show "this is how it looks in the app" side by side, in the console only.** Leaves the app untouched
and lets operators see the mismatch. Rejected — it only makes the mismatch visible, it does not remove it.

## Consequences

**What is gained**

- Operators can look up subscriptions and grant, block, or release period, status, and tier from a
  screen. The same screen shows how a grant or block was reflected in the Cloud.
- The server's judgment and the app's screen now see the same truth. A grant makes the app say valid too;
  a block makes the app say restricted too.
- The precondition for the backend to delete `isSuper` is met.
- Who did what and why is recorded without gaps, because a reason is required.

**What is accepted**

- Admin-only methods enter the shared libs, so the mobile app's bundle surface grows by that much. Tree
  shaking is expected to trim it, but the cost is accepted in exchange for this domain's surface living
  in one place.
- Changing the server requires editing `.env` and restarting.
- One more deployment lane is added. The console is local and usable immediately, but `apps/web` changes
  must ride the web deployment. **The console comes alive first, and the app catches up later** — actions
  taken in between are reflected only on the server.
- Copy for the `blocked` state needs to be decided. Its consumers are only `usePlanCatalog` and
  `SubscriptionPage`, so the ripple is small.
- Since the console is not deployed, its users are limited to people who clone the repo and run it
  locally.

**To verify**

- Before removing the `isSuper` read, use **this console** to filter memberships with `isSuper=1` and
  check that all of them have an active override. `isSuper` is a documented filter field. The backend log
  says all 7 records were migrated with zero skipped, but the change that makes the app stop reading it
  still needs its own measurement. The server no longer accepts `isSuper`, so no new ones can appear.
- Check that loading the two list endpoints with a non-admin session returns 403.
- Follow one user through grant → shows valid in the app, block → shows restricted in the app, release →
  reverts to the original state.
- After the `0.26.811` bump, confirm the typecheck baseline (web · admin-v2 at 0) holds across
  `apps/web`, `apps/admin-v2`, and `libs`.

**Still open**

- Subscription cancellation stays open until Google's wiring is decided. Whether the requirement is
  `cancel` (auto-renew off only) or `revoke` (immediate reclaim) is also undecided.
- The server has no trigger to roll back an expired override. The ceiling does not shrink until the user
  opens the app. This belongs to the backend lifecycle track T12.

## Next steps

Hand off to the spec-writing stage (dev-2). The spec should settle the screen layout (list ↔ detail
arrangement), the `blocked` copy, input validation on the override form, and the exact branching of
`apps/web`'s derivation function.
