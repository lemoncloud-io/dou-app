# Feed windowing

The room's message feed (`MessageList`) mounts only the rows near the viewport. A 500-message channel
used to mount 500 rich-text and Block Kit subtrees, and every live-tail tick reconciled all of them.
Now the rows outside the window unmount, and two spacers keep the scrollbar the height the whole feed
would be.

## The window

`windowForViewport` (`feedWindow.ts`) picks the first and past-the-end row to mount: every row that
overlaps the viewport plus 800 px of overscan above and below, so a fast scroll stays covered.

- Each mounted row reports its height through a `ResizeObserver`. A row that has never been mounted
  uses the running average of the measured ones (120 px before anything is measured).
- Spacer heights are prefix sums over those heights, with the 8 px inter-row gap folded in. The gap is
  rem-based, so the sum can be off by a pixel under zoom; the overscan absorbs it.
- The spacers are `shrink-0`. The feed is a flex column, and an empty div in it shrinks to 0 px as soon
  as the content overflows, which would drop every unmounted row from the scroll height.
- Before the first real layout — first paint, a hidden tab, or a test, where jsdom has no layout — the
  whole feed is mounted, exactly as before windowing. Landing refs and existing tests see every row.

## Holding the reading position

When a row above the viewport changes height (an image finishes loading in the overscan, a row is
measured for the first time) or the top spacer changes (the running average moved), the content the
reader is looking at would shift. The feed does **not** correct `scrollTop` for this itself. The
browser's scroll anchoring (Chromium's default, `overflow-anchor: auto`) already keeps the visible
row in place for all of those changes, and adding the delta by hand on top of it moved the reader a
second time. Setting `overflow-anchor: none` on the feed would make that manual correction necessary
again, for spacer shifts as well as row heights.

## Jumping to a row outside the window

A jump target that is loaded but not mounted cannot be scrolled into view, because there is no node
yet. The feed scrolls to the target's estimated offset instead, waits 60 ms for the window to slide
and mount it, and tries again — up to 12 times. Once the node exists, the normal landing in
[jump-and-return.md](./jump-and-return.md) takes over. A target that is not loaded at all pages older
first, as before.

## Paging older history past deleted messages

The feed asks for an older page with a cursor: the lowest message number it already holds. The server
counts a page down by message numbers, leaves deleted messages out, and names the lowest number it
counted as the next cursor (0 once it reached the start of the room). So a page can come back with no
rows and a cursor below it, because every message in that range was deleted. That is not the start of
the history.

- `useChats` keeps the cursor the server named for the open room. The next page starts from whichever
  is lower: that cursor or the oldest row held. Pages of nothing but deleted messages are stepped
  over inside the same `loadOlder` call, which ends only when a page brings rows or the history ends.
  A caller that saw nothing land — the thread panel's pager, a reader parked at the top of the feed —
  would not ask again, so the call does not hand back in between. Cursor 0 ends the history, whether
  the page that named it had rows or not, and so does a cursor that does not move down.
- With no row held, the first older page counts down from the channel's last message number. A room
  with neither (nobody has written in it) has no history to page, and shows its intro.
- A feed with nothing to show fits the viewport like any short feed, so the auto-fill pulls the next
  older page by itself, and the feed shows loading instead of the "first message" intro until a row
  shows or the history ends. That is the case when the newest page held nothing (all its messages were
  deleted), and when it held only replies to deleted thread roots and system rows, which the room's
  feed hides. A failed page stops the pull and shows the room's load error with a retry.
