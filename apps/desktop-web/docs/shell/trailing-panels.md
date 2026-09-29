# Trailing panels

The thread, Mentions, Saved, channel settings, profile and debug panels all sit on the right of the
chat, one at a time. `HomePage` picks which one is open and passes it to `DesktopLayout` as `panel`.
Each panel is built on `ResizablePanel` (`shared/components/ResizablePanel.tsx`).

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

## The sidebar drawer

Below `NARROW_SHELL_WIDTH` (860px) the sidebar is a drawer beside the rails: `role="dialog"`,
`aria-modal`, with the chat `inert` and a scrim behind it. Picking a channel closes it.

## Opening a panel on a section

`useChannelSettingsStore.open(channelId, 'members')` opens the settings panel on its member list. The
header's member chip does this: it reads as the member list, so it opens there rather than at the top
of the settings.
