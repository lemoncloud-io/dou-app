# ADR-0318: A webhook card's type badge and accent colour come from the message's `source$`, not its blocks

> Status: Accepted · Decided: 2026-11-16 · Implemented: `feat/desktop-webhook-card`
> · Scope: `libs/block-kit/src/cardAccent.ts` · `libs/block-kit/src/BlockKitMessage.tsx` ·
> `libs/block-kit/src/renderMrkdwn.tsx` · `apps/desktop-web/src/app/features/chat/components/MessageRow.tsx` ·
> `apps/web/src/app/features/channels/components/ChannelMessageRow.tsx` ·
> `apps/block-kit-builder/src/app/features/preview/`
> · The module docs are [apps/web chat room](../../apps/web/docs/feature/channels/chat-room.md) and
> [desktop-web webhook messages](../../apps/desktop-web/docs/chat/webhook-messages.md)

## Context

The webhook card design labels each card with its type — ERROR, DEPLOYMENT, ATTENDANCE — in a coloured
pill over the title, and colours the links inside the card to match. Neither fact was on the message.
The server turned the sender's `meta` into Block Kit (`blocks$`) and kept the sender's `color` only as
the emoji it puts before the title (🔴 · 🟠 · 🟢); the sender's alert channel name, which is what the
type is, never reached the server at all.

The server now stores a message-level `source$ { key, url, color }` on every webhook post (type package
`@lemoncloud/chatic-socials-api` 5.26.1104): `key` is the sender's channel name, `url` the full report,
`color` the sender's value exactly as sent — names in any case (`'Danger'`), hex with or without `#`,
three or six digits. The server checks none of the three, and a sender without a token can post them.

## Decision

1. **Badge and accent are message fields, read outside the blocks.** `BlockKitMessage` takes the
   message's `source$` and draws the badge from `key` and the accent from `color`. The block schema
   does not grow: a Block Kit payload has nowhere to put either, and a sender writing raw blocks should
   not be able to forge an integration's type.
2. **The badge says the channel name as it is**, drawn in capitals (a style, so the text a reader
   copies or hears stays the name), hyphens and underscores read as spaces, cut to one line. No table maps names to display words: a table would need an app release every time
   a sender registers a channel. No `key`, no badge.
3. **The colour is interpreted in the app, with the server's own rules.** The same name table as the
   server's emoji (`danger`/`red`, `warning`/`orange`/`yellow`, `good`/`green`), the same hex shape and
   the same grey cut (HSL saturation under 0.2), compared without case — so the title's 🔴 and the badge
   never disagree. Names take the design's colours; a hex keeps its hue. Anything else, and greys, are
   the neutral card: the design's grey badge and the app's own link colour.
4. **Every painted colour is computed, never the input.** The raw value is only matched or parsed;
   what reaches the page is a `#RRGGBB` computed from it. A value that would run as CSS cannot.
5. **4.5:1 per theme, by lightness only.** A colour that does not reach 4.5:1 on the card is walked
   darker (light theme) or lighter (dark theme) until it does, keeping its hue. The card ground it is
   fitted to is a reference a step past every caller's `--card` (light `#F7F7F7`, dark `#333333`), so
   one computation serves desktop-web, apps/web and the builder; desktop-web's token spec holds its own
   `--card` to it.
6. **The accent reaches the links through CSS variables** set on the card root for both themes and
   picked by `dark:`. A Tailwind class per colour cannot exist: the colour is only known at run time.
7. **Only a webhook card reads it.** `source$` on a person's message is ignored, because that message
   is not a card.

## Alternatives

- **Colour the badge by its words** (ERROR always red, DEPLOYMENT always purple, as drawn). Rejected:
  the words are whatever channel names senders register, so the table would never be complete, and a
  sender's own `color` already says how serious the message is.
- **Have the server resolve the colour** and send display colours. Rejected: the contrast target
  depends on each client's card in each theme, which the server does not know, and the server is kept
  to storing what the sender said.
- **Paint the sender's hex as sent.** Rejected: unreadable on one theme or the other for most
  colours, and it would put untrusted input into a style.

## Consequences

- A deploy notice that sends `good` gets a green badge, not the design's purple DEPLOYMENT one. Purple
  needs the sender to send a purple hex; the server then puts no emoji before the title, since its
  emoji only covers red, orange and green hues.
- Messages stored before the server began writing `source$` (2026-11-10) have no badge and no accent.
  Nothing is backfilled.
- A sender that sends no channel name — the CI notifier today — gets an accent but no badge.
- The design draws no warning badge and no dark theme. The warning tone uses the `--warning` amber all
  three apps define, and the dark colours are this computation's, not a design's.
- The reference grounds are a contract with the callers' `--card` tokens. A caller whose card moves
  past them can draw an accent link under 4.5:1; only desktop-web's spec checks it.
