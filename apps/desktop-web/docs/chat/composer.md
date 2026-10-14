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

The two button rows are two sizes on purpose, and one size each. Formats are 28px squares with 16px
icons: seven of them have to fit the thread panel. Actions are 32px squares with 18px icons, attach and
emoji drawn alike (`COMPOSER_ACTION_BUTTON`) and send in the same box with its own fill.

A format that is on carries an inset edge as well as the hover fill. The fill alone is what hovering
draws, and it is too faint against the box to be told from "off".

In a box too narrow for the format row, the row wraps onto a second line. The buttons do not shrink
and none is cut off.

The placeholder that stands in while the editor's chunk loads (`LazyComposer`) is the height of the
empty box, 121px, so the feed does not move when the editor arrives. Changing a row's height means
changing that number too.

Slack's row also has underline and list buttons. They are left out on purpose: the wire format has
no form for them that the web and mobile readers understand, so a message sent with one would lose it
on every other client. Adding them means changing that shared format first.

## Mentions

Picking a member from the `@` list puts a chip in the text and records who was picked on it
(`editor/MentionNode.ts`). On send the chips still in the text are collected into the payload's
`mention` — `userIds` for members, `all` for the "Everyone" row (`$collectMention` in
`editor/wireMarkdown.ts`). The server goes by that record, never by the text, to decide who a
"mentions only" member is told about, and the readers go by it for the banner, the mentions inbox
and the self highlight (`mentionsMe` in `shared/utils/mentionMatch.ts`); a message with no record is
still read by its text.

- **Only a pick counts.** A name typed by hand, and a chip restored from a draft or from a message
  opened for editing, carry no id. A chip whose text has changed since the pick (a name of several
  words cut short by Backspace) stops counting. A full name left unpicked warns under the box:
  sending it would mention nobody.
- **"Everyone" is a group channel's first row.** A 1:1 and my notes-to-self have none, and neither
  does the box that edits a sent message: an edit does not change who was mentioned. On a bare
  `@` the row stays first but the highlight starts on the first person, so Enter names someone
  instead of calling the whole channel.
- **A resend keeps the mention.** The failed row holds the record, and both Retry and the reconnect
  sweep rebuild the payload from it (`toSendPayload`).

## Links

The link button opens Slack's dialog: **Text** and **Link**, then Save or Cancel. Text starts as the
selected words, or as the words of the link the caret is in, which is then edited in place. Save puts
the words back as a link to the address. With no words the address goes in bare, as if it had been
typed, and the autolink plugin marks it. The button lights up while the caret is in a link.

The address has to be `http(s)` with a host: `example.com` gets `https://`, parentheses are
percent-encoded (`Foo_(bar)` becomes `Foo_%28bar%29`, the same page to a browser), and anything else
— a space, another scheme — keeps Save off. Brackets in the text become parentheses and line breaks
become spaces, since either would end the words early.

A labelled link travels as `[words](address)`. Readers draw it only when the words hold no brackets or
line breaks and the address is http(s) with a host and no spaces or parentheses — the same rule in this
app's `RichText` and in apps/web — so `[x] done (see notes)` stays text. Previews (sidebar,
notifications, search) show the words, so search finds a labelled link by its words, not its address.
Typing `[words](address)` by hand is not a shortcut; it is sent as typed and still read as a link.

A pasted web page keeps its links only where a message can carry them. An anchor to a relative path,
`mailto:`, or an address with parentheses is unwrapped to its words (`LinkGuardPlugin`). When a message
is opened for editing, only what readers would draw as a link becomes one.

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
