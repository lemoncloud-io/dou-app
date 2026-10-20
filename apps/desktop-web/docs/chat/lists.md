# The Channels list

The Channels nav destination opens `ChannelListPanel` (`features/chat/components/lists/`) in the
sidebar column. It lists the active place's channels, its 1:1s and notes-to-self room left out
(`isDmBucket`). The Home sidebar keeps its own sections, favorites and drag order; this list is
ordered by activity instead.

## What a row shows

A `#` tile, the channel name (bold while unread), the time of its last message, then the last
message as `sender: text` and the unread count. A channel with nothing cached says "No messages yet".
The preview text is `messagePreview`, the line an OS banner uses, so an attachment-only message reads
as what it carries.

## Order

`sortByRecency`: the last message's time first, which is the time the row prints, so the order and
the times on screen agree. A channel with nothing cached falls back to its record's `updatedAt`. Ties
keep the place's order.

## Where the previews come from

`useLastChats` reads every channel's last previewable message through one `chat.observeLastList`
subscription for the whole list — not one per row, which is why the Home sidebar shows its preview
only on hover. Desktop storage has no single-query path for this, so the data source reads a 30-row
window per channel from the local cache on each coalesced flush. The observation itself is local
reads only; the freshness fetch below is the hook's one network path.

On top of the cache:

- **The join window.** A channel's cache outlives leaving it. In a re-joined channel a message at or
  below my current join (`$join.joinedNo`) is not shown; the channel reads as having no messages and
  sorts by its record's time.
- **Freshness.** Desktop chat sync does not bring mid-session messages to a channel that is not open.
  When a channel's record says it has a newer message than its cache holds, the newest page is fetched
  once for that number, at most three at a time, and the write wakes the observation. On a cold cache
  that is one fetch per channel with messages, the first time the list opens. A failed fetch keeps the
  cached preview, is logged, and the next advance tries again. The queue belongs to the chat repository, not to the
  panel, so leaving Channels and coming back mid-drain neither lifts the cap nor fetches a channel
  twice; a fetch not yet started is dropped when the list changes, since it would run in whichever
  place is current by then.

## Search and empty states

The search field narrows the list by name, case-insensitively, and says when nothing matches. A place
with no channels shows a create button where channels can be created — not in the default cloud, the
same rule as the Home list — and the header's `+` opens the same dialog. While the place's channels
are still loading, the list shows neither rows nor the empty state. The rail's Channels tile carries a dot while any channel in the place is unread.
