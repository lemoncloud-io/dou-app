# Keyboard and focus in the chat

How a keyboard or screen-reader user moves through the room: the feed's tab order, which control owns
a key, where focus goes when something closes, and controls that wait for hover.

## The feed is one tab stop

`useRovingFocus` (`shared/hooks/useRovingFocus.ts`) runs on the feed (`MessageList`). ADR-0132 records
the decision.

- Each message row is a `data-roving-item` rendered with `tabIndex={-1}`, and each author block
  (`MessageRow`) is a `data-roving-group`. The hook keeps one row at `tabIndex=0`: the newest, until
  the reader focuses one, then that one.
- ↑/↓ move between messages, Home/End go to either end, and Enter moves into the message's own
  toolbar (`data-row-actions`).
- Only the current row's controls, and its block's author name, are in the tab order. Every other
  control in the feed is parked at `tabIndex=-1`, with its own tabindex kept in `data-roving-parked`
  to restore. So Tab from the current message walks its reactions, thread link and images, and then
  leaves the feed.
- The hook writes tabindex on the DOM, not through React, so moving the stop re-renders nothing.
- The avatar button is out of the tab order. The name beside it opens the same card.

Before this, every message and every button in it was a tab stop. At 1024px the composer was stop 161
of 163; now the whole page has 44 stops and the feed 2.

The message toolbar is `inert` unless its message is hovered, focused, or has something open (the
emoji grid, the delete dialog). Whether the device can hover is a live media query
(`useMediaQuery('(hover: hover)')`). It used to be read once at import.

## Hover-revealed controls

A control that waits for hover (an image's save bar, the tray's "×", a Mentions or Saved row's
actions) uses `hoverReveal(scope)` (`shared/utils/hoverReveal.ts`) under a `group/<scope>` parent:

- It is hidden only where the device can hover. On touch it is always shown.
- It shows while the pointer is over its group, or while focus is anywhere inside the group.

The message toolbar keeps its own rules, because it also slides in and has to stay up while something
it opened is on screen. The grouped timestamp in a message's left gutter shows on hover and on focus.

## One key, one layer

- `useEscapeClose` (`shared/hooks/useEscapeClose.ts`) closes a panel on Escape, but not an Escape that
  something above it already handled (`defaultPrevented`). Escape in the inline message editor
  cancels the edit and used to close the thread panel as well.
- The image viewer steps with ←/→ only when no control inside it has handled the key.

## Focus when something opens or closes

- **Dialogs** (every ui-kit `Dialog` and `AlertDialog`) return focus to whatever held it when they
  opened (ADR-0131; `libs/ui-kit/README.md`). This covers the Quick Switcher, search, the viewer and
  every confirm.
- **Trailing panels** take focus when they cover the chat, and return it to their opener when they
  close. See [`../shell/trailing-panels.md`](../shell/trailing-panels.md).
- **The thread's reply box** takes focus when a thread opens, unless the reader is typing somewhere
  else. A thread can open seconds after the click, once its channel has loaded.

## Next unread

Alt+Shift+↓ and Alt+Shift+↑ open the next or previous channel with unread, wrapping around
(`useNextUnreadShortcut`, `features/chat/hooks/`).

- The order is the sidebar's drawing order without its filter: favourites, then channels, then DMs.
  `ChannelList` writes it to `useSidebarOrderStore`, and the shortcut reads it there. The list unmounts
  while the narrow-window drawer is shut, and the shortcut still has to work.
- Muted channels (any mode but "all") are skipped.
- Inside the sidebar, the same chord reorders the focused row. That handler runs first and claims the
  event.
- The shortcut ignores the chord inside a dialog, and inside a text field other than the composer. On
  macOS, Option+Shift+↑/↓ extends a selection there.

The shortcut sheet (`ShortcutsDialog`) lists both uses of the chord and where each applies.

## Announcements

- The viewer says the new position when you step.
- The tray says what joined or left.
- Failure lines under a message ("Not delivered", a failed reaction, a failed edit or delete) are
  `role="status"`.
