# ADR-0284: Desktop thread panel shows who read each message; main-feed faces go to the row's right end

> Status: Accepted · Decided: 2026-11-04 · Implemented: `feat/thread-read-pills`
> · Scope: `apps/desktop-web/src/app/features/chat/components/` (`ReadReceiptPill`, `MessageList`, `ThreadPanel`)
> · Amends [ADR-0283](./0283-desktop-shows-where-each-member-stopped-reading-as-faces.md): its decision 3 and where
> decision 1 puts the faces
> · The module doc is [apps/desktop-web chat/read-counts.md](../../apps/desktop-web/docs/chat/read-counts.md)

## Context

ADR-0283 replaced the per-block read pill with one face per member, on the message they stopped at, and drew the
same markers in the thread panel. Two things came out of using it:

- **In a thread the markers answered nothing.** A thread is a handful of replies that everyone reads to the end, so
  every face landed on the last reply and the root and earlier replies carried none. The panel is opened to see
  whether a reply was read, and it could not say. The original request asked for the thread to show, per message,
  who read it — the old pill's shape — and only the main feed to show positions.
- **The faces had moved off the right end.** The request described the main feed as a race: faces arriving at the
  right. The review of ADR-0283's implementation moved the faces under the message body, aligned with its text,
  because on a wide window the right end is far from the message. That traded away the picture the request was
  built on: a column of faces at one edge that can be read down the room as progress.

## Decision

1. **The thread panel draws a read pill, not position markers.** The root and each author block of replies carry,
   under their last message, the faces of its first three readers, `+N` for the rest, and `Seen N · Not seen M`
   written out. One pill per block, not per message: replies sent back to back by one author would repeat the same
   counts between every line. Clicking it opens the same Seen / Not seen card. `MessageList` draws this shape when it is
   given read counts without read positions.
2. **Main-feed markers return to the right end of the row**, faces only, as ADR-0283 first had them. The card opens
   from the end edge.

## Consequences

- The thread panel carries a pill on every author block, so it is busier than the main feed. Threads are short,
  and who read a reply is what the panel is for. A pill on a block's last message stands for the block: a member
  who read the last line read the earlier ones.
- A main-feed face can sit far from a short message on a wide window. The faces line up in one column, which is
  what makes the race readable, and the hover band ties a face to its row.
- A member who stops far behind shows as a lone face high up the room. That is the read position the server
  reports; if it is wrong (a member who read the room but whose position did not move), the marker shows the wrong
  data rather than hiding it.
- Read positions are still per channel, so a thread pill counts a member who read the main feed past a reply as
  having read it.

## Alternatives considered

- **Keep position markers in the thread panel.** Not chosen: they piled onto the last reply and left the panel
  unable to say whether a given reply was read.
- **Keep main-feed faces under the body.** Not chosen: it reads as a per-message tag rather than a race towards the
  newest message, which is the display that was asked for.
