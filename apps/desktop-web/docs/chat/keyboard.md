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

A row gets a toolbar only when it has something to draw, and `MessageRow` decides that from the same
three flags the toolbar renders from: reactions (any settled row), Reply (a settled row where the feed
passes `onOpenThread`), and the "More" menu (the row has text, it is a settled row with attachments,
or it is mine to edit or delete). A file or photo sent without text gets "More" in the main feed and
the thread panel alike, for Save for later: someone else's holds that one item, since there is no
text to copy or edit and the row is not mine to delete; mine adds it to Edit and Delete. Its saved
snapshot reads as the sidebar previews it ("File", "Photo", "3 files"), because the Saved pane shows
only that text. A row still in flight or failed has no reactions, Reply or Save, so without text it
has no toolbar; a deleted row never has one.

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
  cancels the edit and used to close the thread panel as well. The editor takes the key itself, from
  the body, a toolbar button or Cancel alike; an Escape the emoji picker or the mention list took
  arrives already handled and cancels nothing.
- The image viewer steps with ←/→ only when no control inside it has handled the key.

## Focus when something opens or closes

- **Dialogs** (every ui-kit `Dialog` and `AlertDialog`) return focus to whatever held it when they
  opened (ADR-0131; `libs/ui-kit/README.md`). This covers the Quick Switcher, search, the viewer and
  every confirm.
- **When that opener is gone**, focus goes to the room's message box instead. Onboarding opens from
  state with nothing focused, and Add Members can outlive its opener (the intro's actions leave once
  the channel has messages, a menu item leaves with its menu). Their `onCloseAutoFocus` is
  `focusComposerIfDropped` (`shared/utils/composerFocus.ts`): it waits a microtask so the opener
  return runs first, and acts only if focus is still on `<body>`.
- **The message editor** takes focus when it opens, with the caret at the end, and gives it back to
  the message row it was opened on when it closes by save or cancel. The row is the feed's roving
  item, so the arrow keys carry on from there and typing a letter goes to the room's message box.
- **After a channel is deleted or left** (header menu, settings panel or sidebar row), the confirm
  has already closed and the room it returned focus to is gone. `useChannelActions` leaves a
  one-shot request in `useComposerFocusStore`, keyed by the removed channel, and `ChatPane` spends it
  on the first room it shows that is not that one — its composer takes focus. With no room left, the
  empty state's create/join button takes it. Either way the request is used once, so a later plain
  channel switch does not move focus. The one exception is a removal from a sidebar row in the
  open drawer: `<main>` is `inert` behind the drawer, so the focus call does nothing, the request is
  still spent, and focus stays where the drawer leaves it.
- **A failed place-profile save** puts focus back on the nickname field: the save disabled the field
  and both buttons, so the control that held focus went dead.
- **Trailing panels** take focus when they cover the chat, and return it to their opener when they
  close. See [`../shell/trailing-panels.md`](../shell/trailing-panels.md).
- **The thread's reply box** takes focus when a thread opens, unless the reader is typing somewhere
  else. A thread can open seconds after the click, once its channel has loaded.
- **A returned focus does not open a hint.** `Hint` skips a focus that came from no element on the
  page, which is what a dialog or menu handing focus back after it has gone looks like (and a window
  regaining focus). Without this, "Search messages" stayed up over the header button after the
  search closed. Tab always comes from an element, so a keyboard user still gets the hint.

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
