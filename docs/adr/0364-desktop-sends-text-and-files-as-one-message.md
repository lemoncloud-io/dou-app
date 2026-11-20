# ADR-0364: Desktop sends text and files typed together as one message

> Status: Accepted · Decided: 2026-11-20
> · Scope: `apps/desktop-web/src/app/features/chat/hooks/useComposerSend.ts`
> · The behaviour is documented in [apps/desktop-web docs/chat/images.md](../../apps/desktop-web/docs/chat/images.md)
> · Supersedes: [ADR-0135](./0135-desktop-sends-images-through-the-runtime-image-send.md) decision 2
> (text and pictures are two messages, the text first)
> · Related: [ADR-0179](./0179-the-in-app-photo-pick-waits-for-a-send-in-a-panel-in-the-keyboards-place.md)
> and [ADR-0182](./0182-files-from-the-files-entry-wait-above-the-composer-and-take-the-typed-text.md)
> (the phone app's caption)

## Context

ADR-0135 split a desktop send with text and files into two messages: the text at the press, the
files as an image message after it. It chose that because a message carrying both content and uploads
was unverified on the server, and it named its own reversal: "if the server accepts content and
uploads on one message, Decision 2 becomes a single send."

That condition has been met for a while. ADR-0179 gave the runtime's `sendImages` a `content` (and
later a `mention`), and the phone app sends typed text as the caption of its photos' message.

Meanwhile the split showed what it costs. A user posted text with an image from desktop and got two
messages. Each was saved on its own, and a reply landed under the image, apart from the text it was
answering. The reader expected one post and could not follow it as one.

## Decision

When the tray holds files, the composer sends one message: the files, with whatever was typed as its
caption and the mention picked for that text. Text alone is sent as before. The row already draws a
message's text above its files, so the design's "text above images" holds within the one message.

## Alternatives

- **Keep two messages, and link them** — rejected. Saving, replying and threading all work on a
  message, so every one of them would need to learn about the pair.
- **Keep two messages on desktop only** — rejected. The same post would be one message from the
  phone and two from desktop, and the reader cannot tell which they are looking at.

## Consequences

- The text no longer goes out at the press. It waits for the uploads and fails with them: one Failed
  row, whose Retry sends both. This is the phone app's behaviour already.
- A text-only send and a files-only send are unchanged.
