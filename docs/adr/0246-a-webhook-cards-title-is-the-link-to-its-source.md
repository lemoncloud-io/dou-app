# ADR-0246: A webhook card's title is the link to its source, moved up from the server's last line

> Status: Accepted · Decided: 2026-10-27 · Implemented: `feat/block-kit-card-restyle`, `feat/desktop-webhook-card`
> · Scope: `libs/block-kit/src/sourceLink.ts` · `libs/block-kit/src/BlockKitMessage.tsx` ·
> `apps/web/src/app/features/channels/components/ChannelMessageRow.tsx` ·
> `apps/desktop-web/src/app/features/chat/components/MessageRow.tsx` ·
> `apps/block-kit-builder/src/app/features/preview/PreviewPane.tsx`
> · The module docs are [apps/web chat room](../../apps/web/docs/feature/channels/chat-room.md) and
> [desktop-web webhook messages](../../apps/desktop-web/docs/chat/webhook-messages.md)

## Context

A webhook sender can attach the full report its message summarises (`meta.sourceUrl`, usually a JSON
file in object storage). The server turns the sender's `meta` into Block Kit (`blocks$`) and no longer
keeps `meta` itself as `attach$`. Slack's `header` block has no URL, so the server writes the source as
the last element of the card's last `context` line, labelled with its own fixed text:
`<url|원문 보기>`.

On the card that link was a small line under everything else. The new card design puts the way to the
report on the title instead — the first thing a reader looks at, and the thing they want more of.

## Decision

1. **The client moves the link.** `takeSourceLink` takes the last element of the last `context` block
   when it is exactly `<url|원문 보기>` and the address is `http(s)`, removes it from that line (and the
   line, if it is left empty), and hands the address to `BlockKitMessage` as `sourceUrl`.
2. **The first heading is the link, and only a plain-text one.** A mrkdwn heading can hold links or a
   fenced run of its own, which cannot sit inside another link; then nothing moves and the link stays on
   the last line.
3. **No icon.** The design draws an ↗ beside the title. It is left out: once every card from a sender
   that attaches its source carries the same mark, the mark says nothing. The title underlines on hover,
   and a screen reader hears a hidden "view source" label after it.
4. **The label is how the link is found, not a trust boundary.** Block Kit sent as a message's
   `content` can end with the same text. That is acceptable because the move never adds a link — it
   moves an `http(s)` link the card already showed.

## Alternatives

- **A structured field for the source on the chat view.** The cleanest contract, but it is a server
  change, and the server already sends the address; recognising it costs one pattern.
- **Leave the link on the last line.** Rejected by the design, and the report is the main reason to
  press a webhook card at all.
- **Keep the ↗ icon.** Rejected per decision 3; a link drawn as the title is the larger target on a phone
  as well.

## Consequences

- If the server renames or translates its label, the card silently keeps the link on its last line.
  Nothing in this repository pins the server's output; the shared sample in `sampleWebhookBlocks.ts` is
  a copy.
- On a touch screen, where nothing hovers, a linked title looks like any title.
- The move is the caller's, so every caller has to make it: apps/web, apps/desktop-web and the Block Kit
  builder's preview all do. A new surface that draws `BlockKitMessage` without `takeSourceLink` shows
  the link back on the card's last line.
