# Read counts

A room shows how many of its members have read a message, as a small pill under it:
`읽음 5 · 미확인 7` (Seen 5 · Not seen 7). Once every member has read it, the second half goes and the pill
reads `읽음 12`. It is a count only — who read it is not shown yet.

## Where the pill appears

- Under the **last message of each author block**, not under every message. Every earlier message in
  the block has been read at least as far, so a pill on each would repeat the same story.
- Only in the main feed. The thread panel renders the same `MessageList` without a count.
- Not in my notes-to-self channel, and not in a room with fewer than two active members.
- Not under a message still being sent, one that failed, or a deleted one: the first two have no
  server number yet, and a deleted message has nothing left to read.
- Not until the first join row has arrived, so a room never flashes "0 seen" while it loads.

## How the numbers are counted

`useChannelReadCounts` (in `src/app/shared/hooks/`) gives `ChatPane` a `readCountOf(chatNo)`, which
`MessageList` asks once per author block. The counts are the ones the mobile app prints, so a message
reads the same on a phone and on the desktop:

- A member's read position is `max(readNo, chatNo)` from their join row. The server keeps the last-read
  number in `chatNo`; my own row also carries the `readNo` that marking a room read writes before the
  server answers, so my count moves at once.
- **Seen** is the number of active members whose position has reached the message; **Not seen** is
  the rest of the active members. A member who left keeps a row (`joined: 0`) but counts in neither.
- A member whose row has not synced yet is not counted on either side until it lands — never as
  seen. The total grows as rows arrive, as it does on the phone.
- Sending a message moves the sender's own position, so the sender counts as having seen it.

## Keeping other members' positions live

The sidebar only keeps **my** join row current, which is all an unread badge needs. Read counts need
everybody's, so while a room is open a join sync is registered for every member of it, in the room's
own cloud. Two gates hold the registration back:

- the room's cloud must be verified, and
- I must be a member of the room (on its roster or with an active join row of my own). The server
  refuses another member's join to anyone outside the room, so polling a room I am not in would only
  produce a 403 per member.

Registrations refcount by key, so my own join, also registered by the sidebar, is not polled twice.
Leaving the room disposes them.

## Rendering cost

`MessageRow` is memoised with a comparator that compares the count by value. A join update that moves
one block's count re-renders that block only, not the whole feed.
