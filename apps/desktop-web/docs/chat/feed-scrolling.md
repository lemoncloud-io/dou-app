# Landing, following and the new-messages divider

How `MessageList` decides where the feed opens, when it follows the newest message, and when the
"New messages" divider appears and goes. Which rows are mounted is in
[feed-windowing.md](./feed-windowing.md); jumps to one message are in
[jump-and-return.md](./jump-and-return.md).

## Where a room opens

On the channel's first fill, the first of these that applies wins:

1. A notification click asked for the latest message (`openAtBottom`): the feed pins to the bottom and
   skips the divider. The reader was pinged about the newest message, not about the unread run.
2. There is a "New messages" divider: it is centred in the view.
3. No divider, but the channel was badged for replies: the oldest root with a reply the reader has
   not seen is centred (see [threads.md](./threads.md)). A reply takes a slot in the channel's unread
   count but is not a row of the feed, so without this the badge would lead nowhere.
4. Otherwise the bottom, pinned the same way as a notification open (see "Following the newest
   message").

Landing on the divider or a root re-centres it on every animation frame for 600 ms, for the same reason
the bottom is pinned: the window swaps estimated row heights for measured ones right after the first
scroll and carries a one-shot landing more than a screen off the row. The "at the bottom" state is
settled from where the view ended up, instead of waiting for the first scroll frame, and a later
re-measure does not pull a row landing down to the bottom until the reader scrolls.

The feed remounts per channel, so each room gets its own first fill; the pane around it does not, so a
send in an earlier room is not replayed as a send on the new room's first render. Under StrictMode's
mount, unmount and mount in development, the first fill runs again on the second mount.

Reader input on the feed (wheel, touch, pointer, keys, the jump-to-latest control) and a new jump stop
a running pin at once, so the reader is never pulled back for the rest of the 600 ms. While a pin runs,
reaching the top of the feed does not ask for an older page; the check runs once the pin ends or the
reader takes over, so a landing at the top of the page still pulls the page before it.

## The divider's baseline

`ChatPane` captures the read position when the channel opens: the larger of this device's cursor and
the channel's own `$join` cursor. It is captured during render, before the home screen's mark-read
effect advances the cursor, so the divider sits where the reader left off. It is captured again once
if the `$join` record arrives a render after the channel id flips and the first capture was 0.

The divider goes above the first message that is newer than the baseline and is not mine. "Mine" goes
through `isOwnMessage`, because the server rewrites my messages' `ownerId` from my account id to my
cloud id when they are stored; a plain id comparison would count my own messages as unread and pin the
divider above them. Join and leave notices never anchor it: landing on "new messages" to find a join
line is worse than the first real message below it.

## When the divider clears

`seenUpTo` is the number the divider is measured from. It only moves up.

- **Live reading.** A new message that arrives while the reader is at the bottom and the window is
  visible and focused moves `seenUpTo` with it, so no divider is raised. If the window is hidden, the
  divider is raised and the read cursor is held back too (the home screen advances it only while the
  window is visible and focused), so the sidebar badge and the divider agree.
- **Scrolling down into the bottom.** Only a genuine move from "not near the bottom" to "near the
  bottom" (within 80 px) clears it; a move during a pin, or within 100 ms after it, is not one. Opening
  a channel, a focus change and live-follow also land at the bottom, but they must not dismiss a
  divider the reader has not scrolled past. Clearing waits 1 s so
  the divider is seen first, then fades for 300 ms, then `seenUpTo` jumps to the newest persisted
  message. Scrolling back up before the timer fires cancels it; scrolling up mid-fade brings it back.
- **Refocusing the window** while at the bottom clears it on the same edge as the badge, so the two
  never disagree. A reader who is scrolled up keeps the divider as their jump anchor.
- **Sending** counts as being caught up: the divider clears after the same linger.

The newest number used here ignores optimistic rows (their placeholder `chatNo` is the largest
possible integer, and advancing to it would suppress every later divider).

## Following the newest message

- A new message while pinned to the bottom sets `scrollTop` directly. Scrolling a zero-height anchor
  into view lands a message-height short in this flex column.
- After the reader sends, and for every first fill that lands at the bottom, the feed pins to the
  bottom on every animation frame for 600 ms. A single scroll lands short: the list keeps reflowing for
  a few frames (the window swaps estimated row heights for measured ones, avatars load, text wraps, the
  optimistic row is swapped for the server's, an older page auto-fills), and each reflow nudges the
  viewport off the bottom. A room opened with one scroll used to settle more than a screen above its
  last message, so it read as scrolled up: new messages were not followed and raised the divider above
  them. These writes are instant jumps, so reduced-motion needs no branch.
- While the feed sits flush on the bottom (within 2 px at the last scroll), a row that is re-measured
  (a picture or a long message in a new row finishes laying out) puts the feed back on the bottom, so
  the newest message is not left half below the fold. A reader who nudged up, even inside the 80 px
  band, is left where they are.
- Scrolled up, the reader sees a jump-to-latest control. When messages from others have arrived since
  the bottom was last reached it becomes a filled "N new messages" pill (shown as "99+" past 99).
  Clicking it scrolls smoothly, or instantly under reduced motion: the `behavior` argument is a
  JavaScript value the stylesheet's reduced-motion override cannot reach.
- Scroll events fire many times per frame and each pass reads layout, so they are coalesced to one pass
  per animation frame.

## Paging older history

Near the top (within 120 px) the feed asks for an older page and remembers the scroll height and
offset, so when the page is prepended the viewport is put back and does not jump to the top. A feed too
short to scroll has no scroll-up to trigger a load, which is common in thread-heavy channels (most of
a 50-message page is replies the main feed hides), so it keeps pulling older pages until it overflows
or history ends.

Failures are shown so a room never reads as simply ended or empty:

- A failed first page shows the load error with a retry, not the channel intro. An empty list after a
  failed load is not an empty room; the intro would invite a first message into a room with history.
- A failed older page shows a retry row at the top. Scrolling retries it as well, but nothing else
  would show that it failed.

## Jump targets

A jump pages back at most eight times. If the target still is not found it says so with a toast; giving
up silently would leave the reader mid-history with no highlight. A return trip (`restore`) is a
reading position, not a message to find: back to "the latest", or to an anchor that is gone, ends at the
bottom, where the feed opens. The jump settles the "at the bottom" state at once instead of waiting for
the scroll frame, because a page that landed in between would still see "at the bottom", follow the tail
and carry the reader past the message they jumped to. The flash on a landed message lasts 3 s, the
same time the inbox keeps an opened item marked. Only the row block holding the target receives the
highlight prop, so a jump does not re-render the whole feed twice.
