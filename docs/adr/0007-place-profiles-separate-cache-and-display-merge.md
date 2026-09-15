# Place Profiles: a separate site-scoped profile cache + a single Display Profile merge; runs in all modes, fail-soft

## Status

accepted

## Context

A user must be able to present a different nick/avatar per Place (the "site
profile" feature; see the multi-user-profile requirement/spec). The backend
(chatic-sockets-api 0.26.523 / chatic-socials-api 0.26.407) exposes:

- `user.get-site-profile` → `ProfileView` (my Place Profile; get-or-create)
- `user.set-site-profile` (`ProfileBody`) → `ProfileView`
- `channel.sync-site-profile` `{ since }` → `SiteProfileSyncView`
  (`{ profiles: { [uid]: ProfileDisplay | null }, syncedAt }`)

Two facts shape the decision:

1. **ADR 0006 declared the `user` cache the single source for author names** and
   rejected denormalizing names onto chats. A naive implementation would either
   overwrite `user` records with per-Place values (losing the global identity and
   the cross-Place fallback) or scatter a per-Place merge across the 3–4 places
   that already resolve a display name (`displayName`, `resolveOwnerName`,
   `ProfileCard`, self surfaces) — the exact drift ADR 0006 warns against.

2. **The realtime `profile.invalidate` hint in the spec is not emitted by the
   backend yet** (grep of both API repos is empty), so a WSS-driven invalidation
   path would be dead code today.

The spec also says canonical user and site profile must not be merged into one
stored object, and that sync apply must be idempotent (`null` = reset delta,
missing key = no change).

## Decision

- **A separate `profile` cache, not an extension of the `user` cache.** Place
  Profiles live in a new engine repository + IndexedDB cache type, scoped
  `{cid,sid}` (vs the `user` cache's `{cid,uid}`). This does not violate ADR
  0006: the `user` cache stays the single source for *global identity*; the
  `profile` cache is a *different axis* (per-Place display). They are never merged
  in storage.

- **Display Profile is a render-time merge behind one selector.** A single
  `useDisplayProfile(uid)` resolves `placeProfile[uid] ?? globalDisplayName`
  field-by-field and is the only path every surface uses — Messages
  (`buildMessageRows`), member roster, the self surfaces (CloudRail / ProfilePage),
  and the Profile card. Name precedence: an active Place nick wins over the
  existing `displayName(global)`; absent a Place Profile, behaviour is unchanged.
  Avatar color seed stays keyed to the canonical uid (unchanged).

- **The cache holds only active profiles.** Sync `null` deltas remove the row, so
  anything present is active — the display layer needs no `active` check. `active`
  is only meaningful in the self edit form.

- **Sync is cursor-driven, per `{cid,sid}`, no WSS dependency.** Triggers:
  Place-switch, socket verified (app start), reconnect. First call `since=0`;
  store the server `syncedAt` as the next `since`. Apply is idempotent.

- **Self edits are optimistic** (CLAUDE.md mutation rule): `setMyProfile` writes
  `profile` cache[myUid] before the network (active → upsert ProfileDisplay,
  inactive → remove) and rolls back on error.

- **Runs in all modes, fail-soft.** The feature is wired in relay/Default Cloud
  too, not just cloud mode. Because relay support for these ops is unverified, any
  get/set/sync error degrades silently to the Global Profile and must never break
  the UI.

## Considered Options

- **Merge per-Place values into the `user` cache** — rejected: destroys the
  global identity + cross-Place fallback and contradicts ADR 0006 / the spec's
  "do not merge" rule.
- **Per-surface merge (no central selector)** — rejected: reproduces the scattered
  resolution ADR 0006 fought, guaranteeing drift between Messages, roster, and the
  Profile card.
- **Build the WSS `profile.invalidate` handler now** — rejected: the backend does
  not emit it yet; it would be dead code. Cursor catch-up covers correctness; the
  hint is a latency optimisation to add when the server ships it.
- **Cloud-mode only** — considered (cleaner, relay has no real per-Place
  identity), but the product wants all modes; accepted with the fail-soft fallback
  as the safety valve.

## Consequences

- Global identity and per-Place display stay independent; the `user` cache keeps
  its ADR 0006 role. The new `profile` cache adds a second IndexedDB type to
  maintain (and, eventually, to bound — same deferred-eviction caveat as ADR 0006).
- One selector owns display resolution, so future identity surfaces get Place
  Profiles for free and there is one place to change the merge rule.
- No realtime profile updates until the backend emits `profile.invalidate`;
  changes surface on the next Place-switch / reconnect / app start. When the hint
  ships, add a handler that just pulls a sync — no display-layer change.
- Relay correctness depends on the fail-soft fallback; if the backend later
  rejects these ops in relay, the UI still renders Global Profiles. The relay
  contract should be verified and this ADR revisited if it forces cloud-only.
