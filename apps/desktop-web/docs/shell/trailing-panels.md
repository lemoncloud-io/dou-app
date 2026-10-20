# Trailing panels

The thread, Saved, channel settings, profile and debug panels all sit on the right of the
chat, one at a time. `HomePage` picks which one is open and passes it to `DesktopLayout` as `panel`.
Each panel is built on `ResizablePanel` (`shared/components/ResizablePanel.tsx`).

## One owner, except the profile

`useTrailingPanelOwners` (`features/chat/hooks/`) holds the rule. Thread, settings and Saved are
exclusive: opening one closes the others, and the last one opened wins. Mentions and the threads
list are not trailing panels any more: the inbox is the nav rail's Notifications destination, in the
sidebar column ([inbox.md](../chat/inbox.md#the-panel)), so it stays beside a thread it opens.

The profile stacks instead. It opens from inside another panel, a mention in a thread or a member in
the settings list, to check who someone is. So it shows over that panel without closing it, and
closing the profile shows the panel underneath again. It used to close the thread, and a reader who
stopped to check a name lost the conversation they were in. Opening any other panel from the profile
closes both, as before.

The panel underneath is remounted, not kept alive: a hidden panel would still answer Escape. The
thread's reply box keeps its draft (drafts live in `useComposerDraftStore`) and takes focus again,
but its scroll position starts over.

## Width

Every panel opens at `PANEL_WIDTH` (360px), and each kind remembers its own drag under its own
storage key. They used to open at 320, 384 or 440 depending on the panel. `usePanelWidth` clamps a
drag so the chat column keeps `MIN_CHAT_WIDTH` (420px), counting the rails and the other open panels.

## Docked or covering

From `PANEL_DOCK_WIDTH` (1280px, Tailwind's `xl`) up, a panel docks beside the chat. Below it, a panel
lies over the chat, and then it acts as the modal layer it looks like. ADR-0134 records the decision.

- `DesktopLayout` puts a scrim over the chat and makes the chat `inert`, so Tab and clicks cannot
  reach what is underneath.
- A click on the scrim closes the panel. The panel hands its `onClose` to the shell through
  `PanelShellContext`. A panel without an `onClose` (none today) would leave the scrim inert to
  clicks.
- The panel takes focus (the `<aside>` itself), unless its content already took it, as the thread's
  reply box does.

Before this, the chat under a covering panel stayed live, in the tab order and clickable, with about
218px of it showing at 1024px.

## The panel contract

Supplying `onClose` buys the whole contract, at any width:

- Escape closes the panel (`useEscapeClose`), yielding to any dialog or menu open over it.
- Closing returns focus to whatever had it when the panel opened. `ResizablePanel` reads that element
  on its first render, before any effect runs. An effect-time read ran after the panel's own focus
  move (and after its content's, for example the settings panel landing on its member list), so the
  panel recorded itself, which is gone once it closes, and focus fell to `<body>`.
- If that element has left the page by then, focus goes to the room's message box. A thread shown
  again under a closed profile recorded the profile's close button as its opener, and closing the
  thread later left focus on `<body>`.
- Only focus the panel took with it is given back. When focus already sits on a live element outside
  the closing panel, the panel replacing it put it there, and it stays.
- A channel switch does not pull focus out of an open trailing panel either. The room's message box
  takes focus on a switch, but a thread opened from the inbox into another channel can mount before
  that switch lands.

## The sidebar drawer

Below `NARROW_SHELL_WIDTH` (860px) the sidebar is a drawer beside the rails: `role="dialog"`,
`aria-modal`, with the chat `inert` and a scrim behind it. Picking a channel closes it.

Below `COMPACT_SHELL_WIDTH` (480px) the rails join the drawer: they are not drawn while it is shut,
and open with it, with the channel list taking the width that is left beside them. Rails and list
are one dialog there, so the cloud, place and nav tiles stay reachable to a screen reader that keeps to a
modal dialog. That drawer fills the window, so it has no scrim and closes by its close button, by
Escape, or by picking a channel. It is hidden rather than removed while shut, because the rails own
dialogs (rename, delete, sign out) that must outlive it. Docked, the two rails are 160px, which at 320px leaves the conversation too narrow for its own
header and composer. The desktop window cannot be made this narrow, so in the app this is what a
window zoomed far in gets.

## Opening a panel on a section

`useChannelSettingsStore.open(channelId, 'members')` opens the settings panel on its member list. The
header's member chip does this: it reads as the member list, so it opens there rather than at the top
of the settings.
