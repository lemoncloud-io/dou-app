# ADR-0267: Desktop works out who read a message from join rows, and lists them from the read count

> Status: Accepted · Decided: 2026-11-02 · Implemented: `feat/desktop-read-receipts`
> · Scope: `apps/desktop-web/src/app/shared/hooks/useChannelReadCounts.ts`,
> `apps/desktop-web/src/app/features/chat/components/` (`ReadReceiptPill`, `MessageList`, `MessageRow`)
> · Amended: 2026-11-02 — the list opens on click, not hover (decision 3)
> · Supersedes: [ADR-0251](./0251-desktop-shows-no-per-message-read-receipt.md)

## Context

ADR-0251 removed the desktop's per-message read line because it flickered in and out under the
pointer, and said that if who-read-it was needed again it should come back as something the reader
asks for, such as a hover card, not as a line in the feed. A count came back the next day as a fixed
pill under the last message of each author block, `읽음 5 · 미확인 7`, which stays put rather than
following the cursor. The design now also asks for the people behind those numbers: the faces of the
first readers in the pill, and on hover a card with a Seen tab and a Not seen tab listing members by
face and name.

Who read a message could be asked of the server per message. The server team proposed instead that
the app work it out, for two reasons: every row it needs — each member's join row with their read
position and the message number they joined at — is already observed by the open room, and a list
built from those rows moves the moment someone reads, where an API answer is a snapshot that has to
be fetched again.

## Decision

1. **The app computes the lists; there is no read-list API call.** For a message M, the members it
   was meant for are the join rows that are still in the room (`joined !== 0`), joined before M
   (`joinedNo < M.chatNo`), and did not write M. Of those, a member whose read position
   (`max(readNo, chatNo)`) has reached M has read it; the rest have not.
2. **The pill's numbers are the lengths of those two lists.** The card and the pill therefore
   never disagree. The author is no longer counted as having seen their own message, and a member
   who joined after M is on neither side.
3. **The list opens when the pill is clicked**, or with Enter or Space from the keyboard, and focus
   moves into the card so its tabs are reachable. It first opened on hover, as ADR-0251 suggested,
   but a hover card closes as the pointer leaves the pill, and in use the pointer could not get to
   the Not seen tab to click it. A card the reader opens on purpose stays put until they close it.

The `joinedNo` test is not optional: joining writes the room's latest number into the member's
`chatNo` as well, so without it a new member reads as having seen everything sent before they
arrived. A row with no `joinedNo` (written before the server kept it) counts as always there.

## Consequences

- **Desktop and mobile counts differ.** The phone (`apps/web`) still counts the author as having seen
  their own message and has no `joinedNo` test, so for the same message the desktop's Seen number is
  lower by one plus the number of members who joined after it. Bringing the phone to the same rule is
  separate work.
- **A message no other member was there for shows no pill**, rather than an empty `읽음 0`.
- **Every member's join row stays synced while a room is open** on desktop, as it has since the count
  came back; the lists add no network work on top of the count.
- **The lists are only as fresh as the join rows.** A member whose row has not synced yet is on
  neither list until it lands.
