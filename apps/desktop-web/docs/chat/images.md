# Images

The composer takes images from the "+" button, a drop, or a paste. They wait in a tray, and they go
out with the message: the text first, then one image message with the pictures. In the feed they are
tiles that open a full-image viewer.

The send itself is the runtime's, shared with apps/web: `data.useSendImages`, documented in
[`libs/app-runtime/docs/data/image-send.md`](../../../../libs/app-runtime/docs/data/image-send.md).
ADR-0128 records why desktop uses it. This document covers the screens. ADR-0129 records where they
depart from the Figma frames.

Components are in `features/chat/components/images/`, and the tray state is in
`features/chat/hooks/useImageAttachments.ts`.

## Adding images

- **"+"** (`AttachButton`) opens the OS picker directly. It used to open a menu whose only entry did
  the same.
- **Drop:** `AttachmentDropOverlay` covers the pane while files are dragged over it. It says images,
  because only images are taken.
- **Paste:** pasted files join the tray. A rich copy (Excel, Word: `text/html` or `text/rtf` on the
  clipboard) also carries its text, and that text goes into the message as plain text. A file copied
  in Finder or Explorer carries only its own name as `text/plain`, and that is not inserted.

Every batch goes through `validateAttachments` (`features/chat/utils/chatImages.ts`), which counts
refusals by reason:

- `unsupported`: not PNG, JPEG, GIF or WebP.
- `duplicate`: the same name, size and modification time as a file already in the tray or in the same
  batch.
- `limit`: over `MAX_ATTACHMENTS` (10).

The hook reports every reason in **one toast**. An unsupported file uses the destructive tone; a limit
or a duplicate is only information. This was a blocking dialog that named only the first reason, so
a mixed drop never said what else it left out.

## The tray

`ComposerAttachments` is one row of 92px tiles that scrolls sideways, with an `n/10` counter. The
row used to wrap, and ten images took about 40% of the window. A preview shows a spinner until its
`<img>` has decoded; the tray tracks that itself rather than decoding each file a second time.

The remove "×" sits on each tile's top-right corner. It surfaces on hover or focus (see
[keyboard.md](./keyboard.md#hover-revealed-controls)). Removing a tile moves focus to the tile that
takes its place, or to the message input once the tray is empty. A live region announces what joined
or left the tray.

## Tiles in the feed

`MessageImages` shows one image as a 180px tile, and several as a two-column grid of up to four. The
fourth tile counts the rest ("+n"). `ImageTile` states:

| State     | Looks like            | Says (button name)              |
| --------- | --------------------- | ------------------------------- |
| sent      | the thumbnail         | "Open {name}"                   |
| uploading | blurred, with spinner | "Uploading {name}", `aria-busy` |
| failed    | an image-off glyph    | "This image couldn't be loaded" |
| overflow  | dimmed, with "+n"     | "n more images"                 |

An uploading or failed tile is `aria-disabled`, not `disabled`, so it stays in the tab order and a
screen reader reaches it. A disabled button is skipped, and the upload, and its failure, had no
presence at all.

Save, copy and delete (`ImageActions`) are three icon buttons over the tile's corner. Delete shows
only where the reader may delete. They used to sit in a "More" menu, which for an image someone else
sent held only Copy.

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

A message with images and no text still says something in the sidebar row and in the OS
notification: "Photo", or "3 photos" (`shared/utils/messagePreview.ts`). It counts from `upload$$`,
or from the `uploadIds` a channel head carries, the same way apps/web does. It used to leave a blank
line, and the banner read "Raine:" with nothing after it.
