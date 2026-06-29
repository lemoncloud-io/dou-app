# v2 Engine Rebase Playbook — `feature/louis-notif-dnd-mentions`

**Status:** ✅ COMMITTED + REBASED ONTO develop 2026-06-29 (pending runtime QA + push) — raine's v2 MERGED to develop (PR #345, v0.37). desktop-web port committed (`feat(desktop-web): migrate app layer to v2 engine`) and re-rebased onto `origin/develop` (clean, no conflicts — develop's tree already had the repo-file deletions). Picked up engine improvements: `ProfileRepositoryV2.syncProfiles` now handles removals (`cacheDeleteMany`) → Phase-5 realtime sync auto-benefits; mirrored the `useBackgroundSync` `channel.refreshList().catch()` fix. Build green, specs 15/15. Backups: `backup/louis-notif-dnd-mentions-pre-v2` (pre-port), `backup/louis-v2-port-pre-develop-rebase` (port on old base). **NOT pushed (force-push needed — history rewritten by both rebases).**
> Prior status: BUILD GREEN + REVIEWED — vite `✓ built in 8.09s`, shared specs 15/15. Reviewed by 4 agents (data: no Critical bugs; auth: 1 real bug fixed; conventions/socket: clean; simplicity: 3 structural). 6 review fixes applied (below). NOT committed, NOT force-pushed. Earlier notes:
> 
> **Review fixes applied (/react-04-fix):** (1) `useInviteLogin` — guard `loginGuest` so the in-app Join dialog doesn't silently downgrade a signed-in user to guest; (2) `useSocketWedgeReload.spec.ts` migrated off orphaned `@chatic/socket` → app-runtime mock (6/6 pass); (3) removed TEMP `console.debug` + `reason` ladder from `useMentionCapture`; (4) profile-sync 3→2 paths — deleted `useSiteProfileSync.ts` + `useSiteProfileCursorStore.ts`, folded its window-focus catch-up into `useRealtimeProfileSync` (shared `syncMeta` watermark); (5) extracted `useChannelChatFeeds` shared hook (single-sourced the channel-discovery/registerChat/baseline engine `useDesktopNotifications`+`useMentionCapture` duplicated); (11) reverted unrelated `apps/mobile/ios` artifacts. Deferred [Nice]: invite wss-loss-on-lookup-failure, invited-channel entry, TokenLoginPage run-once guard, realtime-sync debounce, extractErrorMessage precedence, useBackgroundSync refreshList `.catch` (most match apps/web intentionally).
>  raine pushed fixes (`origin/feature/raine-migrate-v2` now `d0507616`: storage moved back into `libs/shared/src/utils/storage.ts`, web-core refactor, sockets-lib 0.2.0→0.4.0). Verified `apps/web` vite build GREEN on that commit (isolated worktree). Re-rebased louis onto `d0507616` (same 2 modify/delete conflicts, resolved). My 4 earlier base-fixes DISCARDED (raine fixed upstream). `yarn install` for 0.4.0 deps. Now starting desktop-web app-layer port (Phases 1–5). Backup `backup/louis-notif-dnd-mentions-pre-v2`. **Not force-pushed.**

### Port progress (Phases 1–4 landed via 4-agent fan-out, 2026-06-29)
- **Phase 1 (shell):** `apps/desktop-web/src/app/runtime/` created (DesktopRuntime + useSocketDelegate + useBackgroundSync + BackgroundSyncRunner, mirroring apps/web); `app.tsx` → providers-only (host owns init); `routes.tsx` gate → `useSessionAuth`.
- **Phases 2–4 (51 call-site files):** migrated by 4 parallel agents, each mirroring the apps/web v2 equivalent — `useRepositories`→`useRuntimeRepositories` (observe/cache/sync), `useWebCoreStore`→session readers, `useWebSocketV2Store` (orphaned `@chatic/socket`)→`useSocketState` (+ cloudId from `useGlobalSession().cloud.cloudId`).
- **Integration fixups (in progress):** `toError`/`extractErrorMessage` not in web-core barrel → app-local `shared/utils/errors.ts` (mirrors apps/web); `SOCIAL_OAUTH_ENDPOINT`→`WEB_SOCIAL_OAUTH_ENDPOINT`; `placeAuth` util→`useAuthPlace` hook (fixes `useSelectPlace`); `useAccountResetOnLogout` now returns `resetAccount` (wire into PlaceRail logout). Driving `apps/desktop-web` vite build to green.
- **Phase 5 (done):** realtime `profile:sync` restored as a desktop-web runtime binder `runtime/useRealtimeProfileSync.ts` (mounted in DesktopRuntime). On the server's `channel.sync-site-profile` push (`getSocketManager().onType`), it re-pulls the profile delta immediately (`repos.profile.syncProfiles`, sharing the background-sync watermark). NO engine edit (kept off raine's moving libs).

### QA list (build green ≠ behavior verified — runtime-test these)
1. **Phase 5 delivery risk:** verify the lib forwards the server-pushed `channel.sync-site-profile` to `onType` (vs consuming it internally in the sync runtime). If it doesn't fire, hook `onMessage` and filter, or trigger via a place/channel sync target instead. Test: peer edits place nick/photo → it updates live on this client.
2. **useInviteLogin (highest risk):** rewritten to bootstrap guest inline + `switchCloud`/`switchSite` + `cloud.cacheWrite({cloudType:'invited'})`. Test invite-accept end-to-end (join across deployments, rail surfacing, place pre-select).
3. **TokenLoginPage:** profile now hydrates via `refreshRelaySession` instead of URL JWT claims — verify raw-token deep-link lands authenticated.
4. **Notifications/mentions/unread:** `useDesktopNotifications`/`useMentionCapture`/`usePlaceUnreadCounts` were rewritten from event-subscription to `observeList` + `getSyncManager().registerChat`. Smoke: OS notification on new msg (respecting DND), @-mention capture, unread badge/title.
5. **Logout reset:** `useAccountResetOnLogout` now returns `resetAccount`; PlaceRail logout calls `resetAccount().finally(logout)`. Verify account-scoped cache/localStorage wiped on logout.
6. **Spec debt (not in vite gate):** `useSocketWedgeReload.spec.ts` (+ other specs) still import old APIs — update before running the test suite.

apps/desktop (Electron shell): no engine imports → no change (Phase 7 no-op).

> Historical blocker (now resolved upstream) retained below for reference.

### ⛔ BLOCKER — raine-migrate-v2 not buildable (apps/web vite, fast-fail serial)
Hit 3 distinct stale-refactor fronts across `libs/{shared,web-core}`; each fix revealed the next:
1. `libs/web-core/src/transport/webTransport.ts` — `setStorageAdapter` imported from `@chatic/shared` (moved to web-core `core/coreStorage.ts`). **Fixed** → `import from '../core'`. (mechanical)
2. `libs/web-core/src/session/core/{relay,cloud,identity}Core.ts` — `storage` imported from `@chatic/shared` (renamed → `coreStorage`, identical `get/set/remove` API). **Fixed** → `import { coreStorage as storage } from '../../core'`. (mechanical, 3 files)
3. `libs/shared/src/apis/generateToken.ts` (pre-existing Louis file `d2e8624e`, the ONLY shared→web-core importer) — imports `webCore` from `@chatic/web-core`, which v2 dropped from the barrel (→ `startWebCoreInit` + factory split). **NOT fixed** — needs intent, cross-lib, and more breakage likely hides behind it (vite stops at first error).

**Resume condition:** raine lands a v2 that passes `cd apps/web && ../../node_modules/.bin/vite build` (exit 0). Then re-rebase (backup preserved) and continue with Phases 1–5 of `.claude/20260629/PLAN-11-35-51.md`. The 4 uncommitted fixes above may be dropped if raine fixes them upstream.
**Authored:** 2026-06-22 (analysis fresh as of this date — RE-VERIFY before executing; raine's branch is still moving).

## EXECUTED 2026-06-29 — actual rebase results vs predictions

- **Rebase clean**, 22 commits replayed. Conflicts were EXACTLY the 2 predicted repo files, both as **modify/delete** (raine deleted v1 `repositories/{Profile,User}Repository.ts` → `repositories-v2/*V2`; louis modified v1). Resolved by `git rm` the v1 files; louis's logic deferred to re-implement on v2 (see below). desktop-web commits replayed git-clean.
- **`afd20143` (UserRepository)** was a *removal* of the global-nick→place-profile mirror workaround. v2 `UserRepositoryV2` likely never had the workaround → that edit may be a **no-op on v2** (verify before re-adding). Its `useSiteProfiles.ts` change (self-mirror cloudUid→accountUid *always*) survived the rebase and must outlive the Phase-2/3 hook rewrite.
- **`f9d4186c` (profile:sync realtime)** — v2 DROPPED the realtime path entirely: `ProfileRepositoryV2` has only `syncProfiles` (60s poll); no `profile:sync` in v2 `domain.ts`; `ProfileRemoteDataSource` does `gateway.sync()` only; the `chatHandler → emit('profile:sync')` chain is gone (socket layer = SocketManager/SyncManager). **Re-implement realtime on v2** (decision: realtime, not 60s-poll regression).
- **⚠️ `@chatic/socket` silent-breakage:** `libs/socket` (with `useWebSocketV2Store`) STILL EXISTS in v2 but is **orphaned** — nothing in v2 app-runtime/web/web-core feeds it (web uses `useSocketState`, 0 uses of the old store). desktop-web's **21** `useWebSocketV2Store` imports therefore **compile but stay永-empty** (`isVerified` never true) → ConnectionBanner/notifications/wedge/badge silently dead. The compiler will NOT flag these — all 21 must be actively migrated to `useSocketState` (app-runtime) + `useGlobalSession().cloud.cloudId` for the dropped `cloudId`.
- **Symbol-count drift:** the v1 table below undercounted — actual axes: `useRepositories` 13 (rewrite to observe/cache/sync), `useWebCoreStore` 31, **`useWebSocketV2Store` 21** (new axis), plus app.tsx + cloud/auth hooks. ~65 call-site files.

---

## Why this exists

`feature/louis-notif-dnd-mentions` (DND / mentions / notification work) is built on the
**old** engine (`libs/web-core` + `libs/app-runtime`). raine's v2 migration replaces both
libs and reshapes their public surface. This doc captures the exact conflict surface and the
symbol-migration recipe so the eventual rebase is fast.

Decision (2026-06-22): keep working on the old engine for now; rebase **once**, after raine's
v2 work is merged. Do **not** rebase onto the in-flight branches.

## The v2 line (how raine's branches fit)

```
feature/raine-migrate-socket   ← COMPLETE, buildable v2 (real history off develop)
   │   carries everything: libs/shared (setStorageAdapter, storage),
   │   libs/data (V2 repos + RemoteGatewayBundle), libs/web-core, libs/app-runtime,
   │   @lemoncloud/chatic-sockets-lib bumped 0.2.0 → 0.2.1
   ├─ sliced into review PRs ─► #334 [WebCore]   (orphan single-commit) ─┐
   └─                          #335 [AppRuntime] (orphan single-commit) ─┴─► feature/raine-migrate-v2 ─► develop/main
```

- **PR #334 / #335 heads are review SLICES (orphan commits) — NOT buildable on their own.**
  A dry-run grafting only those two libs onto this branch failed: vite hard-stopped on
  `setStorageAdapter is not exported by libs/shared` and tsc showed +73 errors. The cross-lib
  glue (shared / data / sockets-lib 0.2.1) lives only in the complete branch.
- **Rebase target is whatever carries the COMPLETE v2** — i.e. `develop` once v2 is merged
  (equivalently `feature/raine-migrate-socket` while it is still raine's integration branch).

## Trigger to start

raine's v2 fully merged into `develop` (verify the cross-lib pieces are present — see pre-flight).

## Pre-flight (re-verify — this doc may be stale)

```bash
git fetch origin
TARGET=develop   # or feature/raine-migrate-v2 / feature/raine-migrate-socket, whichever holds COMPLETE v2

# 1. glue present? all three MUST return hits, else v2 is not fully landed:
git grep -l setStorageAdapter   origin/$TARGET -- libs/shared
git grep -l RemoteGatewayBundle origin/$TARGET -- libs/data
git show origin/$TARGET:package.json | grep sockets-lib   # expect 0.2.1+

# 2. re-confirm the conflict surface against the CURRENT target (numbers below will drift):
git diff --stat origin/$TARGET...feature/louis-notif-dnd-mentions -- \
  libs/data/src/data/repositories/ProfileRepository.ts \
  libs/data/src/data/repositories/UserRepository.ts
git diff --stat develop..origin/$TARGET -- apps/desktop-web   # expect SMALL (v2 barely touches desktop-web)
```

## Rebase

```bash
git switch feature/louis-notif-dnd-mentions
git rebase origin/$TARGET
# real shared history (merge-base = develop HEAD), so this is a normal rebase, not --onto gymnastics.
```

Expected conflicts: **only the 2 repository files below.** desktop-web replays git-clean
(v2 touches ~24 desktop-web files, no overlap with louis's work) — but the **build** then
breaks semantically; fix the call sites per the table.

## Conflict zone 1 — 2 repository files (HAND-MERGE)

v2 rewrites both. Re-apply louis's feature logic onto the V2 shape, don't paste the old file back.

| file | v2 change | re-apply |
|---|---|---|
| `libs/data/src/data/repositories/ProfileRepository.ts` | gutted (~259 → ~71 lines) | louis's `profile:sync` real-time listener + `applySyncDelta` (cross-user nickname/photo sync) |
| `libs/data/src/data/repositories/UserRepository.ts` | rewritten (~119 lines changed) | louis's UserRepository edits |

Keep the engine's optimistic-write + event-broadcast contract (see project CLAUDE.md "Data & Mutations").
Verify the V2 repo still exposes a domain-event hook for `profile:sync` before wiring the listener.

## Conflict zone 2 — desktop-web call sites (~81 sites, ~20 files; semantic, not git conflicts)

Concentrated in `apps/desktop-web/src/app/features/auth/hooks/` and `shared/hooks/`.
Surfaces as TS2305 "no exported member" after the rebase builds.

| old symbol (import) | count | new home / action |
|---|---|---|
| `useRepositories` (`@chatic/app-runtime`) | 20 | rename → `useRuntimeRepositories` |
| `useDynamicDeviceId` (`@chatic/app-runtime`) | 3 | moved → import from `@chatic/web-core` |
| `useCloudSession` (`@chatic/app-runtime`) | 3 | new session hooks (`useSessionSelection` / `useSessionAuth`) — verify exact |
| `DataProvider` / `GlobalChatSync` / `WebSocketV2Connection` / `useAutoSelectCloud` | 1 each | relocated under app-runtime `connection/*` — re-point |
| `useWebCoreStore` (`@chatic/web-core`) | 28 | **real refactor** → new `session/contexts` public API (biggest task) |
| `cloudCore` | 9 | new web-core `session/core` surface |
| `toError` | 6 | new web-core surface (`api`/`utils`) |
| `webCore` | 5 | new web-core surface |
| `extractErrorMessage` | 2 | new web-core surface |
| `setIsInvitedSession` | 1 | new web-core surface |

Barrel narrowing is the root cause: v2 web-core dropped `export * from './stores' './core' './utils' './types'`
(now `./transport`, `./session/*`, `./api`, `./hooks`); v2 app-runtime dropped `./data ./sync ./stores ./hooks`
(now `./socket ./runtime ./connection`). Most symbols still exist — relocated or renamed, a few now internal.

## Verify gate

```bash
cd apps/desktop-web && ../../node_modules/.bin/vite build   # exit 0 = pass (project CLAUDE.md gate)
```
`nx` and `tsc -b` are unreliable here (sandbox hang / project-ref cascade). The vite build is the gate.
Then smoke-test: DND / snooze / quiet-hours UI, mentions panel, and cross-user `profile:sync`.

## Caveats

- raine's branches are active — every number above (file counts, the 81 call sites, the 2-file conflict)
  **will drift.** Re-run pre-flight; treat the table as a map, not gospel.
- If v2 lands split across more than one merge, wait for ALL pieces (the glue check in pre-flight gates this).
