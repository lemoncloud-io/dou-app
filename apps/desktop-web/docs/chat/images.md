# Images, videos and documents

The composer takes images, MP4 videos and documents from the "+" button, a drop, or a paste. They
wait in a tray, and they go out with the message: the text first, then one attachment message with
the files. In the feed images are tiles that open a full-image viewer; a video plays in place, and a
document is a card that saves it.

The send itself is the runtime's, shared with apps/web: `data.useSendImages`, documented in
[`libs/app-runtime/docs/data/image-send.md`](../../../../libs/app-runtime/docs/data/image-send.md).
ADR-0135 records why desktop uses it. This document covers the screens. ADR-0129 records where they
depart from the Figma frames.

Components are in `features/chat/components/images/`, and the tray state is in
`features/chat/hooks/useImageAttachments.ts`.

## Adding files

- **"+"** (`AttachButton`) opens the OS picker directly. It used to open a menu whose only entry did
  the same. Its `accept` is `CHAT_ATTACHMENT_ACCEPT` from `@chatic/data`: every type and every
  extension, because a picker that does not know HWP's type only offers the file by its extension.
- **Drop:** `AttachmentDropOverlay` covers the pane while files are dragged over it, and says files.
- **Paste:** pasted files join the tray. A rich copy (Excel, Word: `text/html` or `text/rtf` on the
  clipboard) also carries its text, and that text goes into the message as plain text. A file copied
  in Finder or Explorer carries only its own name as `text/plain`, and that is not inserted.

Every batch goes through `validateAttachments` (`features/chat/utils/chatImages.ts`), which counts
refusals by reason:

- `unsupported`: not a format the server takes. `chatAttachmentFormat` in `@chatic/data` decides:
  PNG, JPEG, GIF and WebP images, MP4 video, and PDF, DOCX, XLSX, PPTX, HWP, HWPX and TXT documents.
  An empty or generic type (HWP arrives untyped on most systems) is read from the extension. A
  video or document whose extension names another format is refused, because the receiver saves it
  under that name.
- `too-large`: over its kind's limit, the same as the server's: images 20 MB, videos 300 MB,
  documents 50 MB. The server would refuse it with a 413 only after the whole transfer.
- `duplicate`: the same name, size and modification time as a file already in the tray or in the same
  batch.
- `limit`: over `MAX_ATTACHMENTS` (10).

The hook reports every reason in **one toast**. An unsupported file uses the destructive tone; a limit
or a duplicate is only information. This was a blocking dialog that named only the first reason, so
a mixed drop never said what else it left out.

## The tray

`ComposerAttachments` is one row of 92px tiles that scrolls sideways, with an `n/10` counter. The
row used to wrap, and ten images took about 40% of the window. An image's preview shows a spinner
until its `<img>` has decoded; the tray tracks that itself rather than decoding each file a second
time. A video or document has no preview and no object URL: its tile shows a kind icon, its name and
its size.

The remove "×" sits on each tile's top-right corner. It surfaces on hover or focus (see
[keyboard.md](./keyboard.md#hover-revealed-controls)). Removing a tile moves focus to the tile that
takes its place, or to the message input once the tray is empty. A live region announces what joined
or left the tray.

## Tiles in the feed

`MessageImages` shows one image as a 180px tile, and several as a two-column grid of up to four. The
fourth tile counts the rest ("+n"). `ImageTile` states:

| State     | Looks like                                                | Says (button name)              |
| --------- | --------------------------------------------------------- | ------------------------------- |
| sent      | the thumbnail, or the original when there is none (a GIF) | "Open {name}"                   |
| uploading | blurred, with spinner                                     | "Uploading {name}", `aria-busy` |
| failed    | an image-off glyph                                        | "This image couldn't be loaded" |
| overflow  | dimmed, with "+n"                                         | "n more images"                 |

An uploading or failed tile is `aria-disabled`, not `disabled`, so it stays in the tab order and a
screen reader reaches it. A disabled button is skipped, and the upload, and its failure, had no
presence at all.

Save, copy and delete (`ImageActions`) are three icon buttons over the tile's corner. Delete shows
only where the reader may delete. They used to sit in a "More" menu, which for an image someone else
sent held only Copy.

"Download all" (in the feed and in the viewer) saves each image of the message in turn
(`downloadImages`). In the desktop app every image save goes straight into the Downloads folder,
with no dialog, and a name already there gets a number ("image (1).png"). The shell does this
(`apps/desktop/src/main/downloads.ts`): Electron's default is a save dialog per file, so saving six
images opened six dialogs. Only a PNG, JPEG, GIF or WebP whose name has the matching extension skips
the dialog; any other file still asks, so a script in the page cannot drop an executable unseen. In
a browser, Chrome may ask once whether the site may download several files.

Save and copy fetch the image's bytes (`fetchImage`) rather than pointing an anchor at its address:
a sent image lives on another origin, where Chromium ignores `download` and navigates instead. That
fetch skips the HTTP cache on purpose. The viewer, and a tile with no thumbnail, has usually drawn
the same signed address already — both read it from the same message the save does — through an
`<img>` that sends no `Origin`, and storage answers such a request without CORS headers or
`Vary: Origin`. The answer carries no `Cache-Control`, so Chromium keeps it for a while by
heuristic, and a CORS fetch that reuses it fails with "No 'Access-Control-Allow-Origin' header"
until the copy goes stale.

## Videos and documents in the feed

`toChatFiles` takes a message's videos and documents from its `upload$$`, and `toChatImages` takes
only the images, so the grid, "Download all" and the viewer never see a PDF. The kind is the
upload's `stereo`; a slot being sent reads it from the content type it kept. An image is named by
the upload's `name` — the one-image caption, the viewer and the saved file — and one with no name
(sent before the server kept names, or still being sent) by its place: `image-1`. `MessageFiles`
lists them under the images:

- **A video** plays in place (`<video controls preload="metadata">`). The original is signed for
  inline viewing, and Chromium plays an H.264 MP4 itself. There is no poster: the app sends none.
- **A document** is a card with a kind icon, its name and size, and a save button.
- **Being sent**, either is the same card with a spinner, drawn from the name, type and size the
  pending slot kept (`localName`, `localContentType`, `localSize`), since there is nothing to preview.
  **Failed**, the card says so, and the message's retry resends it with the rest.
- **An upload from before the server kept names** has none; its card says "File" or "Video".

Saving goes through `downloadImage`, the same fetch-then-save as an image, under the upload's `name`,
or "file" for an upload with none; the extension comes from the type the bytes arrive with. The
name is the one the sender's app declared, and the app does not check it against the type again: the
server refuses, at upload, a video or document whose name ends in another format's extension.
The address must be `https:`; anything else is treated as nothing to load. A video or document is
never saved without asking: the shell skips the dialog for images only (above).

## The viewer

`ImageViewer` is a modal dialog over a plain scrim. Previously the app was frosted behind it.

- The picture fills the stage and keeps its shape, up to twice its own size, so a small image is not
  a speck in the middle of the window.
- The alt text is the position and the sender ("Image 3 of 10 from Ada"), not the file name.
- Previous and next, save, copy and delete are always on screen.
- ←/→ step through the set, and a live region says the new position. The dialog's description says it
  once on open.
- Several images get a side column that repeats the message: the author, "n files · Download all",
  every image as a thumbnail, and "Reply", which continues in the thread.

Closing returns focus to the tile that opened it (ui-kit's dialog focus return, ADR-0131).

## Previews outside the feed

A message with attachments and no text still says something in the sidebar row and in the OS
notification, and it names what it carries (`shared/utils/messagePreview.ts`): "Photo" or "3 photos",
"Video" or "2 videos", "File" or "3 files", and "3 attachments" when the kinds differ. It used to
leave a blank line, and the banner read "Raine:" with nothing after it; after that it said "Photo"
for a PDF too, because the server now stores videos and documents as well.

The kind and count come from `chatAttachmentSummary` in `@chatic/data`. It counts from `upload$$`,
or from the `uploadIds` a channel head carries. Each upload's kind is its `stereo` (`image`, `video`,
`audio` or `file`), read by `uploadSlotKind`. A slot still being sent has no `stereo`: a video or
document is read from the content type its slot kept, and an image slot, which keeps none, counts as
an image, so a photo on its way never reads as an attachment. A head that only has `uploadIds`
counts as images too. Kinds
that differ, and `audio`, read as attachments (a single one as "Attachment"). The rule is meant
to match how the server picks a push's body key, so a row and its push agree.

A push from another cloud reaches the renderer with the server's `loc_key` and `loc_args` untouched
(`shared/utils/pushBody.ts`). For an attachment key the body is made here with the same labels, taking
the count from `loc_args` whether it arrives as FCM's JSON string or as an array. Without this the
banner would show the shell's body, which is the first loc arg: a bare "3". A message push with no
text, which is how an attachment-only message is pushed until the server names kinds, and a plural
key whose count cannot be read both show "New message" instead of an empty line or a wrong number.
Any other push keeps the body the shell derived. Desktop uses the sidebar's nouns rather than the
phone's sentences ("Sent 3 photos"), because the same-cloud banner already prefixes the sender.
