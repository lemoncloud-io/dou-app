# ADR-0083: move desktop favorites to `ui.pinnedChannels` (place-scoped), and clear it on logout

> Status: Accepted · Decided: 2026-09-11 · Implemented: `3a65fef9` · `ec59ca7b` · `c50dd01e` · `6f12d9ac` ·
> `3fd4604a` · `0879cb5a` · `3bbf995c` · `0cc9106e` · `45f1664c` · `278f213e` · `14c8100`
> Scope: `libs/shared/src/preferences/**` · `libs/config/src/registry/ui.ts` ·
> `apps/desktop-web/src/app/features/chat/components/{ChannelList,SortableSection,ChannelRowMenu}.tsx` ·
> `apps/desktop-web/src/app/shared/{hooks/useAccountResetOnLogout.ts,utils/migrateLegacyFavorites.ts}` ·
> `apps/web/src/app/stores/**`
> Related: [ADR-0079](./0079-config-registry-and-lane-resolver.md) (`ui.*` records · lane), KB
> dou-app-place-list-ordering

## Context

desktop-web's sidebar is getting favorites (pins), drag reordering, and a row context menu. Where
favorites are stored turned out to be the problem.

- desktop had its own `useFavoriteChannelsStore` (`chatic-favorite-channels`, zustand persist) — exactly
  what the CLAUDE.md twin rule forbids: a separate twin of apps/web's pins, with no ordering, so it
  couldn't combine with sorting.
- apps/web's pins, by contrast, already live in `ui.pinnedChannels` (config registry, place-scoped,
  ordered array). One array per `placeScopeKey(cloudId, siteId)` — ordering comes for free as "pin array
  order = display order."

## Decision

### 1. Desktop favorites read `ui.pinnedChannels` — the twin is deleted

`usePinnedChannels(scope)`, `setChannelPinned`, and the parser move up into `libs/shared/src/preferences/`,
and apps/web imports from there (behavior unchanged). desktop's `useFavoriteChannelsStore` is deleted. The
favorites section uses the pin array's order as its display order, as-is.

### 2. Channel order is stored in `ui.channelOrder` (config registry, place-scoped JSON)

`applyChannelOrder(ids, stored)` = stored ids that still exist, in stored order, plus the rest by name.
`moveChannel` prunes ids that no longer exist. Per-section (Channels/DMs) DnD only rewrites its own slice
of the array, and reordering favorites writes directly into the `ui.pinnedChannels[scope]` array. New
channels go to the end in name order, and deleted channels are pruned on the next write — no separate
reset UI exists in v1. Pins are the exception: reordering only accepts the order of pins currently visible
on screen, and a pin temporarily absent from the list (re-entry, sync lag) keeps its place
(`setPinnedChannelOrder`). The only path that removes a pin is unpinning (`toggle`).

### 3. Legacy favorites are lazily migrated the first time a place is seen

Since the old id carries no place information: only ids present in that place's channel list are moved
into scope (append, dedupe), and the rest stay in the old key so other places still get a chance to
migrate. Logout still clears `chatic-favorite-channels` too — this stops un-migrated leftover ids from
leaking into the next account (a deliberate divergence from the plan checklist's "remove the old key,"
since the spec's logout invariant takes priority). An empty key is deleted; broken JSON is silently
dropped.

### 4. Logout clears `ui.pinnedChannels`/`ui.channelOrder`

`config.clear(..., { lane: 'local' })` clears both the stored key and the in-memory lane value together.
This stops pins/order from leaking to the next account on a shared place. apps/web is not cleared — for
web, logout is not the same as a reload, and the plan's decision (Decision table, "Logout: clear both
config keys") applies to desktop only.

### 5. The context menu is one instance per sidebar, not one per row

`ChannelRowMenu` records `menuTargetId` when it opens, and the dialogs (Rename/AddMembers/Confirm) render
exactly once on `ChannelList`. `onRemoved` clears the selection **only when the removed row is the
currently open channel** — leaving a background channel keeps the chat window open (fixed by the unified
spec).

## Alternatives

- **Keep desktop's zustand plus a conversion layer**: the twin remains, and order storage still needs a
  second copy. Rejected.
- **Preserve favorites across logout**: reduces divergence from apps/web, but leaks across accounts on a
  shared place. Rejected.
- **A global migration (bulk, at startup)**: rejected because the channel list differs by place — lazy
  migration is what resolves id↔place correctly.

## Consequences

- Notify-mode interpretation (`channelNotifyMode(state, id, joinNotify?)`), pins, and ordering are all
  consolidated into `libs/shared`/config — different surfaces, one record.
- Display order is now a client record instead of the server's, so if a server `channel` order field ever
  appears, only the reader needs to change.
- Trade-off: pins/order are lost on every logout (intentional — assumes a shared device). This ADR
  documents that its behavior differs from web.
