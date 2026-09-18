# ADR-0036: Unify the data access surface — retire the gateway exception and clean up app-runtime

> Status: Accepted · Decided: 2026-07-30 · Related: [ADR-0089](./0089-relay-dm-invite-and-auth-parallel-tracks.md) (replaces one alternative)

> **Naming note (2026-09-01):** the names this document uses — `*RemoteDataSource`, `RemoteGatewayBundle`,
> `*DomainGateway`, `remoteFactory`, `remote/data-sources/` — are **the names of the time**. The mapping
> after the socket axis moved to a `Socket` prefix is in
> [libs/data/docs/remote/README.md](../../libs/data/docs/remote/README.md#naming-history). This is a
> record, so the body is left as it is.

## Context

This is not preparation for one feature but **general preparation**. There was a sense that violations
of the principle "every data call goes through a repository" had piled up, and a full review of the
tangled logic in `libs/data` and `libs/app-runtime/src/runtime` was wanted. What the review found:

**Bypass inventory** — the app imports `@chatic/data` internals (gateway/data-source/storage) in zero
places. The encapsulation of libs/data itself holds. The real bypasses are:

1. `useRuntimeGateways` exposes two gateways, invite and auth, directly to the UI — the exception
   ADR-0089 deliberately left (consumed by `useRelayInvites`, `useVerifyHashAlias`, and
   `useAttachSocial` in `apps/web`).
2. The parallel axios REST layer in `libs/web-core` — 150+ consumer files. Auth and session bootstrap
   are a legitimately separate concern, but reads that overlap the repository domains are mixed in, such
   as `useUsers`, `useClouds`, and subscriptions, and `libs/users`, `auth`, and `subscriptions`
   re-export them, spreading the surface threefold.
3. `apps/desktop-web/src/app/shared/utils/readCacheRecords.ts` — because repositories only read the
   active cloud partition, it opens raw IndexedDB directly for the cross-cloud lookups push routing
   needs.
   → **Updated 2026-08-06**: an approved path for this purpose now exists. app-runtime exposes explicit
   cid-based cross-cloud reads through `useGlobalCacheSearch().resolveContext` (global-cache-search,
   which lived in the root docs tree, since removed). Moving desktop-web onto this path removes the
   bypass (separate work).
4. `apps/admin` — an independent app on a separate WebSocket stack (`libs/socket`) outside the
   repository architecture, mostly test features.
5. Debug screens, socket-lab, and the one-off cold migration (the raw adapter in
   `invitedCloudColdSync`) — tooling and one-off in nature.

**app-runtime tangle points** (by severity): ① cid/scope bookkeeping is spread across six files
(`useRuntimeBinding` / `DataManager.socketAwareProvider` / `SocketManager.boundCid` / `socketRebootKey` /
`plans.dropForeignFrame` / `SyncManager.isCidActive`) ② a three-way cycle between data, socket, and
runtime that only holds together through lazy singleton accessors ③ socket state and sync registration
are consumed twice, through hooks (declarative) and managers (imperative), across 15+ files ④ 5+ ways to
obtain the current user profile (and inside the hooks, a merge of three sources: token, session, cache)
⑤ layer inversions (`data/invitedCloudColdSync` defines React hooks, socket plans write data,
`DataManager` queries socket) ⑥ duplicate wiring between RuntimeConnectionHost and RuntimeAuthHost ⑦ a
blanket V2 suffix with no V1 present, plus old-name alias debt ⑧ dependence on a private SDK API
(start/stop).

## Decision

### 1. Retire direct gateway exposure — promote to repositories

This **replaces** ADR-0089's alternative "promote the invite list to repositories — dropped". Having
two access surfaces coexist, `useRuntimeRepositories` (through the cache) and `useRuntimeGateways`
(bypassing it), is itself the confusion, so the singleness of the principle wins.

- relay invite → add an `InviteRepository`. Where the auth commands (`verifyHashAlias`, `attachSocial`)
  belong (a new repository vs extending an existing one) is settled at the spec stage.
- **The point of promotion is a single access surface, not an obligation to persist.** ADR-0089's
  factual finding that there is "no offline requirement" still holds, and remote-only or in-memory cache
  implementations are allowed. A repository is redefined as "the single data access surface", not "the
  cache" (the libs/data README needs updating).
- The `useRuntimeGateways` / `DirectGateways` surface is removed.

    > **Migration complete (2026-07-31)** — `useRuntimeGateways`, `DirectGateways`, `getGateways`, and
    > the gateways export from `remoteFactory` were all deleted, and the three hooks in `apps/web`
    > (`useRelayInvites`, `useVerifyHashAlias`, `useAttachSocial`) were moved onto `InviteRepository` /
    > `AuthRepository`. No path that grabs a gateway directly remains.

### 2. Clean up the app-runtime structure — adopt every reviewed tangle

- **Single place for cid/scope bookkeeping**: gather the rules spread across six places into one module
  (a single point for cross-cloud contamination defence).
- **Break the three-way cycle**: flatten the data↔socket↔runtime dependency into a one-way layering.
- **Fix the layer inversions**: put each module's responsibility back where it belongs, for instance by
  relocating the React hooks in `data/invitedCloudColdSync` to the runtime layer.
- **Converge the profile paths**: collapse the 5+ paths (`useRuntimeProfile` / `useSessionProfile` /
  `useMyUser` / direct `getActiveSessionUser` calls / the seeding runner) onto `useRuntimeProfile` as the
  single surface.
- **Fix the singleton↔React double management**: shrink the surface where the app touches
  `getSocketManager` / `getSyncManager` imperatively and converge subscription and registration onto a
  declarative API.
- **Unify the assembly root**: merge the duplicate wiring in RuntimeConnectionHost/RuntimeAuthHost.

### 3. Formalize cross-scope reads

The raw IndexedDB bypass in `readCacheRecords.ts` is not removed but **absorbed by adding a
cross-scope read API to the repository layer**. The aim is to apply the principle (every data call goes
through a repository) consistently to push routing too.

### 4. Explicitly out of scope

- **The web-core parallel REST layer stays for now** — moving the overlapping domain reads to
  repositories is also not done this time. It is left only as a follow-up review item.
- **apps/admin** — excluded, an independent app on a separate stack.
- **Debug/lab tooling and the one-off cold migration** — kept as allowed exceptions.
- **Renaming away the V2 suffix and cleaning up old-name aliases** — excluded (low value for the size of
  the diff).
- **The private SDK API dependency (`bootstrapSocketConnection`)** — excluded this time because it needs
  work on the SDK side; the existing "revisit" marker stays.

### 5. When to start

**Start after every track in the relay DM roadmap (the ADR-0089 family) is finished.** This refactoring
touches the core of app-runtime and would collide head-on with the tracks in flight.

## Alternatives

- **Keep the gateway exception and formalize a list of exceptions** — the argument that keeping it is
  natural while the revisit trigger (the push migration) has not fired. Dropped, on the judgement that
  the confusion of two coexisting access surfaces is the bigger cost.
- **Move the overlapping web-core domain reads over, at once or gradually** — 100+ consumer files, too
  large a scope for this purpose (structural cleanup). Dropped (revisit later).
- **Rename away the V2 suffix everywhere** — a huge mechanical diff and a risk of conflicts with
  parallel branches, for little value. Dropped.
- **Run alongside the tracks while avoiding overlapping files** — the core of app-runtime (cid, the
  cycle, the Hosts) overlaps head-on with the tracks' files, so there is nothing to gain from avoidance.
  Dropped.

## Consequences

- What is gained: the UI's data access surface converges on `useRuntimeRepositories` alone, so the
  "which surface do I use when" confusion disappears. Unifying the cid rules gathers cross-cloud
  contamination defence in one place, and breaking the cycle makes data, socket, and runtime
  understandable and testable module by module.
- What is accepted:
    - Repository facades are built even for data with no persistence — the redefinition "repository =
      access surface" has to be reflected in the docs (the libs/data README and others).
    - The start is tied to the relay track finishing, and until then there is no automated device to
      stop new violations from coming in (manual defence through code review).
    - The web-core REST double surface is not resolved this time — the possibility of "REST read vs
      repository read" disagreeing for user/cloud data remains.
- How the implementation is split is settled at the [[dev-2_implement]] spec stage. Expected tracks:
  (a) invite/auth repository promotion + removal of the gateway surface, (b) cid unification + breaking
  the cycle + the layer inversions, (c) profile convergence + fixing the double management + Host
  unification, (d) the cross-scope read API.
