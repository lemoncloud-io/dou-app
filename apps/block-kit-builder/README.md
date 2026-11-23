# block-kit-builder

A browser tool for composing a webhook message as Block Kit and previewing it the way a channel draws
it. It holds no session and sends nothing: it starts no runtime and opens no socket.

## Why it works this way

- **The preview is the real renderer.** `@chatic/block-kit` is imported, not reimplemented, because a
  second renderer would drift from `apps/web` and `apps/desktop-web` and the preview would start lying.
  The same applies to reading: every payload and template goes through `toBlocks`, so the builder cannot
  hold a block a channel could not carry. An element the renderer cannot draw is kept as `unknown` and
  shows its source, instead of being accepted here and failing in a channel.
- **The palette offers four kinds, not the ten in the design mocks.** `Tag`, `Button`, `Image` and `Icon`
  have no block behind them: the server folds an attachment's colour into an emoji rather than a chip,
  there is no endpoint for a button press to reach, and images are out of the server's scope. `Title`,
  `Text` and `Description` are one `section` block, so they are one entry. Offering something a channel
  cannot draw would make the preview a promise the product does not keep.
- **Templates are proposals, not transcripts.** They show a better arrangement of what the contract
  already allows (status as an emoji in the header, the failing service as a field grid, the stack as a
  code block), not a copy of what the server sends today. The sample trace is six lines because that is
  the length at which the renderer folds one.
- **`source$` is preview state, not payload.** The badge name, accent colour and source link come from
  the send's `meta` on the server, so they are typed in their own fields and are never persisted, copied
  with the payload, or put on the undo stack. The preview device width is outside the store for the same
  reason.
- **History.** Every change goes through one `commit`. Consecutive edits of the same kind (typing in a
  block) join one undo entry. A drag reorders the message under the pointer and records one entry for the
  whole gesture. Re-committing an identical array adds nothing, because the payload editor re-commits what
  it just rendered on every keystroke. A new edit drops the redo stack. Only the blocks and the
  "has held a message" flag are persisted, never the history, which would offer to undo a session the
  reader cannot see and grow without bound. The flag exists because an empty list cannot tell "never
  opened" (show the example) from "the reader cleared it" (leave it alone), and the example is seeded
  only after the store has hydrated. Clear has no confirmation, since undo takes it back.
- **The payload pane keeps the last good blocks.** Half of every paste is a half-typed brace, so a parse
  failure leaves the preview showing the last valid message and says why it is stale; the line number
  comes from the engine's message when it gives one. The text is parsed untrimmed so the reported line
  matches the editor. The pane remembers what it last wrote, so it does not reformat under the caret
  when its own edit comes back through the store.
- **The payload editor is three stacked elements** (line numbers, a coloured `<pre>`, a transparent
  textarea) that must agree on line height and scroll together; lines do not wrap, so indentation stays
  truthful; an empty line renders a zero-width space so it keeps its height.
- **Inputs are 16px on a phone.** iOS Safari zooms a focused field with smaller text and does not zoom
  back. Text fields are textareas everywhere, since newlines are significant in Slack text objects.
- **Pane widths are a custom property** (`--pane-w`), because a dragged pixel value cannot be a Tailwind
  class. The sizes are remembered; a storage that is full or blocked only costs the memory.
- **All web storage goes through the app's own store wrapper**, which tolerates a full or blocked
  storage; the root lint rule refuses direct use.
- **Theme and dark mode.** The toaster follows the tool's own theme, not the OS, since the builder is
  switched to dark to read a message against dark. The theme key is shared with the other apps.

## Not built yet

- **Sending to DoU.** The button only says so. The builder has no webhook it may call and no channel to
  name; the same gap keeps `actions` blocks out of the palette.
- **Applying an edit to a sender's next cards.** A card linked in from a sender
  (`?template=<builder id>#card=<base64url JSON>`, read once and kept in the fragment so the host never
  sees it) opens here, but an edit has nowhere to go: it needs a template store, a save API, and the
  sender fetching the template when it sends.
