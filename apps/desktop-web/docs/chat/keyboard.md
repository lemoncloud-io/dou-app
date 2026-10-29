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
- Only the current row's controls, and its block's author name, are in the tab order (a webhook block
  has no name stop: its sender is plain text, see [webhook-messages.md](./webhook-messages.md)). Every
  other control in the feed is parked at `tabIndex=-1`, with its own tabindex kept in `data-roving-parked`
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
snapshot reads as the sidebar previews it ("File", "Photo", "3 files"), the line a saved item keeps
for a message with no text ([saved.md](./saved.md)). A row still in flight or failed has no reactions, Reply or Save, so without text it
has no toolbar; a deleted row never has one.

## Hover-revealed controls

A control that waits for hover (an image's save bar, the tray's "×") uses `hoverReveal(scope)` (`shared/utils/hoverReveal.ts`) under a `group/<scope>` parent:

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
- The image viewer steps with ←/→ only when no control inside it has handled the key. The arrows
  still step while the photo is zoomed; zoom is the wheel and a double-click, not the arrows.

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
  channel switch does not move focus. The request is made when the server answers, about a second
  after the confirm, and the row leaves the list before that, so the reader may already be in the
  next room with its More menu open. The composer does not take focus from an open menu or dialog
  (nor from a field being typed in), or the menu would close under the pointer; a dialog that is
  closing gives way. The one exception is a removal from a sidebar row in the open drawer: `<main>` is `inert` behind the drawer, so the focus call does nothing, the request is
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

## Cloud and place by number

⌘0 (Ctrl+0 off macOS) goes to Home and ⌘1…⌘9 to the clouds after it, Shift+1…Shift+9 to the place
tiles. Both are read in the order the rail draws them — Home first in the switcher whatever was stored,
then the device's stored order — so a number means the row the reader is looking at, including after a
cloud or place was dragged somewhere else (`useRailShortcuts`, `features/chat/hooks/`).

- **Home is 0, not 1.** It is the fixed return row every cloud comes back through and the one row
  nobody goes to on purpose, so it takes the key outside the count and leaves 1…9 for the clouds —
  nine of them rather than eight. A place has no such row, so its numbers start at 1.
- The listener is mounted by `HomePage`: the rails are the only place a cloud or place is chosen, and
  the numbers need both lists.
- A number past the end of either list does nothing and does not take the key. On Home, where the one
  place tile is not a place switch, no place number does anything.
- A switch in flight locks the keys along with both rails. A socket that has not verified yet locks the
  keys and the cloud rows — a switch sent over a half-open socket fails without saying why — while the
  place tiles still take a click, so a place number can be ignored while its own tile would not be.
- A cloud its subscription no longer keeps open is not entered: its number shows the same mobile-app
  toast its row does. The cloud already open is left alone.
- **Shift+digit is a character.** In a text field it types ("!" for 1), so a place chord never fires
  there; a cloud chord types nothing, so it works from the composer too. On the page, Shift+digit does
  not start a message the way a letter does — it is the place chord. Neither chord fires over a dialog
  or an open menu, which own the keyboard while they are up. The one `role="dialog"` that is not
  counted is the sidebar drawer: in the compact layout the rails are inside it, so treating it as an
  overlay would take the keys away exactly where the tiles they name are drawn.
- **A room opened by a number keeps the reader's keys.** Opening a room normally drops the caret in
  its composer (`ChannelDraftPlugin`), which is what a click there wants; a chord user is stepping
  through the rail, and the next Shift+digit would type into that box instead of moving. The chord
  asks the room it opens not to take the caret (`useComposerFocusStore.skipNext`), and `HomePage`
  drops the request when the switch settles so it cannot leak onto a click that comes later. A
  switch can land on more than one room, so the request holds for the whole switch rather than being
  spent on the first one.
- On macOS the app menu's Reset Zoom gave up its ⌘0 accelerator for this — the menu registers an
  accelerator before the page sees the key, so it would have swallowed Home. The item still resets the
  zoom when clicked.

## Announcements

- The viewer says the new position when you step.
- The tray says what joined or left.
- Failure lines under a message ("Not delivered", a failed reaction, a failed edit or delete) are
  `role="status"`.
