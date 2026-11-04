# ADR-0283: Desktop shows where each member stopped reading as faces, not a count under each block

> Status: Accepted · Decided: 2026-11-04 · Implemented: `feat/read-position-avatars`
> · Scope: `apps/desktop-web/src/app/shared/hooks/useChannelReadCounts.ts`
> · `apps/desktop-web/src/app/features/chat/utils/readMarkers.ts`
> · `apps/desktop-web/src/app/features/chat/components/` (`MessageList`, `MessageRow`, `ReadReceiptPill`, `ThreadPanel`)
> · The module doc is [apps/desktop-web chat/read-counts.md](../../apps/desktop-web/docs/chat/read-counts.md)

## Context

A room showed who had read a message as a pill under the last message of each author block: the faces of
the first three readers, then `Seen 5 · Not seen 7`. In a busy room that is a pill under every block, each
repeating nearly the same faces and the same total, and the thread panel showed nothing at all.

What the data holds is not a count per message. It is one read position per member: the highest message
number they have reached. A per-block pill re-derives, for every block, a fact that is really one number
per person.

## Decision

1. **Draw the positions, not the counts.** Each member's face sits on the message they stopped at, under
   its body and aligned with its text. Members who stopped at the same message share one marker: three faces and `+N`.
   Reading down the room, the faces trace how far everyone has got. The counts stop being text.
2. **Clicking a marker opens the list we already had**, with its `Seen N` and `Not seen M` tabs for that
   message — not a list filtered to the members drawn on it. The counts live there, and in the marker's
   accessible name.
3. **The thread panel draws markers too**, among the root and its replies, from the same positions.
4. **The face and the list follow one rule.** A cursor is lowered to the nearest shown message at or below it,
   because reactions and system events use up message numbers. A face is left out where the list would not
   name that member: on a message from before they joined (joining writes the latest number into their
   position), on their own message, and below the loaded history. I am never drawn.

## Consequences

- One marker per position instead of one pill per block: the feed carries as many markers as members stopped
  at distinct messages, and a quiet room draws almost none.
- The totals are no longer visible at a glance; they take one click. A reader who wants "how many have read
  this" opens the list.
- Read positions are per channel, so in a thread a member who read the main feed past a reply counts as having
  read it, whether or not they opened the thread. The server does not report when a thread was opened, so the
  panel cannot tell the two apart. A true per-thread position needs data the server does not send.
- A member whose last read message is their own, or who joined after the newest message, has no face until
  they read one that the rule allows.
- The mobile app keeps its own read display; the two now differ.

## Alternatives considered

- **A separate progress strip** instead of faces on rows. Not chosen: faces on the message rows were picked
  over it, and a strip also separates a position from the message it points at.
- **The marker's list filtered to the members at that spot.** Not chosen: the list the app already had, with
  its tabs for everyone who has or has not read the message, was kept as is, which is the smaller change.
