# The Channels and DM lists

The Channels and DM nav destinations open `ChannelListPanel` and `DmListPanel`
(`features/chat/components/lists/`) in the sidebar column. Channels lists the active place's
channels; DM lists its 1:1s with my notes-to-self room among them — the split is `isDmBucket`. The
Home sidebar keeps its own sections, favorites and drag order; these lists are ordered by activity
instead. Both draw the same frame and rows (`ConversationList`), so the two read alike.

## What a row shows

A channel row: a `#` tile, the channel name (bold while unread), the time of its last message, then
the last message as `sender: text` and the unread count. A DM row: the person's avatar and name, then
the last message — prefixed "You:" when it is mine, unprefixed when it is theirs, since a 1:1 has only
the two senders; my notes-to-self room never prefixes, every message there being mine. A room with nothing cached says "No messages yet". The preview text is
`messagePreview`, the line an OS banner uses, so an attachment-only message reads as what it carries.

## Who a DM row names

`useDmIdentities`, shared with the Home sidebar's DM section: this place's profile where the person
set one, else their cloud profile, field by field. My notes-to-self room is "You". A person not named
yet is fetched from the server, and the row is drawn as a placeholder rather than as a raw id; until
the place's first names have all arrived (at most 10s) every row is a placeholder, so the list does
not reshuffle under the pointer as names land. The wait is kept per place outside the list
(`useDmNameWaitStore`), so reopening DM does not wait again for a person who never resolves. A search
matches the names shown; a placeholder row matches nothing. Presence is not shown: there is no presence source for
another person.

## Order

The same for both lists, the notes-to-self room included. `sortByRecency`: the last message's time first, which is the time the row prints, so the order and
the times on screen agree. A channel with nothing cached falls back to its record's `updatedAt`. Ties
keep the place's order.

## Where the previews come from

`useLastChats` reads every room's last previewable message through one `chat.observeLastList`
subscription per list — not one per row, which is why the Home sidebar shows its preview
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
  panel, so both lists share the cap, and leaving a list and coming back mid-drain neither lifts the cap nor fetches a channel
  twice; a fetch not yet started is dropped when the list changes, since it would run in whichever
  place is current by then.

## Search and empty states

The search field narrows the list by name — a DM by the person's name — case-insensitively, and says
when nothing matches. A place with no channels shows a create button where channels can be created
(not in the default cloud, the same rule as the Home list); a place with no 1:1 shows a new-message
button where one can be started. The header's `+` opens the same dialog. While the place's channels
are still loading, a list shows neither rows nor the empty state. The rail's Channels tile carries a
dot while any channel in the place is unread, and the DM tile while any 1:1 or the notes-to-self room
is.
