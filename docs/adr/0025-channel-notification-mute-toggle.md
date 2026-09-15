# ADR-0025: Mute notifications per chat room — wire the toggle to join.update notify (apps/web)

> Status: Accepted · Decided: 2026-07-20

Related ADRs:
[[0015-channel-settings-ui-refresh]](./0015-channel-settings-ui-refresh.md) (introduced the toggle, UI-only),
[[0019-group-channel-settings-section-layout]](./0019-group-channel-settings-section-layout.md) (placed the inline toggle in the group room settings section),
[[0023-channel-detail-dialogs-figma-redesign.md]](./0023-channel-detail-dialogs-figma-redesign.md) (introduced the personal room name join.nick — the same join.update path)

## Context

The "Chat room notifications" switch on `ChannelSettingsPage` was introduced **UI-only** by [ADR-0015]
and [ADR-0019]. It is bound to a `useState(true)` in
`apps/web/src/app/features/channels/pages/ChannelSettingsPage.tsx:37-39`, so it resets on reopen and
never reaches the server.

From `chatic-sockets-api@0.26.703`, `join.update` accepts a `notify` field
(`JoinNotify = '' | 'all' | 'mention' | 'none'`). Using it to mute a chat room and persist that on the
server is the goal here.

What the survey found:

- **The data layer is already complete.**
  [`JoinRepository.updateJoin`](../../libs/data/src/repositories/JoinRepository.ts) takes
  `{ channelId, userId, notify }`, resolves the join id from the local cache, performs an **optimistic
  cache write with rollback on failure**, and calls the `join.update` socket. `DomainJoin`
  (= `CacheJoinView`) already has a `notify` field and `toDomainJoin` passes it through.
  `useJoinMutations.updateJoin`
  (`apps/web/src/app/features/channels/hooks/useJoinMutations.ts`) is exposed too.
- **The same feature exists in `apps/desktop-web`**
  (`apps/desktop-web/src/app/features/channels/components/ChannelSettingsPanel.tsx`). Desktop
  **renders notifications itself**, so it added a local preference store
  (`useNotificationPrefsStore`) for immediate gating.
- **apps/web depends on server push** (register a device token, the server sends the push). It has no
  client-side notifier that would filter on the notify state.
- The per-channel setting (notify) lives on **my join row**. The embedded `$join` on a channel row is a
  lagging projection and is unfit as the initial source, so observe the join cache
  (`joinRepository.observeList`) and read `notify` from the row for my userId — the same pattern
  `useChannelMembers` uses.

## Decision

Wire the notification switch on `ChannelSettingsPage` to `join.update` for real.

**In scope**

- Derive the switch's initial value from `notify` on the join stream (`useMyJoin`, observing my join row
  through `joinRepository.observeList`): `notify === 'none'` → off, anything else (`'all'`, `''`,
  undefined) → on.
- On toggle, call `useJoinMutations.updateJoin`
  (`apps/web/src/app/features/channels/hooks/useJoinMutations.ts`) with
  `{ channelId, userId, notify: on ? 'all' : 'none' }`. `userId` is `myJoin?.userId ?? the session
  userId`. (`ChannelUpdateJoinInput` does not type `userId`, so it is passed through a cast, exactly as
  desktop does — the engine resolves the join row from `channelId + userId`.)
- Handle the immediate UI update with **component-level optimistic state**. On failure, revert the
  switch and raise a destructive toast (the same pattern as the existing `handleLeaveRoom` /
  `handleDeleteRoom`).
- The work is confined to `apps/web`. `libs/data` is not touched.

**Out of scope**

- `notify = 'mention'` — the mobile toggle exposes on/off only (`all` / `none`).
- A desktop-style local preference store (`useNotificationPrefsStore`) — unnecessary in apps/web, which
  has no client notifier.
- Server-side push gating (this assumes the backend honours `join.notify` and filters pushes).
- A toggle for self chat — the notification toggle already renders only on non-self channels.

## Alternatives

- **Add a local preference store, mirroring desktop** — apps/web does not draw its own notifications,
  so there is nothing to gate immediately. Trusting the server (`join.notify`) is enough, and a store
  would be over-engineering. Rejected.
- **Use the channel-embedded `channel.$join?.notify` as the initial source** — the `$join` on a channel
  row is a lagging projection and can be staler than the stream. Observing the join cache directly
  (`useMyJoin`) is more accurate and shares a source with `updateJoin`'s optimistic write, so
  re-syncing stays consistent. Rejected.
- **Rely on the join stream alone for immediate feedback** — `updateJoin`'s optimistic write does reach
  the join cache and the stream re-emits, but a tick later, so component-level optimistic state covers
  the on-screen update.
- **Add a notify-specific path to `libs/data`** — the existing `updateJoin` already handles both nick
  and notify. Duplication, so rejected.

## Consequences

- What is gained: muting a chat room persists on the server and survives reopening and moving between
  devices. It is implemented with no data-layer change and a minimal surface.
- Trade-offs:
    - The accuracy of the initial state depends on when the join cache hydrates. A channel whose join
      row has not loaded shows as "on" by default and is corrected when the stream arrives.
    - Whether notifications are actually suppressed depends on the server honouring `join.notify`. The
      front end is responsible only for storing the state.
    - [ADR-0015]'s statement that the notification toggle is UI-only is replaced by this ADR (for that
      decision only).
