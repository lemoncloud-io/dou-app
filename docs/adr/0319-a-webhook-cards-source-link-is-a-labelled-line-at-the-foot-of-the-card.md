# ADR-0319: A webhook card's source link is a labelled line at the foot of the card, read from `source$.url` first

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/desktop-webhook-card` · Supersedes
> [ADR-0246](./0246-a-webhook-cards-title-is-the-link-to-its-source.md)
> · Scope: `libs/block-kit/src/sourceLink.ts` · `libs/block-kit/src/BlockKitMessage.tsx` ·
> `apps/web/src/app/features/channels/components/ChannelMessageRow.tsx` ·
> `apps/desktop-web/src/app/features/chat/components/MessageRow.tsx` ·
> `apps/block-kit-builder/src/app/features/preview/PreviewPane.tsx`
> · The module docs are [apps/web chat room](../../apps/web/docs/feature/channels/chat-room.md) and
> [desktop-web webhook messages](../../apps/desktop-web/docs/chat/webhook-messages.md)

## Context

ADR-0246 made a webhook card's title the link to the sender's full report, found by recognising the
server's own `<url|원문 보기>` element on the card's last line. Two things changed.

The server now stores the report's address as a message field, `source$.url`, alongside the line it
still writes. The label no longer has to be the only way to find the link.

And the product owner chose a visible link over a linked title: a reader looking for the original
report finds a word that says so, where a heading that is also a link is found only by hovering it —
and on a phone, where nothing hovers, not at all.

## Decision

1. **The link is its own line, the card's last.** `BlockKitMessage` draws the caller's `sourceUrl` as
   a link labelled `labels.openSource` ("View source" / "원문 보기") after everything else the card
   draws, where the design's deployment card puts its "View Actions Run". The heading is plain text
   again. The link takes the card's accent colour, like every other link in the card (ADR-0318).
2. **`source$.url` first, the server's line second.** `takeSourceLink(blocks, source$)` uses the field
   when it is `http(s)`, otherwise the line's address when that is. Either way the server's line
   element is taken off the card, so the link shows once. When both exist and disagree the field wins
   — the server builds both from one `meta.sourceUrl`, so it should not happen.
3. **Only `http(s)`.** A `javascript:`, `data:` or relative address is never linked. With no usable
   address the blocks come back unchanged.
4. **A card is not lost to the move.** The caller decides on a card from the blocks before the line
   moves out; when nothing drawable is left after it, the card shows the message's own text with the
   link after it, rather than an empty frame.

## Alternatives

- **Keep the linked title (ADR-0246).** Rejected by the product owner for the reason above.
- **A line right under the title.** Implemented first and reviewed on screen; moved to the foot because
  the design's deployment card draws its link there, after the content it opens the full version of.
  The cost: on a card with a long stack trace, the link is the last thing reached.
- **Leave it inside the server's context line.** There it is a word among the footer's small grey
  ones and does not read as the way to the report; the design gives it a line of its own.
- **The design's ↗ icon beside the title.** Still left out for ADR-0246's reason: a mark carried by
  every such card says nothing.

## Consequences

- The fallback to the line stays for messages stored before `source$` existed. If the server ever
  renames or translates its label, those old messages keep their link on the last line.
- The move is still each caller's: apps/web, apps/desktop-web and the builder preview pass
  `source$` to `takeSourceLink`. A surface that skips it shows the link on the last line, not twice.
- The design's error card still draws an ↗ beside a linked title; the cards follow its deployment
  card instead, so the error card no longer matches the design there.
