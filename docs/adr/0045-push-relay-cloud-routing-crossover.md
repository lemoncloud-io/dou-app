# ADR-0045: Crossover routing between the relay server and the cloud server for push notifications

> Status: Accepted · Decided: 2026-08-05

## Context

Push tap routing already has a single convergence point in
`apps/web/src/app/bridge/navigation/usePushNavigate.ts`. Both the OS notification tap
(`useHandlePushNavigation`) and the in-app banner tap (`useInAppPushMessage`) funnel into this hook,
and `resolvePushNavigation` pulls `cid`/`sid` out of the link query. The hook branches like this
today:

```ts
const needsSwitch = (!!cid && cid !== selectedCloudId) || (!!sid && sid !== selectedSiteId);
// ...
if (cid && cid !== selectedCloudId) await switchCloud(cid);
if (sid && sid !== selectedSiteId) await switchSite(sid);
```

That already handles the "cloud A → cloud B" and "relay → cloud" (when a real `cid` arrives)
crossovers. What it does not handle is **receiving a relay-server push while a cloud session is
active**: the backend push payload pins the `cid` field of relay-originated messages to the literal
`'#'` (a separate concept from `'default'`, the internal sentinel of the frontend session layer — the
`'default'` used by `getSelectedCloudId()` in `libs/web-core` is internal to the session layer, while
`'#'` exists only in the backend push payload spec), and the current code tries `switchCloud(cid)`
unconditionally as long as `cid` is truthy. `'#'` is not a valid cloud id, so taking this path either
fails the switch (a 400 or similar) or enters the wrong context, and the expected behaviour — "log out
of the cloud session, then enter the relay chat room" — does not happen.

In the session model, relay is the base authentication of cloud (`switchCloudSession` enters a cloud by
exchanging the relay session's delegation token, so if a cloud is active the relay session is always
valid). Leaving a cloud therefore needs no re-login: one call to `logoutCloudSession()`
(`libs/web-core/src/session/services.ts`) returns to the relay context — an already existing
"leave the cloud only" path, distinct from `logoutRelaySession()` (a full logout requiring re-login).

## Decision

Add a relay-origin check to `usePushNavigate.ts`:

- When `cid === '#'` and the current `activeServer.kind === 'cloud'`, call `logoutCloudSession()`
  instead of `switchCloud(cid)` to return to the relay context, then navigate to `target`.
- When `cid === '#'` and we are already in the relay context, switch nothing and just
  `navigateNormalized(target)` (the path that already works today).
- The existing `switchCloud(cid)` branch for a real `cid` (a cloud-originated message) is
  unchanged — relay→cloud and cloud A→cloud B both already work correctly.
- `sid` is out of scope for this change: the relay context does have a `siteId` concept, but a site
  switch is not required for relay-server push (if a `sid` arrives, the existing `switchSite` branch
  applies as it does now, and no separate logic is added for this crossover case).
- The change is confined to one place, `usePushNavigate.ts` — the OS tap and the in-app banner tap
  already converge on this hook, so both paths get it automatically.

### Out of scope

- Changing the cloud A → cloud B or relay → cloud (real cid) switch logic (it already works).
- The `sid` (site) switch for relay push.
- Changing the backend push payload spec itself.
- Adding UX such as a logout confirmation dialog — existing switches are handled automatically without
  confirmation, so this follows the same unconfirmed automatic switch pattern.

## Alternatives

- **Special-case `'#'` in `resolvePushNavigation.ts`**: normalizing `cid === '#'` to `null` at the path
  parsing step was considered, but that erases the information that this is a relay message, so
  `usePushNavigate` could no longer tell "no cid (stay put)" apart from "explicitly return to relay
  (logout required)". When a push with no `cid` at all (legacy, site-only, and so on) arrives during an
  active cloud session, doing nothing is correct — and that must not be lumped together with returning
  to relay. So `'#'` is passed through to `usePushNavigate` and branched on there.
- **Use `logoutRelaySession()` (full logout)**: it bounces the user to the re-login screen, which does
  not satisfy the requirement of "go straight to the chat room". In the session model relay is already
  valid, so it is needlessly heavy.

## Consequences

- Clicking a relay-server push during a cloud session leaves only the cloud via
  `logoutCloudSession()` and enters the relay chat room directly — no re-login.
- The existing behaviour of clicking a cloud-server push during a relay session (`switchCloud(cid)`)
  is unchanged.
- The backend-only sentinel `'#'` enters the frontend routing code as a hardcoded magic string — a
  comment must state that it has a different name and lives in a different layer than the session
  layer's `'default'` sentinel, to prevent confusion.
- If the backend later changes the relay sentinel value (say `'#'` → something else), only this one
  spot needs fixing — it is a single convergence point, so the change radius is narrow.
