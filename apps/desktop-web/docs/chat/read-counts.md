# Read counts

A room shows who has read a message, as a small pill under it: the faces of the first three members
who read it (the rest as `+N`), then `읽음 5 · 미확인 7` (Seen 5 · Not seen 7). Once every member it was
meant for has read it, the second half goes and the pill reads `읽음 12`.

## Who read it

Resting the pointer on the pill opens a card above it with two tabs, `읽음 N` and `미확인 M`, each
listing those members by face and name; Seen is the tab it opens on. It opens on hover rather than
click because it is a glance, not a place to go. Leaving the pill closes it after a short grace, so the
pointer can cross onto the card and scroll a long list, and a hover never takes focus away from what
the reader was doing. From the keyboard, Enter or Space on the pill opens the same card with focus
inside it, so the tabs and both lists are reachable — the card renders outside the feed, so Tab from
the pill alone would walk past it. Escape, or focus leaving the card, closes it. Escape puts focus back on the pill; clicking or tabbing elsewhere leaves it where the reader moved it. The component is
`ReadReceiptPill`.

A member is named the way a message author is: the place nickname first, then the roster's name, my
own id resolving to me. The face comes from the place profile, else the roster's. A member nothing
names yet still gets a row, under the `-` placeholder, so the list never disagrees with the count.

## Where the pill appears

- Under the **last message of each author block**, not under every message. Every earlier message in
  the block has been read at least as far, so a pill on each would repeat the same story.
- Only in the main feed. The thread panel renders the same `MessageList` without a count.
- Not in my notes-to-self channel, and not in a room with fewer than two active members.
- Not under a message still being sent, one that failed, or a deleted one: the first two have no
  server number yet, and a deleted message has nothing left to read.
- Not until the first join row has arrived, so a room never flashes "0 seen" while it loads.
- Not under a message no other member was there for — everyone else joined after it — rather than an
  empty `읽음 0`.

## How the numbers are counted

`useChannelReadCounts` (in `src/app/shared/hooks/`) gives `ChatPane` a `readCountOf(chatNo, authorId)`,
which `MessageList` asks once per author block. It answers with two lists of member ids — who has read
the message and who has not — and the pill's numbers are their lengths. The lists are worked out here
from join rows the app already observes, not asked of the server: the server team proposed it that way,
because every row needed is already on hand and the lists then move the moment a member reads, where an
API answer is a snapshot that would have to be fetched again.

A message is meant for a member when all three hold:

- they are still in the room — a member who left keeps a row (`joined: 0`) but is on neither list;
- they joined before the message — `joinedNo < chatNo`. Joining writes the room's latest number into the
  member's `chatNo` too, so without this test every message from before their arrival would read as
  seen by them. A row with no `joinedNo` (written before the server kept it) counts as always there;
- they did not write it — the author is on neither list.

Of those members, one whose read position has reached the message is **Seen**; the rest are **Not seen**.

- A member's read position is `max(readNo, chatNo)` from their join row. The server keeps the last-read
  number in `chatNo`; my own row also carries the `readNo` that marking a room read writes before the
  server answers, so my count moves at once.
- A member whose row has not synced yet is on neither list until it lands — never as seen. The total
  grows as rows arrive.
- The mobile app has neither the author nor the `joinedNo` test: it counts the author as having seen
  their own message, and a member who joined later as having seen everything before them. For the same
  message the desktop's Seen number is lower by one plus the number of those later arrivals.

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

`MessageRow` is memoised with a comparator that compares the two member lists by value. A join update that moves
one block's count re-renders that block only, not the whole feed.
