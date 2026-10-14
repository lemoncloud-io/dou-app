# 0201. The web reader draws the whole message dialect, kept inline in `content`

Date: 2026-10-14

## Status

Accepted, for apps/web (and so the mobile app, which shows it in its WebView), and for the quote rule
in apps/desktop-web. Reverses the limit in decision 1 of
[ADR-0055](./0055-web-code-block-home-sort-and-login-return.md), which kept the web reader to code
("bold, italic, headings, lists, blockquotes … still unsupported"): bold, italic, strikethrough and
quotes are drawn now, and headings and lists stay out. Extends what
[ADR-0195](./0195-messages-carry-labelled-links.md) made both readers agree on, from labelled links to
the whole dialect.

## Context

Message text is a small markdown-like dialect: `**bold**`, `*italic*`, `~~strike~~`, inline code,
fenced blocks, `> ` quotes and labelled links. The desktop composer writes all of it from its
toolbar and shortcuts, and the desktop reader draws all of it. The web reader drew only code, fences
and links; its module doc said widening that set was a product decision. So a message formatted on
desktop showed its raw markers — `**urgent**`, `> quoted` — on every phone.

That raised the question of whether the formatting belongs in the text at all, or in a field beside
it, before a second reader came to depend on the text form.

## Decision

The formatting stays inline in `content`, and the web reader draws the same set the desktop reader
does, with the desktop's rules for quotes and marks: fences, then quote lines, then inline code, then
labelled links, bold, italic, strikethrough and bare addresses in one leftmost-first pass. Marks do not
nest, as on desktop. The home preview drops the markers and keeps the words.

A quote line is `>` followed by a space, or a lone `>`, on both readers. The desktop reader used to
take `>` with no space too, so `>_<` lost its `>` and turned into a quote; the composer's editor never
read it that way, and the composer only ever writes `> `.

## Alternatives

- **A field of formatting ranges beside plain `content`** (Telegram's entities). Rejected: it needs a
  server change and a change to both clients, offsets drift on Korean, emoji and every edit, and
  `content` would still have to carry the plain text for search, previews and pushes, so the message
  would be kept in two places. Every message already sent is in the inline form, so readers would
  have to understand both forever. It would not have saved the web reader any work either: it still
  has to draw bold and quotes.
- **Structured blocks (`blocks$`, Block Kit).** Already exist for webhook messages and remain the
  place for content the dialect cannot express. Too heavy for a typed chat message, and the
  composer's editor reads and writes markdown without custom code.
- **Keep the web reader to code and links.** Desktop formatting keeps reaching phones as raw markers.
  This was the state before, and the reason for the change.
- **A smarter reader on the web only** (CommonMark's flanking rules, so `2 * 3 * 4` is not italic).
  Rejected for now: the same message would then read differently on the two clients. If the rule
  changes, it changes in both readers together.

## Consequences

- One message reads the same on desktop, on the web and in the mobile app.
- The dialect's ambiguity is now on every client: text that merely looks like a mark is one
  (`2 * 3 * 4` shows `3` in italics), and so is a line that starts with `> `.
- Some differences between the readers predate this and remain: the web closes a fence at the next
  three backticks, where the desktop matches the fence's own length (a code sample that holds a
  fence breaks on the web); the two cut a bare address at different characters; and the web still
  draws a mention inside a mark, where the desktop shows the mark's words as plain text.
- An address inside a mark is not linked or unfurled, matching desktop.
- The readers keep separate copies of the patterns, desktop in `RichText.tsx` and `linkMatch.ts`,
  web in `messageTokens.ts`. A change to the dialect has to be made in both.
- The mobile composer is a plain text field with no formatting controls. Typing the markers by hand
  works, because the reader draws them; adding controls is separate work.
