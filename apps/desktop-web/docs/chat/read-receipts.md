# Read receipts

The line under a message that says who has read it: `Seen by 9 • Unseen by 1` (ko `읽음 9 • 미확인 1`)
while anybody is behind, and `Seen by all` (ko `모두 읽음`) once nobody is. A bare `Seen by 10` left
the reader to compare the number with the room size to know whether that was everyone, so the
all-read state is a phrase of its own rather than a count with the unread half dropped.

## What is counted

- **The denominator is the active members** — join rows with `joined !== 0`. The join cache keeps the
  rows of people who left, and counting those would leave a message unread forever.
- **The sender always counts as read.** The server does not advance a read cursor on send, and this
  client reports one only while the window is focused, so a message sent from a blurred window
  would otherwise be unread by its own author.
- **My own cursor is floored by the local read cursor**, which runs ahead of the debounced
  `readChat` round trip — otherwise my newest message reads as unread by me for a beat.
- A member whose join row has not synced counts as unread until it lands.

The counting lives in `utils/readCounts.ts` (`countReadsAt`) and `hooks/useReadCounts.ts`.

## Where one appears

- Never in a self channel or a channel with fewer than two active members — a receipt that counts
  only me says nothing. The two-member gate also covers "the join rows have not arrived yet", so no
  row shows `Seen by 0` on the way in.
- One per author block, on its last message, for any author's block.
- Only the latest block with a receipt shows it outright; earlier blocks show theirs while the
  message is hovered or has focus. A receipt under every block was the loudest repeated line in a
  busy channel.
- The thread panel shows receipts on replies with the same rules.

The read half is weighted but not in the accent colour — in lime it became the accent's most
frequent use, on a passive metric. `Seen by all` takes the same weight. English keeps "Seen" /
"Unseen" rather than "Read" / "Unread" because the sidebar uses "Unread" for your own unread
messages, and the two side by side meant opposite things.
