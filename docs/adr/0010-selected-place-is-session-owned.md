# Selected place is session-owned state, not a separate client store

## Status

accepted

## Context

The active Place (the workspace shown in the desktop-web far-left rail, the engine's
"selected site") drives the channel list. desktop-web tracked it in its own persisted
Zustand store `useSelectedPlaceStore` (`chatic-selected-place`), committed _after_
awaiting the per-place auth handshake, behind a full-screen `SwitchingOverlay`.

The v2 engine already owns this state: `useSessionSelection().selectedSiteId`
(`= activeServer.siteId`), persisted by the session itself per scope
(`relayCore` key `chatic-relay-selected-site-id`; a per-cloud `cloudCore` equivalent),
restored on refresh and reopened per-cloud on cloud switch. `switchSiteSession`
optimistically pre-applies the sid (cached channel streams swap immediately), commits the
socket re-auth in the background, and rolls back on failure; `logoutRelaySession` clears
the selected site itself.

So desktop-web held a **second, redundant copy** of "which place is active." Committing it
after the await (behind the overlay) is exactly what made place/cloud switching feel slow —
the UI waited for the socket re-verify round-trip instead of swapping the optimistically
pre-applied cached data, as apps/web does.

## Decision

Treat the selected place as **session-owned**. desktop-web reads it from
`useSessionSelection().selectedSiteId` and writes via the engine's `switchSite` /
`switchCloud`. The redundant `useSelectedPlaceStore` (+ its persistence and the
`useSelectPlace`/`useCloudSwitchFlow` await-then-commit + loader machinery) is removed;
`useSelectPlace` mirrors apps/web `useSwitchPlace` (`void switchSite(id)`), and
`useCloudSwitchFlow` mirrors `CloudSessionSheet.handleSelectCloud`
(`await switchCloud(id)` — which clears the site; HomePage auto-selects the new cloud's
first place. The per-cloud last site is restored only on a full refresh, via the session's
own persistence — a live switch resets to the first place, matching apps/web).

The Default Cloud (relay / Guest Session) has no joinable site, so HomePage **derives** the
`'default'` place sentinel (`isDefaultMode ? 'default' : selectedSiteId`) rather than storing
it — the Self Channel still loads. The far-left rail disables its tiles via `isSwitching`
(button-level, web parity) instead of a full-screen overlay.

The **selected channel** stays in its own persisted client store (`useSelectedChannelStore`):
it has no session equivalent (which channel is open is pure UI within a site). Selected place
and selected channel are deliberately **not** modeled symmetrically.

## Consequences

- Place/cloud switching is optimistic and instant (cached channels swap immediately; socket
  re-auth + rollback happen in the engine), matching apps/web. No app-side loader/rollback.
- Restore-on-refresh and per-cloud last-place are now provided by the session's own
  persistence (more correct than the old single global key, which needed a self-heal).
- One source of truth → no store↔session desync.
- Net code removal (`useSelectedPlaceStore`, `placeAuth`/`useAuthPlace`, the switch loaders).
- The full-screen `SwitchingOverlay` is removed (nothing set the global loader once the switch
  hooks went optimistic). `ConnectionBanner` no longer suppresses on the dead loader flag; it now
  detects an in-flight switch via `useIsMutating(SWITCH_SITE/CLOUD_MUTATION_KEY)` (the same signal
  `useBackgroundSync` uses) so it still stays quiet during a deliberate switch instead of flashing
  "Reconnecting…".
- The active-place id with the relay `'default'` sentinel is read at the right altitude per
  consumer: HomePage derives it reactively for the channel query; MessageRow reads it
  non-reactively at save-click time (`getActiveServerContext()`) — never a per-row session
  subscription — while per-site-data readers (`useSiteProfiles`, `useCurrentPlace`) keep the raw
  nullable `selectedSiteId`.
- A future contributor must NOT re-introduce a parallel client place store; see CONTEXT.md
  ("Place").
