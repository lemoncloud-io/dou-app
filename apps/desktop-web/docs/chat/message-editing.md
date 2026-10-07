# Message editing

Choosing Edit on a message of mine turns the message into an editor in place, in the room and in the
thread panel alike: both render `MessageRow`, so there is one editor. The code is `MessageEditor`
(`src/app/features/chat/components/MessageEditor.tsx`), the conversion between a message's stored text
and the editor is `editor/wireMarkdown.ts`, and the composer's parts are reused rather than copied.

## What the editor is

The composer's formatting, built from the same pieces: the four format buttons (bold, italic,
strikethrough, code) with their shortcuts, markdown typing shortcuts, links, and the emoji picker. It
is a separate component, not a mode of the composer, because the composer is tied to a channel's
unsent draft, the image tray and type-to-compose, none of which belong to an edit. There is no attach
button: updating a message takes text only, so a message's pictures and files are untouched and are
hidden while it is open.

- **Width.** The box takes the whole message column, with no reading-measure cap. In the thread
  panel's narrow column the format row and the bottom row still fit, so there is one layout.
- **Height.** The text area grows with the message up to the smaller of half the window and 24rem,
  then scrolls on its own. The format row and the Cancel/Save row never scroll away. Opening scrolls
  the box into view, so its buttons are not left under the composer.
- **Keys.** Enter saves, Shift+Enter breaks the line, and Enter during an IME composition only
  settles the composition. Escape cancels and is marked handled, so a thread panel behind it stays
  open. Cancel and Save are at the bottom right, Cancel first.
- **Save is the difference.** It is enabled only when the text differs from what the editor loaded,
  as exported after loading, not from the stored string. A message written by another client may not
  round-trip byte for byte; opening it and touching nothing neither offers Save nor rewrites it. An
  empty box is never saved, since an empty message is a delete everywhere else; Enter then just
  closes the editor.
- **The text is read once.** If the message changes under an open editor (another edit, a new
  message joining the author's block), the editor keeps what is being typed.
- **While it is open** the row holds the hover band, so it reads as open after the pointer leaves, and
  the hover toolbar is gone.
- **After it closes** by save or cancel, focus returns to the message row (`keyboard.md`).
- **A failed save** puts the original text back and shows the usual one-line failure under the message;
  what was typed is not restored.

## Mentions

Typing `@` in the editor opens the same roster list as the composer, from the channel's members
(`ChatPane` and `ThreadPanel` pass them down through `MessageList` and `MessageRow`). While the list
is open, Enter and Tab pick and Escape closes only the list.

A chip is how the editor shows a mention, nothing more: the stored text is the plain `@name`, which is
also all the message view needs to render a mention and open the profile on click. So when the editor
opens a message, `@name` becomes a chip again (one Backspace removes it whole) only where the name is
exactly a member's display name or a group token (`@channel`, `@here`, `@everyone`), longest name
first, at a word start (so `medium.com/@Ada` stays a link) and with no token character right after
it. `@Adalyn` stays text when only `Ada` is on the roster, and so does `@Ada.` at the end of a
sentence, because `.` and `-` count as token characters, as they do in the message view. A mention
inside code is never a chip. A name that does not match is simply text; saving it is
unaffected either way. The roster is read once with the content, like the text, so members who load
after the editor opened do not turn earlier `@name` text into chips.

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
