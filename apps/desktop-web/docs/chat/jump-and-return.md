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
the channel list, and a pick from the Quick Switcher. The return is one level deep. A second jump
replaces the first return point, as a single Back button would.

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

## The Back press

The bar is not the only way back. A Back press takes the same route: Mod+[ (⌘[ on macOS, Ctrl+[
elsewhere), the mouse's side back button, the three-finger trackpad swipe Electron reports as `left`,
and Go → Back in the menu bar. It is still one level deep. A press with no bar showing does nothing on
home, and there is no Forward.

- **One press, two listeners.** Every input calls `pressBack`, which counts a press in
  `useBackRequestStore` (`features/chat/stores/`). The router's `useBackNavigation`
  (`features/chat/hooks/`) answers it on every page other than home by stepping back a page, or by
  going home when the page was the first one shown. On home, `HomePage` answers it with the bar's own
  action. "The first one shown" is read from the entry number React Router keeps in `history.state`
  (`idx`), not from the location's key, which a reload keeps and a replace renews. Each listener
  counts only the presses made after it mounted, so the press that brought the
  reader home from Settings is not spent again on the jump return.
- **The keyboard and the mouse are bound in the page.** Chromium hands the side button to the page on
  every desktop OS, so the shell does nothing with it; answering it in both places would go back
  twice. The swipe and the menu item exist only in the shell, which sends them as a `chatic-ui:back`
  deeplink on the same event as its other menu links.
- **Nothing happens while a dialog or menu is open.** Going back would move the page out from under
  it; Escape closes it first.
- **The swipe needs a macOS setting.** Electron reports it only when System Settings → Trackpad →
  More Gestures → "Swipe between pages" is set to "Swipe with two or three fingers". The default
  two-finger swipe scrolls, and no press arrives.

## Labels

The bar, the Quick Switcher and search name rooms the way the sidebar does. See
[room-names.md](./room-names.md).
