# ADR-0182: Files from the files entry wait above the composer and take the typed text as their caption

> Status: Accepted · Decided: 2026-10-08 · Implemented: `feat/chat-file-send-and-room-profile` · Scope:
> `apps/web/src/app/features/channels/` (`ChatImageAttach`) · `libs/web-ui-kit` (`PickedFileStrip`)
> · Supersedes in part [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md):
> its decision 1, "the pick is the send", for the attach sheet's "choose from files" entry · Narrows
> [ADR-0179](./0179-the-in-app-photo-pick-waits-for-a-send-in-a-panel-in-the-keyboards-place.md)
> decision 1, which kept every path but the in-app pick on "the pick is the send"
> · The module doc is [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

ADR-0123 made the pick the send: whatever passes the check goes at once, with no tray, caption or
confirmation. ADR-0179 took the in-app photo pick out of that rule. Its picks wait — in the attach
panel, and above the composer's field once the panel closes — and the composer's send button sends
them with whatever is typed as the message's own text. Every other path stayed as it was: the photos
entry's file input, the camera, and both entries of the files sheet, "choose from album" and "choose
from files".

A document is rarely sent without a word about it: "here is the contract", "the minutes, see page 3".
From the files entry today the document goes the moment it is picked, and the words follow as a
message of their own — two messages, two read markers, and a message from someone else free to land
between them. The message itself can already carry both: a message holds `content` and `upload$$`, the
feeds draw text and uploads together, and `sendImages` takes `content` as the caption since ADR-0179.

What the code had to work with:

- **A file from the app is only an address.** The app's documents picker copies each pick into its own
  folder and answers with a `ShellFileRef` — the address, name, type and size, never the bytes. Holding
  one costs the page nothing, but the app sweeps that folder of picks older than a day. The documents
  picker offers the four photo formats too; the page reads such a photo's bytes (`ReadAttachment`, one
  at a time) so it is resized and given a thumbnail like any photo.
- **The page's own files input** returns real `File`s, which a waiting row holds in page memory, up to
  the document limit of 50MB each.
- **The composer already has a row above its field** (`strip`) and a send button that can be live with
  an empty field (`sendReady`), both from ADR-0179. In a browser the row did not exist, since there is
  no in-app pick there.
- **One message holds at most ten uploads** (`IMAGE_MESSAGE_SLOT_MAX`), whatever their kind.

## Decision

1. **Only "choose from files" changes** — the app's documents picker and the page's own files input.
   "Choose from album", the photos entry's file input and the camera still send at once. Those are
   photo paths, and a photo is most often sent for itself; holding them would add a press to the most
   common send for a caption that is rarely typed.
2. **What passes waits above the composer's field**, as a row of chips — the kind's glyph, the name
   cut short with its extension kept, the size, and × (the kit's `PickedFileStrip`). It sits in the
   same `strip` as the in-app pick's thumbnails, under them when both wait, nearest the field. In a
   browser `strip` exists while a file waits.
3. **The judgement is made at the pick, exactly as today.** Formats, each kind's size limit, the same
   item twice and the per-message limit, with the one notice for the first reason met. The waiting files
   are judged again with each new pick, ahead of it, so a page file picked a second time is refused as
   `duplicate`.
4. **The limit counts the waiting files and the in-app pick together**, as one message. A file over it
   is refused under the existing `limit` notice. The app's files picker is asked for no more than the
   room left, and is not opened at all when there is none — the notice shows instead, since some system
   pickers read a limit of 0 as no limit. The grid and the recent row lock their unpicked tiles at what
   the waiting files leave.
5. **The composer's send button sends them, with the typed text as their caption.** The button is live
   while a file waits. With an in-app pick waiting too, the press reads the pick and sends the photos
   and the files as one message, photos first, with the caption; the "묶어 보내기" box is the grid's and
   speaks for its photos alone, so it does not split that message. A pick that cannot be read keeps the
   files waiting and puts the caption back. The grid's and the editor's "N장 보내기" send the photos
   alone, as before, and leave the files waiting. A photo among the files from the app is read at the
   press, not at the pick: it waits as an address like any shell file, and is judged at the pick by the
   type and size the app reported, so one over the photo limit is refused before its bytes are read. One
   that cannot be read at the press is refused alone (`unreadable`) and the rest go.
6. **Only × on a chip and the send let a file go.** Closing the panel — its ×, Escape and Android back
   included — clears the in-app pick and not the files: they were never in the panel. The files belong
   to their room or thread: moving to another one — leaving the page, or with the page kept mounted,
   as the router does when only its params change (a push banner tapped in one room) — puts that
   one's waiting files in their place, and coming back finds them while the app runs. A file picked
   for one room is never sent from the next. How a conversation keeps them, with its typed text, is
   [ADR-0183](./0183-each-conversation-keeps-its-composer-draft.md). A composer lock hides the row and holds the send, as it does for the thumbnails; while a
   send reads the in-app pick the button waits, so the files cannot go twice.

## Consequences

- **A document with words about it is one message**, with one read marker and one set of reactions,
  and nothing can land between the file and its text.
- **Sending a document is one more press.** Pick, then send — where the pick alone used to send it. A
  person who wants it gone at once presses send with the field empty.
- **A pick that waited a day can fail at the send.** The app sweeps its pick folder of copies older
  than a day; a file still waiting then is gone, and the send fails as any gone shell file does, as a
  failed message that offers delete. The page keeps no clock for it.
- **Page files waiting hold page memory** — up to ten files of up to 50MB from a browser's files input,
  until they are sent or removed. A shell file holds nothing, a photo from the app's files picker
  included: its bytes are read only at the send, one photo at a time, and go with it.
- **A photo from the app's files picker is read at the send**, so the press can take a moment longer
  and a photo the app can no longer read is refused then rather than at the pick.
- **The waiting files are part of the room's draft** (ADR-0183): kept per room or thread for as long
  as the app runs, beside the typed text that is kept across restarts, and shown on the chat list's
  row for the room.
- **The composer can grow by two rows** while photos and files both wait, about 70 px for the
  thumbnails and 60 px for the chips.
- **While files wait, every press of the send button sends them**, as with a waiting photo pick: a text
  meant as a message of its own waits until the files are sent or removed.
- **Holding needs no app release and no new bridge message.** The pickers, the judgement and
  `sendImages`'s `content` all exist, so an installed app holds files as soon as the web ships.
  Widening what the app's documents picker offers to every format the server takes is a separate
  native change and does need a release; until then the installed picker offers documents only.
  desktop-web has its own tray and is unaffected.

## Alternatives

- **Hold every path, the album and the camera included.** One rule for every pick. But it adds a press
  to the photo sends that are most of what is sent, and the camera returns one photo the person has
  just looked at — there is nothing left to decide before it goes. The in-app pick already waits, so a
  photo that wants a caption has a path that takes one.
- **Send the text as a message of its own right after the files.** No waiting row, and the field keeps
  working as before. But it is the two messages this change exists to remove: two read markers, two
  sets of reactions, the text numbered at the press while the files are numbered only once their
  uploads finish, and a message from someone else free to land between them. ADR-0179 rejected the same
  shape for photo captions.
- **A confirm sheet after the pick, with a caption field of its own.** The pattern of some desktop chat
  apps. But it puts a second text field and a second send button beside the composer's, which the
  attach panel was redesigned to remove (ADR-0179), and the file would not be on screen next to the
  field where the rest of the conversation is typed.
- **Clear the files when the panel closes**, as the in-app pick is. One rule for "dismiss". But the
  files are not shown in the panel — they wait above the field from the moment they are picked — so
  closing a panel they were never in would throw away something the person can still see.
- **Show thumbnails for photos and videos picked from files.** It would match the in-app pick's row,
  but a shell file has no bytes in the page — a photo is read only at the send — and reading one only to
  draw a 48 px tile costs a whole photo's bridge read per file and keeps it in page memory while it
  waits. The chip says which file it is, which is all the row has to do.
- **Read a photo from the files picker at the pick**, as the album's are. The send would start at once,
  but up to ten prepared photos would sit in page memory for as long as a caption takes, for no gain
  the chip can show.
