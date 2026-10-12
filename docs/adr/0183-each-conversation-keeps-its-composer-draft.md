# ADR-0183: Each conversation keeps its composer draft — the text on the device, the waiting files for the run

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/chat-file-send-and-room-profile` · Scope:
> `apps/web/src/app/features/channels/` (`useComposerDraftStore`, `useComposerDraft`, `ChatImageAttach`,
> `ChannelRoomPage`, `ThreadPage`) · `apps/web/src/app/features/home/components/ChannelList.tsx` ·
> `libs/web-ui-kit` (`ListRow.subtitleIcon`) · Builds on
> [ADR-0182](./0182-files-from-the-files-entry-wait-above-the-composer-and-take-the-typed-text.md)
> · The module docs are [apps/web channels/chat-room.md](../../apps/web/docs/feature/channels/chat-room.md),
> [channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [home/last-chat.md](../../apps/web/docs/feature/home/last-chat.md)

## Context

The room and the thread held the composer's text in component state. Leaving the room lost it, and
so did a push banner tapped mid-sentence: the router keeps `ChannelRoomPage` and `ThreadPage` mounted
when only their params change, so the text stayed in the field and went into whichever room opened
next. ADR-0182 added files that wait above the composer for the send button, and they had the same
problem, worse: a PDF picked in one room was sent to the next.

Two things limit what can be kept. The typed text is a string, and storable. A waiting file is a page
`File` (from a browser's files input), which cannot be stored, or a `ShellFileRef` — an address of a
copy the app keeps in its pick folder and sweeps after a day.

## Decision

1. **A draft belongs to a conversation.** Its key is the room's channel id, or `channelId#rootNo` for
   a thread — a thread's draft is not the room's. Moving to another conversation without remounting
   swaps the composer's text and waiting files for that conversation's; coming back finds them.
2. **The text is kept on the device**, in a persisted store (`chatic.composer.drafts`), so it outlives
   a restart. An empty draft is not kept, which is also how a send clears it: the field clears. At
   most 50 conversations keep one; a write moves its conversation to the newest end, and the oldest
   goes past the cap. Storage that fails costs the draft, never the composer.
3. **The waiting files are kept for the run only**, in memory beside the text and never written out.
   A shell file kept that way can outlive its copy; the send then fails as any gone shell file does.
4. **The in-app photo pick is not a draft.** It is a selection made in the attach panel, and it goes
   with the panel when the conversation changes, as it does when the panel is dismissed.
5. **Only the composer's own text.** Editing a sent message has its own field and locks the composer,
   so an edit is never drafted.
6. **Sign-out lets every draft go**, text and files, so the next account on the device never opens a
   room onto someone else's unsent words.
7. **The chat list shows a room's draft.** A room whose own draft has text that is not blank, or a
   waiting file, prints it in place of the last message — behind a pencil glyph in the line's own
   colour (the kit's `ListRow.subtitleIcon`; a red label was tried and dropped — red is the unread
   badge's, and a word takes width the draft needs), the text on one line, or the file's name, or how many.
   The time and the unread badge still speak for the last message. A thread's draft is not shown on
   its room's row.

## Consequences

- **Half a message survives leaving the room**, a restart, and a push banner tapped mid-sentence —
  and no longer lands in the room the banner opened.
- **Files picked for one room cannot be sent from another.**
- **Files do not survive a restart** while the text does. A person who comes back finds their
  caption and has to pick the file again.
- **Unsent text sits in local storage** until it is sent, cleared, pushed out by fifty newer drafts,
  or signed out of. It is the person's own words on their own device, and no server sees it.
- **Every keystroke writes the store**, and through it local storage. The value is one short string
  per conversation; it has not been measured as a cost.
- **Page files held in other rooms keep their memory** for as long as the app runs, up to ten files
  of up to 50MB per room, from a browser's files input. A shell file holds nothing.

## Alternatives

- **Clear the waiting files when the conversation changes.** Simpler, and it stops the wrong-room
  send. But a person who checks another room before writing the caption loses the pick, and the text
  would then be kept while the files beside it were not.
- **Keep the drafts on the server**, so they follow the account to another device. There is no
  server field for it, and a draft is a convenience of one device, as the recent emoji are.
- **Draft the in-app pick too.** It holds photo-library identifiers and edits that are only
  meaningful while the panel's grid is loaded, and the panel already lets it go on dismiss.
