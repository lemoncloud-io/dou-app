# Composer

The message box at the bottom of a room and of the thread panel
(`src/app/features/chat/components/Composer.tsx`). It edits rich text in Lexical and sends the
markdown-lite string the message view renders; the conversion is `editor/wireMarkdown.ts`.

## Layout

Three rows, in Slack's order:

1. **Formats** — bold, italic, strikethrough, inline code and link, a rule, then quote and code
   block. Each format button lights up while the caret's text or block carries that format. The row is
   the same component the message editor uses, so the two always offer the same set.
2. **Text**, with the attachment tray under it.
3. **Actions** — attach ("+", only where files are accepted) and emoji on the left; the newline hint
   (shown once there is text) and send on the right.

Slack's row also has underline and list buttons. They are left out on purpose: the wire format has
no form for them that the web and mobile readers understand, so a message sent with one would lose it
on every other client. Adding them means changing that shared format first.

The link button is cut down for the same reason. A message has no link-with-label form — a link is
its URL, which every client turns into a link when it reads one — so the button asks for an address
only. `example.com` gets `https://`, an address with spaces is refused, and the URL goes in at the
caret, or after the selected words rather than replacing them. The autolink plugin then marks it, as
if it had been typed.

## Code blocks

Enter sends, which rules out the usual markdown trigger (Lexical opens a fence on Enter after
` ``` `). So the composer does it the way Slack does:

- **Typing.** The third backtick of a line that holds only ` ``` ` turns that line into an empty
  code block with the caret in it. Undo brings the backticks back.
- **Inside a block** Enter still sends and Shift+Enter breaks the line. ArrowDown at the end of a block
  that ends the message adds a paragraph under it — otherwise there would be no way out by keyboard.
- **Button and shortcut.** The code block button and ⌘⇧⌥C toggle the current lines in and out of a
  block.
- **Pasting** plain text that contains a fence (` ```sh … ``` `) inserts the fenced part as a
  code block and the rest as text, using the same fence rule as the message view
  (`utils/fences.ts`). A paste that carries HTML is left to Lexical's own import.
- **An empty block** counts as no text: it neither enables send nor saves a draft.

On send a block is written as a fence. When the code itself holds ` ``` `, the fence is
lengthened to four backticks, and the reader pairs fences by length so the block arrives whole.
