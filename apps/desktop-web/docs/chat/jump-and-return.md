# Jumps and the way back

A jump takes the reader to one message: a search hit, a saved item, a mention, a notification. The
feed scrolls to it, centres it and flashes it. The reader usually wants to come back afterwards, so
every jump first records where they were, and the feed offers "Back to #channel" until they go back
or move on. ADR-0130 records the decision.

## What is recorded

`useMessageJumpStore` (`shared/stores/useMessageJumpStore.ts`) holds three things:

- **`target`**: the message to scroll to, a `restore` flag, and a nonce. The nonce counts every
  request in the session, so a second jump to the same message still fires. It used to count from the
  current target, which is emptied once a jump lands, so the second jump in an open channel reused a
  spent nonce and did nothing.
- **`origin`**: the return point. It holds the cloud, the place, the channel, the first message that
  was in view (`anchorChatNo`, null when the reader was at the latest), the open thread's root, and a
  display label taken when the point was recorded. The origin may sit in a list that is no longer
  loaded by the time the reader goes back, so the label is not looked up again.
- **`position`**: what the feed reports while the reader scrolls. `firstVisibleChatNo`
  (`features/chat/utils/firstVisibleChatNo.ts`) binary-searches the rows for the first one in view.
  An unchanged position does not notify, because this is written on every scroll frame.

`originFor` (`features/chat/utils/jumpReturn.ts`) builds the origin. It uses the reported position
only when it belongs to the channel being left.

## Who records it

`HomePage` records the origin before it moves anyone. That covers search, Saved, the inbox and a
notification. A jump inside the open channel records one too (`sameChannel`), because "scroll up to
check, then come back down" is the same round trip.

Moves that are not detours retire the origin instead: a click on the cloud or place rail, a pick from
the channel list, and a pick from the Quick Switcher. The bar's return point is one level deep: a
second jump replaces the first. Back itself goes further, through every room the reader moved
between; see [Back and Forward](#back-and-forward).

## When the bar shows

`shouldOfferReturn` shows "Back to …" when the reader is somewhere other than the origin. There are
two exceptions:

- The origin is in the open place, but its channel is no longer listed (the reader was removed from
  it), so there is nowhere to send them.
- The reader is back in the origin channel by some other route. That counts as having returned, except
  after a same-channel jump, which never left it.

An origin in another cloud or place is offered without checking that its channel still exists.

## Going back

`returnRoute` picks one of three routes:

| Route          | When                                         | What happens                                      |
| -------------- | -------------------------------------------- | ------------------------------------------------- |
| `switch-cloud` | the origin is in another cloud               | switch cloud, then place, then select the channel |
| `switch-place` | same cloud, another place                    | switch place, then select the channel             |
| `select`       | same place (or the origin recorded no place) | select the channel and request a `restore` jump   |

A `restore` jump is the second half of a round trip, and the feed treats it differently from a jump:

- The anchor goes to the **top** of the view, where it was, and it is not flashed.
- A null anchor, or an anchor that is no longer loaded, lands at the **bottom**, with no "message not
  found" toast and no paging back through history. The latest is where a channel opens anyway.
- The thread that was open reopens; otherwise the thread panel closes.

A loaded target that sits outside the feed's mounted window is first scrolled into it and retried; see
[feed-windowing.md](./feed-windowing.md).

The feed sets its "at the bottom" state from the real scroll metrics after a jump lands. Before that
fix, a page that arrived just after a landing tailed the reader down to the latest, away from the
target.

## Back and Forward

Back and Forward step through the rooms the reader moved between on home, the way a browser steps
through pages. Back is Mod+[ (⌘[ on macOS, Ctrl+[ elsewhere), the mouse's side back button, the
three-finger trackpad swipe Electron reports as `left`, and Go → Back in the menu bar. Forward is
Mod+], the side forward button, the swipe reported as `right`, and Go → Forward. ADR-0340 records the
decision; it replaced the "one level, no stack" rule this bar started with.

- **What is recorded.** `useChannelHistory` (`features/chat/hooks/`) watches the open room rather than
  each way of opening one. The sidebar, the Quick Switcher, the rails, the unread chord, a jump and a
  notification all end in the selection changing, and when it changes the room left goes on Back as a
  whole reading position: cloud, place, channel, the first message in view, the open thread. A new
  move clears Forward. Opening or closing a thread is not a step; the thread is part of the position.
- **What is not recorded.** A step's own landing, and the rooms an open passes through on its way: a
  pending open after a place or cloud switch can select another room first, and that room is a stop
  on the way, not somewhere the reader went. Once an open has landed, any room other than the step's
  means the reader moved on their own before it arrived, and that records like any move.
- **Which place a room is in.** While a switch lands, the open place's list no longer has the room
  being left, so that room keeps the place it was in; it is not moved to the place being entered. The
  self room is the exception that goes the other way: every place lists it under one id, so moving
  between places on it is a move.
- **What a step does.** `stepHistory` (`features/chat/utils/channelHistory.ts`) takes the next entry
  and puts the room the reader is in on the other stack, so the opposite press returns. A room in the
  open place that is no longer listed (the reader was removed) is passed over and dropped, as is the
  room the reader is already in, so one press always moves. The entry opens through the same routes
  as the bar (switch cloud, switch place, or select) as a `restore`.
- **The bar is Back made visible.** A jump to another room changes the selection, so the room it left
  is the last entry on Back, and the bar's "Back to …" is that step. While the bar shows, Back always
  does what the bar says: when the last entry is not the bar's room (a jump inside one room, or one
  whose leaving history did not record), Back takes the jump's own way back instead, so the key and
  the bar never disagree.
- **It lasts for the session.** `useChannelHistoryStore` outlives a trip to Settings and back, which
  unmounts home. A reload starts it empty, and signing out reloads. Fifty entries are kept each way.
- **One press, two listeners.** Every input calls `pressHistory`, which counts a press and its
  direction in `useHistoryRequestStore`. The router's `useHistoryNavigation` answers it on every page
  other than home by stepping through pages (going home when the page was the first one shown, read
  from React Router's `history.state.idx`, which a reload keeps). On home, `HomePage` answers it
  with the channel history. Each listener counts only the presses made after it mounted, so the press
  that brought the reader home from Settings is not spent again on a channel step.
- **The keyboard and the mouse are bound in the page.** Chromium hands the side buttons to the page on
  every desktop OS, so the shell does nothing with them; answering them in both places would step
  twice. The swipes and menu items exist only in the shell, which sends them as `chatic-ui:back` and
  `chatic-ui:forward` deeplinks on the same event as its other menu links.
- **Nothing happens while a dialog or menu is open.** A step would move the page out from under it;
  Escape closes it first.
- **The swipes need a macOS setting.** Electron reports them only when System Settings → Trackpad →
  More Gestures → "Swipe between pages" is set to "Swipe with two or three fingers". The default
  two-finger swipe scrolls, and no press arrives.

## Labels

The bar, the Quick Switcher and search name rooms the way the sidebar does. See
[room-names.md](./room-names.md).
