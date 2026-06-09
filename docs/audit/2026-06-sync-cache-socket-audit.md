# Sync / Cache / Socket Audit — desktop-web + libs + Electron

**Date:** 2026-06-10 · **Branch:** `feature/louis-update-electron`

Audited the desktop messaging stack (`apps/desktop-web`, `libs/*`, `apps/desktop`
Electron shell) against the server contract — the 5 backend repos
(`chatic-sockets-api` v0.26.523, `chatic-socials-api` v0.26.407,
`chatic-backend-api`, `chatic-pushes-api`, `chatic-iap-api`) and the server team's
own reference client `chatic-sockets-api/src/client-socket-v2` (the canonical
sync/reconnect/keepalive protocol). Goal: a Slack-grade messaging app built only
on what the server **already** implements.

## Verdict

The client uses the server contract **correctly** where it matters: optimistic
send + rollback, client-derived unread (`computeChannelUnread` overriding the
lagging server count), an optimistic local read cursor that clears badges
instantly, place-profile delta sync, and the inherited keep-alive / reconnect /
rotation from `@lemoncloud/chatic-sockets-lib`.

The real weaknesses were **reconnect resilience, route-scoped badge/notify, and
the lack of an offline signal** — all fixable on the current server. The
remaining gaps (typing, reactions, edit/delete, presence push, seen-by, message
search, file upload) are **server ceilings**, not client bugs — they need
backend work and were intentionally not attempted.

## Capability matrix (Slack parity)

| Capability | Server | Client | Status |
|---|---|---|---|
| Message send lifecycle (sending/sent/failed) | yes | yes | ok |
| Message pagination / history sync | yes | yes | ok |
| Read receipts (own cursor / mark-read) | yes | yes | ok |
| Read receipts (others "seen by N") | **no** | no | server ceiling |
| Unread counts | partial | yes (derived) | ok |
| Reconnect catch-up (missed messages) | yes | **was gap** | **fixed (#1)** |
| Heartbeat / keep-alive | yes | yes | ok |
| Offline cache (read while disconnected) | — | yes | ok |
| Offline outbound retry | partial | **was gap** | **fixed (#7)** |
| Typing indicator | **no** | no | server ceiling |
| Presence / online status | partial (pull) | no | needs server broadcast |
| Message edit | **no** | no | server ceiling |
| Message delete / unsend | **no** | no | server ceiling |
| Reactions / emoji | **no** | no | server ceiling |
| Attachments / file upload | **no** (v1 text-only) | no | server ceiling |
| Channel list ordering | yes | yes (alpha, by design) | ok |
| Member roster sync (sync-users) | yes | yes | ok |
| Place-profile sync | yes | yes | ok |
| Electron badge (unread → icon) | partial | **was route-scoped** | **fixed (#4)**; Windows overlay still TODO (#13) |
| Electron OS notifications | yes | **click route-scoped** | **fixed (#4)**; collapse tag TODO (#13) |
| Offline / reconnecting banner | (state exists) | **was missing** | **fixed (#5)** |
| Resume-on-focus / OS suspend reconnect | yes | **no** | Tier 2 (#2) |

## Fixed (Tier 1 — server-supported, low risk)

- **#1 Reconnect catch-up** — a silent foreground socket reconnect (token still
  valid, channel list unchanged) was invisible to the `isVerified`/channel-based
  sync, so messages delivered while down were missed until tab hide/show or place
  switch. `GlobalChatSync` now refetches `channel.mine` (network-only) on the
  socket `isConnected` false→true edge → `useChatSync` gap-fill catches up.
- **#7 Failed-send auto-flush** — `ChatRepository.pendingRetry` records sends that
  failed offline; `flushFailedChats()` re-sends on reconnect reusing the original
  `ref` (server-idempotent) and the same optimistic id (in-place row swap).
- **#4 Badge / title / notification-click lifted to the always-mounted shell** —
  were mounted only in `HomePage`, so the dock badge froze and notification clicks
  dropped on `/profile` and `/settings`. `ShellUnreadSync` (app-level) publishes
  unread to `useUnreadStore`; a route-independent `NotificationOpenListener`
  routes home + stashes the target in `usePendingOpenStore`.
- **#5 Connection banner** — `connectionStatus` existed in the store but only the
  debug page read it; `ConnectionBanner` now surfaces offline/reconnecting
  app-wide.
- **#11** `useReadReceipts` no longer re-binds focus/visibility listeners on every
  incoming message (messages kept in a ref).
- **#14** Engine `chat:create` unread converged to the absolute
  `lastChatNo − myReadNo` formula (was `prevUnread + 1`, drifts on dup/out-of-order).
- **#15** Optimistic→persisted swap emits a single stream snapshot (deferred emit).
- **#12** Electron dock-icon click reshows a tray-hidden window.

## Remaining (Tier 2 — higher risk / larger, deferred)

- **#2** OS suspend/resume + browser `online` forced reconnect (Electron
  `powerMonitor` + bridge event). Today the socket can stay dead after laptop sleep.
- **#3** Harden request correlation — app mutations bypass the package's
  `client.request` (mid/timeout/backpressure); the homegrown `SocketRequestManager`
  resolves the first ref-matching frame regardless of type (already hand-patched
  with a `-bg-sync` ref suffix). Use a unique internal ref matched on response type.
- **#6** Dead `ChatSyncPlan` + `useChatSyncTargets` (the package's request-based
  sync plan is wired but never registered via `extraSyncPlans`). Pick one path.
- **#8** No type-map ↔ dispatcher parity test (the `channel.sync-site-profile`
  drop was this class of bug; `device.*` is currently logged as "Unhandled domain").
- **#9** IndexedDB TTL is stamped (`expiresAt`, 30 min on channel/join/user/site)
  but never enforced; the storages README documents a GC-on-read that doesn't exist.
- **#10** Message list is not virtualized (unbounded DOM growth).
- **#13** Windows badge overlay icon + per-channel notification collapse tag.

## Server ceilings (need backend work — not client bugs)

Typing indicators, reactions, message edit/delete, live presence broadcast,
"seen by" per-member read cursors, message search, and file attachments have no
action/field on the current server and cannot be built client-side.
