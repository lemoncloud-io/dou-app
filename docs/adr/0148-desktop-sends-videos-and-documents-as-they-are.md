# ADR-0148: Desktop sends videos and documents as they are, and shows them as players and cards

> Status: Accepted · Decided: 2026-09-30
> · Scope: `libs/data/src/domain/chatAttachments.ts` · `libs/app-runtime/src/data/hooks/useSendImages.ts`
> · `libs/data/src/repositories/ChatRepository.ts` (`createPendingImageChat`) · `libs/app-messages` (`PendingUploadSlot`)
> · `apps/desktop-web/src/app/features/chat/` (composer tray, `toChatFiles`, `MessageFiles`)
> · The module docs are [apps/desktop-web chat/images.md](../../apps/desktop-web/docs/chat/images.md)
> and [libs/app-runtime image-send.md](../../libs/app-runtime/docs/data/image-send.md)

## Context

The server now takes twelve formats for a chat upload: PNG, JPEG, GIF and WebP as `image`, MP4 as
`video`, and PDF, DOCX, XLSX, PPTX, HWP, HWPX and TXT as `file`. Each kind has its own size limit:
image 20 MB, video 300 MB, file 50 MB. A video or document must be named with its format's extension,
or it is refused with a 400, because the receiver saves it under that name. From
`@lemoncloud/chatic-socials-api` 0.26.903 the upload head on a message carries the file's `name`,
`contentType` and `contentSize`.

Desktop took the four image types only, and prepared every picked file on a canvas. It also drew every
upload on a message as an image tile, so a PDF someone else sent was a broken picture.

## Decision

**One format table in `@chatic/data` decides what may be sent, and a video or document goes up as it
is.**

- `chatAttachmentFormat(file)` gives the kind, the content type to declare and the name to send, or
  `null`. The declared type decides when it is one of the twelve. Otherwise the extension does,
  because a browser hands an HWP over with an empty type. A video or document whose extension names
  another format is refused. With no extension, or a tail that is not one (`v1.2`, `run.js`), it gets
  its format's extension added, so the receiver never saves a document under a name that runs as
  something else. An image name is left alone; the server does not check it.
- The composer refuses a file over its kind's limit before the transfer, not after it.
- The send path stays the image one, with a branch in the `prepare` port. An image is resized with a
  thumbnail as before. A video or document is its original, with no dimensions and no thumbnail.
  apps/web still picks images only, so its sends are unchanged.
- A pending slot keeps a video or document's `localName`, `localContentType` and `localSize`,
  because its card has no preview to draw. The fields are optional, and a rewrite of the row keeps
  them.
- In the feed, `toChatImages` takes only images, so the grid and the viewer never see a PDF.
  `MessageFiles` plays a video in place and shows a document as a card that saves it under its
  `name`. A save goes through the shell's dialog; only images skip it.
- One message carries images, videos and documents together, up to ten.

## Consequences

- **The whole file is held in memory to save it.** Saving fetches the bytes and saves them from an
  object URL, because `<a download>` does not work across origins. A 300 MB video costs 300 MB of
  renderer memory for the moment of the save.
- **An MP4 that is not H.264 may not play.** Nothing checks the codec before sending. Chromium plays
  H.264 and AAC; another codec shows a player that will not start, and the card still saves the file.
- **No `hash` is sent.** The server recommends a sha256 for videos and documents, which would stop a
  re-upload within the signing window. Computing it means reading up to 300 MB in the renderer, so it
  is left for later.
- **Older uploads have no name.** Their card says "File" or "Video", and the saved file is named the
  same.
- **The send API keeps image names** (`useSendImages`, `sendImageMessage`, `createPendingImageChat`).
  Renaming them would touch apps/web and mobile for no change in behaviour.

## Alternatives

- **A separate send path for files.** Rejected: the sequence of start, PUT, complete and send is the
  same, and `sendImageMessage` already sends no dimensions or thumbnail when it is given none.
- **Send an untyped file as `application/octet-stream`**, as the server's own fallback allows.
  Rejected: the tray can then refuse an unknown extension up front, and the card knows the kind before
  the server answers.
- **Open a document in the browser.** Only a PDF would open. One behaviour for every document is
  simpler to read.
- **Save videos and documents without a dialog, like images.** Rejected: dialog-free saving was
  allowed for images because a matching image extension cannot run. A document is also something a
  user files on purpose.
