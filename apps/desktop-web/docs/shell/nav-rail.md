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

| Destination   | Sidebar                                                              |
| ------------- | -------------------------------------------------------------------- |
| Home          | The place's sections: Saved, Favorites, Channels, DM (`ChannelList`) |
| Notifications | The inbox in tabs ([inbox.md](../chat/inbox.md#the-panel))           |
| Channels      | The place's channels by activity ([lists.md](../chat/lists.md))      |
| DM            | The place's 1:1s by activity ([lists.md](../chat/lists.md))          |

### The Home sidebar

Under the place title and the channel search, a hairline, then **Threads** and **Saved** lead the action rows
(`SidebarHeader`). Threads opens the Threads page in the main pane, with a dot while a thread has
unseen replies ([my-threads.md](../chat/my-threads.md#the-threads-page)). Saved opens the Saved items page in the main pane and stays marked while the page is
there ([saved.md](../chat/saved.md)). In a place with no conversation yet, Home's main pane is the welcome page
([onboarding.md](../chat/onboarding.md#the-place-welcome-page)). Edit my profile in this place follows it: the design drops that row, but nothing
else opens the place profile editor. Mentions, thread replies and the snooze live in the Notifications
destination.

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

The sidebar column keeps a width per destination: Home under `chatic.sidebar.width` (286px to
start), a list (Notifications, Channels, DM) under `chatic.navPanel.width` (420px to start). Both drag
between the same bounds. `DesktopLayout` takes the pair as `sidebarWidth`, and `usePanelWidth` swaps
to the new key's width before the frame is painted, dropping the old one from its budget so the
column is not counted twice.

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

The avatar draws my photo for the current place when I set one, else the account photo. A fresh
sign-in has no row of mine in the profile cache (the place-wide delta carries other members), so
`useSiteProfiles` reads it once with `profile.get-mine` as soon as the socket is verified; the photo
therefore shows on the home screen without opening the profile page first.

The hidden debug-mode gesture (seven taps on the divider between the cloud switcher and the place tiles) stays with the place
tiles. Only the menu moved.
