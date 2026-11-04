# Read counts

A room shows how far each member has read by putting their face on the message they stopped at, under
its body and aligned with its text. Members who stopped at the same message share one marker: the
faces of the first three, the rest as `+N`. Read down the room and the faces trace how far everyone
has got — the closer to the newest message, the more of the room they have read.

A marker is only faces. The counts (`Seen 5 · Not seen 7`, `읽음 5 · 미확인 7`) are not drawn; they are
the marker's accessible name, so a screen reader still hears them, and the card the marker opens shows
them as its tab labels.

## Who read it

Clicking a marker opens a card above it with two tabs, `Seen N` and `Not seen M`, each listing those
members by face and name; Seen is the tab it opens on. The card is about the message the marker sits
on, not only about the members drawn on it: Seen lists everyone whose read position has reached that
message, so a member further down the room is in it too, and Not seen lists those it was meant for who
have not got there. It opens on click, not hover: a hover card closes as the pointer leaves the marker,
so reaching the Not seen tab meant crossing a gap the card did not always survive, and the tab could
not be clicked. The card stays open until a second click on the marker, Escape, or a click or focus
move outside it. Enter or Space on the marker opens it from the keyboard; either way focus moves into
the card so the tabs and lists are reachable. Escape puts focus back on the marker; clicking or tabbing
elsewhere leaves it where the reader moved it. The component is `ReadReceiptPill`.

A member is named the way a message author is: the place nickname first, then the roster's name, my
own id resolving to me. The face comes from the place profile, else the roster's. A member nothing
names yet still gets a row, under the `-` placeholder, so the list never disagrees with the count.

## Where a marker appears

A member's read position is a message number, and it does not have to be one this room shows —
reactions and system events use up numbers too. `placeReadMarkers` (in `src/app/features/chat/utils/`)
lowers each position to the nearest shown message at or below it, which is the last message that member
is known to have reached.

- One marker per message that someone stopped at. A message nobody stopped at has none.
- A message still being sent, one that failed, and a deleted one carry no marker; their members are
  placed on the last settled message below. The first two have no server number yet, and a deleted
  message has nothing left to read.
- A member whose read position is below the first message that is loaded is placed nowhere: the
  position points into history the room has not paged in, so it is not guessed onto a row. That member
  is still in the card's Not seen tab.
- A member is not placed on a message from before they joined. Joining writes the room's latest number
  into their read position, so a late joiner's position runs past messages they never saw; the card's
  lists leave them out for those messages, and a face there would open a list without the person it
  shows. Their face appears on the first message after they joined that their position has reached.
- A message's author is not drawn on their own message, as they are on neither list of it. A member
  whose last read message is their own therefore has no face until they read one of someone else's.
- I am never drawn. My own position says nothing the reader does not know, and it would add a face to
  every room. I am in the card's lists like everyone else.
- Not in my notes-to-self channel, and not in a room with fewer than two active members.
- Not until the first join row has arrived, so a room never flashes markers while it loads.
- Not on a message no other member was there for — everyone else joined after it.
- The thread panel draws them too, among the root and its replies. Read positions are per channel, not
  per thread: a member who has read the main feed past a reply counts as having read it, whether or not
  they opened the thread, and a member past the last reply is placed on the last reply. The server does
  not report when a thread was opened, so the panel cannot tell the two apart.

## How the numbers are counted

`useChannelReadCounts` (in `src/app/shared/hooks/`) gives `ChatPane` and `ThreadPanel` two things: `cursors`, the read
position of every other member still in the room, and `readCountOf(chatNo, authorId)`, which answers for
one message with two lists of member ids — who has read it and who has not. `MessageList` places the
cursors on the shown messages and asks `readCountOf` only for the messages that carry a marker. The
lists are worked out here from join rows the app already observes, not asked of the server: the server
team proposed it that way, because every row needed is already on hand and the lists then move the
moment a member reads, where an API answer is a snapshot that would have to be fetched again.

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
- `cursors` is empty until my own user id is known, so I can never appear as someone else.
- The mobile app has neither the author nor the `joinedNo` test: it counts the author as having seen
  their own message, and a member who joined later as having seen everything before them. For the same
  message the desktop's Seen number is lower by one plus the number of those later arrivals.

## Keeping other members' positions live

The sidebar only keeps **my** join row current, which is all an unread badge needs. Read markers need
everybody's, so while a room is open a join sync is registered for every member of it, in the room's
own cloud. Two gates hold the registration back:

- the room's cloud must be verified, and
- I must be a member of the room (on its roster or with an active join row of my own). The server
  refuses another member's join to anyone outside the room, so polling a room I am not in would only
  produce a 403 per member.

Registrations refcount by key, so my own join, also registered by the sidebar, is not polled twice.
Leaving the room disposes them.

## Rendering cost

`MessageRow` is memoised with a comparator that compares its markers by value, so a join update that
leaves a row's marker and its lists unchanged does not redraw that row. A member reading on changes the
rows they left and arrived at, and also the lists of every marker in between — they move from Not seen
to Seen there — so those redraw too; the rest of the feed does not.
