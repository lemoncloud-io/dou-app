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

`HomePage` records the origin before it moves anyone. That covers search, Saved, Mentions and a
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

The feed sets its "at the bottom" state from the real scroll metrics after a jump lands. Before that
fix, a page that arrived just after a landing tailed the reader down to the latest, away from the
target.

## Labels

The bar, the Quick Switcher and search name rooms the way the sidebar does. See
[room-names.md](./room-names.md).
