# Message editing

How the desktop client turns a message's stored text into an editor and back. The code is
`src/app/features/chat/components/editor/wireMarkdown.ts` (the conversion) and the composer beside it.

## The wire dialect has no escapes

A message is stored and sent as a small markdown dialect: `**bold**`, `*italic*`, `~~strike~~`,
`` `code` ``, fenced blocks and `> ` quotes. The message view (`RichText`) renders exactly that and has
no escape syntax, so a backslash is shown as a backslash and `snake_case_name` has nothing to protect.

The editor library's markdown functions assume escapes exist. Left alone they would change what a
person typed:

- Export writes a `\` before every `*`, `_`, `` ` `` and `~` in text that is not code. A message sent
  as `snake_case_name` would arrive as `snake\_case\_name`, and the reader would see the slashes.
- Import removes a `\` before any ASCII punctuation, and turns `&#65;` into `A`. A message that
  says `\\server\share` would open with one slash fewer, and saving it would write that back.

`$importWireMarkdown` and `$exportWireMarkdown` each cancel their half, so that
`export(import(text)) === text` for everything the dialect can express. They are the only place the
conversion happens: the composer's send and its saved drafts use them too, which is why a message is
the same string whether it was just sent or opened for editing. `wireMarkdown.spec.ts` is the table of
strings that must survive the round trip. It also runs against whatever version of the library is
installed, so an upgrade that changes either behaviour turns it red.

What stays ambiguous is only what the dialect itself cannot say: text that merely looks like markup
(`*x*` typed with no italic) is the same wire string as the italic it resembles. And a backslash that
ends a run of plain text and sits directly against an inline code span loses that one backslash on
export, because the library writes an escaped backtick the same way. Messages stored before this
change that carry stray backslashes are not rewritten.
On import a backslash is held back as a placeholder while the library parses, so one sitting directly
against a format marker (`x**\y**`) is no longer punctuation to the library's flanking rules and can
format differently on screen than it would in a plain string; the stored text still round-trips.
