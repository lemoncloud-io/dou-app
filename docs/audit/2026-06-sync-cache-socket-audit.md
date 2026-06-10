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

## Fixed (Tier 2)

- **#2** Force reconnect on browser `online` + after OS sleep — detected via a
  wall-clock gap (timers freeze during sleep; no `visibilitychange` on wake).
  `forceReconnect()` short-circuits the package backoff via `runtime.reconnect.restart()`,
  no-op when already connected. Pure renderer (browser + Electron); no
  `powerMonitor`/bridge contract added.
- **#3** Request correlation hardened *conservatively*: unique `sendChat` ref so
  concurrent sends never share a wire ref (retries reuse the original via
  `options.ref` for idempotency); `SocketRequestManager` warns on a duplicate
  in-flight ref and documents the uniqueness contract. Full type-aware matching
  was **not** attempted — the ref triple-serves as correlation key, wire mid, and
  idempotency key, and the error-event semantics are subtle; a rewrite risks
  regressing send idempotency + error propagation.
- **#6** Deleted dead `ChatSyncPlan` + `useChatSyncTargets` + the unused
  `extraSyncPlans` seam; kept the live `ChatSyncScheduler` (replace, don't deprecate).
- **#8** Dispatcher routes a raw `channel` domain to `chatHandler` (unmapped
  `channel.*` would otherwise be silently dropped) and swallows `device` quietly
  (consumed in the socket layer). Added dispatcher regression tests.
- **#9** Corrected the storages README: the TTL is advisory and **not** enforced
  (no GC-on-read). Freshness comes from socket events + explicit sync; expiry
  eviction without a refresh path would only cause stale-blank.
- **#13** Windows taskbar overlay badge — rendered as a **PNG in the renderer**
  (Electron `nativeImage` can't rasterize SVG) and painted via `setOverlayIcon`
  (`!isEmpty()` guarded); plus per-channel OS-notification coalescing.

## Remaining (Tier 2 — deferred)

- **#10** Message list virtualization (unbounded DOM growth in very long sessions).
  Done *partially*: the post-send RAF pin now exits once height settles. Full
  windowing is deferred — it needs a new dependency (`@tanstack/react-virtual`)
  and a rewrite of the tuned scroll-anchor / jump-to-bottom / load-older engine
  (highest regression risk; a perf issue, not a correctness/sync one).

## Server ceilings (need backend work — not client bugs)

Typing indicators, reactions, message edit/delete, live presence broadcast,
"seen by" per-member read cursors, message search, and file attachments have no
action/field on the current server and cannot be built client-side.
