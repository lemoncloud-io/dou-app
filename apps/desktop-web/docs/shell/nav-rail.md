# Nav rail

The rail between the place tiles and the sidebar column (`NavRail`). It decides what the sidebar
shows for the active place: **Home**, **Notifications**, **Channels** or **DM**. The account menu is
pinned to its bottom.

## Destinations

The open destination lives in `useNavStore` (`src/app/shared/stores/useNavStore.ts`). It is session
state, not a route: "/" stays the single shell, and the app opens on Home. A trailing panel or the open
conversation does not change when the destination does. Picking a destination swaps only the
sidebar.

A destination is drawn only once its screen exists. `HomePage` passes the list (`NAV_ITEMS`), so the rail
never offers a tile that would open an empty column.

| Destination | Sidebar                                                              |
| ----------- | -------------------------------------------------------------------- |
| Home        | The place's sections: Saved, Favorites, Channels, DM (`ChannelList`) |

### The Home sidebar

Under the place title and the channel search, a hairline, then **Saved** leads the action rows
(`SidebarHeader`). The place's own actions follow it: edit my profile, notification snooze, Threads
and Mentions. Threads and Mentions leave once the Notifications destination takes them over.

The sections below (`ChannelList`, `SortableSection`) are Favorites, Channels and DM. Each section has
its title, then the fold chevron, with any "+" at the far end. Without a search filter, all three are
always drawn. An empty section says what goes there in one line (`sidebar.empty.*`), so a place with
no rooms shows three headings, not a blank column. The 1:1 section on the Home cloud is the exception:
it shows the mobile-app pointer instead
([direct-messages.md](../chat/direct-messages.md)). A search shows only the sections it matched, and
"no matches" when it matched none. A folded section hides its empty line too.

## The tiles

A tile is a 44px icon box with its label under it. The open one has a tinted fill (`bg-primary/[0.24]`),
a heavier icon stroke and a bold label. It carries `aria-current="page"`. A destination with something
unread gets a red dot (`bg-badge-unread`), and its accessible name says so (`nav.unread`), because a dot
alone is not read out.

## Width

Both rails are `width.rail` (80px, `tailwind.config.js`). `AppShellSkeleton` draws the same two rails,
and `usePanelWidth` counts them in its budget (`RAIL_WIDTH`). Change all three together, or the boot
skeleton jumps and the panels can squeeze the conversation under its floor.

Below `NARROW_SHELL_WIDTH` the sidebar becomes a drawer that opens beside the docked rails. Below
`COMPACT_SHELL_WIDTH` the nav rail joins the cloud and place rail inside the drawer, as described in
[trailing-panels.md](./trailing-panels.md#the-sidebar-drawer).

## Account menu

The avatar at the bottom of the rail (`AccountMenu`) opens profile, account, join with invite (guests,
and accounts linked to the device guest), settings, the debug overlay when debug mode is on, and log
out. Logging out of a guest is a delete, so it asks first and offers to connect an account instead.

The hidden debug-mode gesture (seven taps on the divider between the cloud switcher and the place tiles) stays with the place
tiles. Only the menu moved.
