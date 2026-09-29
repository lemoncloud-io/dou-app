# Links in the composer

A URL typed or pasted into the composer shows as a link right away — the link colour on a faint tint,
with a chain glyph in front — and a click opens it. `ComposerAutoLinkPlugin`
(`features/chat/components/editor/composerPlugins.tsx`) does both, on Lexical's `AutoLinkPlugin`.

## One definition of a link

`LINK_URL_SOURCE` (`shared/utils/linkMatch.ts`) is the only regex source for a bare URL. The composer
builds its matcher from it, and so does `RichText`, which turns URLs in received messages into
anchors. If the two drifted, the composer would mark text as a link that readers then receive as
plain text, or the other way round. `www.example.com` with no scheme, for example, is a link on
neither side.

## Code stays unlinked

`RichText` does not link inside code, so the composer does not either:

- **Code blocks** are excluded as parents, so no link node is created inside one.
- **Inline code** is handled after the fact. Lexical's matcher sees only the text, not its format, so
  it cannot skip inline code by itself. A link node whose text is inline code is kept but set
  unlinked, and renders as a plain span.

## Clicking

A click opens the URL in a new window (`window.open(…, '_blank', 'noopener,noreferrer')`). The
desktop shell never opens that window itself: its `setWindowOpenHandler` denies it and hands an
http(s) URL outside the app's own origins to the system browser. A click that ends a drag selection
only selects. The listener is the composer's own rather than Lexical's
`ClickableLinkPlugin`, because that plugin treats every link node as clickable — including the
unlinked ones kept for inline-code URLs.

## What is sent

Nothing changes on the wire. Markdown export writes a link node back out as the bare URL it was typed
as, and a spec checks that round trip. The chain glyph is a `::before` pseudo-element, so it is never
part of the editor text.
