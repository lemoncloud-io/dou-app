# ADR-0219: The desktop navigates by a nav rail, and its inbox gathers four sources on the device

> Status: Accepted, decision 5 partly superseded by [ADR-0252](./0252-desktop-threads-page.md) · Decided: 2026-10-20 · Implemented: `feat/desktop-nav-rail` and the PRs stacked on it
> · The nav rail and rails (decisions 1–3) land first; the inbox (decisions 4–5) lands with the Notifications pull request
> · Scope: `apps/desktop-web` — `DesktopLayout`, `HomePage`, `NavRail`, `AccountMenu`, `useNavStore`
> · The module docs are [apps/desktop-web shell](../../apps/desktop-web/docs/shell/nav-rail.md)

## Context

The desktop shell had two rails (clouds, then places), one sidebar that mixed every kind of room, and
three trailing panels opened from rows at the top of that sidebar: Mentions (the activity inbox),
Saved, and the My-threads list. The new desktop design replaces this with one rail for clouds and
places, a nav rail with four destinations (Home, Notifications, Channels, DM), and a sidebar column whose
content follows the destination. In the design, Notifications is a full inbox with five tabs (all,
channel, DM, thread, mention), and Saved is a page in the main area.

Two facts constrain how this can be built:

- The panels are not routes. Which one is open is store state, and the shell is a single "/" route.
- The inbox is device-local. The server has no notification list, and the existing one (`useMentionsStore`)
  holds only messages that mention the reader. It is filled from `useChannelChatFeeds`, which reports each
  channel's newest message once its number moves.

## Decision

1. **The destination is store state.** `useNavStore` holds `home | notifications | channels | dm`. It is
   not persisted, so the app opens on Home. No route is added.
2. **Two rails, both 80px.** The cloud switcher and the place tiles share the first rail, and the nav rail
   is the second. `DesktopLayout`'s drawer and compact behaviour already count rails, so they keep working.
   The account menu moves to the bottom of the nav rail.
3. **A destination appears only once its screen exists.** The rework lands in several pull requests.
   The rail lists only the destinations that are built, so no release shows a tile that opens nothing.
4. **The inbox stays on the device and takes four sources:** mentions of the reader (direct and
   everyone), new DM messages, replies in the reader's threads, and reactions to the reader's messages.
   Ordinary channel messages are not collected. Everything comes from the feeds the desktop already
   reads, with no new server call. It extends `useMentionsStore` with a `kind` instead of starting a
   second store, and an item with no `kind` reads as a direct mention, so nothing persisted is lost.
5. **The My-threads list becomes the inbox's Threads tab**, and its panel and sidebar row go away.

## Alternatives

- **Routes per destination** (`/notifications`, `/channels`). Rejected: the shell would mount and unmount
  with the route, so the open conversation, the drafts' focus and the trailing panels would reset on every
  nav click, for a deep link no surface needs today.
- **Keep two separate rails and add the nav rail as a third.** Rejected: three 80px rails take 240px, and
  together with the sidebar and the conversation floor that does not fit the narrow docked width. The
  design also shows one rail.
- **A server-backed notification list.** Rejected for now: it needs a new API, and this rework is
  renderer-only. The device-local inbox keeps the existing limits — it does not follow the account to
  another device, and a burst of messages shows only its newest.
- **A second store for the new kinds.** Rejected: the panel would have to merge two stores for every
  tab, and the read-cursor sync (`markChannelRead`) would have to be kept in step twice. The price of one
  store is that every mention-only reader (the `@` marker on a row, the mentions-only place badge, the
  unread mention count) must filter by kind.

## Consequences

- The cloud tiles' right-click menu and drag reorder become items in the cloud switcher's dropdown. The
  stored order is still honoured, but it can no longer be changed by dragging.
- The inbox shows more than it did, so its cap grows from 200 items to 500.
- Reactions depend on the feed reporting a background reaction. Where it does not, reactions are left out
  of the inbox rather than fetched.
