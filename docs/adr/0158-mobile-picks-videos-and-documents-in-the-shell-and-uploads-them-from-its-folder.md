# ADR-0158: Mobile picks videos and documents in the shell, and uploads them from its folder

> Status: Accepted · Decided: 2026-10-01
> · Scope: `libs/app-messages/src/types/model/attachment-picker.ts` · `libs/data/src/{domain/chatImages,uploads/types}.ts` ·
> `libs/app-runtime/src/data/hooks/useSendImages.ts` ·
> `apps/web/src/app/{bridge/attachmentPicker.ts,runtime/upload/nativePut.ts,features/channels/components/ChatImageAttach.tsx}` ·
> `apps/mobile/ios/Bridges/{AttachmentPicker/,Transfer/Core/UploadSources.swift}` ·
> `apps/mobile/android/app/src/main/java/io/chatic/dou/{attach/,transfer/core/UploadSources.kt,module/AttachmentPickerModule.kt}`
> · The module docs are [apps/mobile attachment-picker.md](../../apps/mobile/docs/native/attachment-picker.md),
> [apps/web image-send.md](../../apps/web/docs/feature/channels/image-send.md) and
> [libs/data uploads](../../libs/data/docs/uploads/README.md)
> · Related: [ADR-0148 (desktop sends videos and documents as they are)](./0148-desktop-sends-videos-and-documents-as-they-are.md)
> · [ADR-0150 (the shell prepares the photos it hands over)](./0150-the-shell-reads-the-photo-library-and-prepares-what-it-hands-over.md)

## Context

The server takes twelve formats now — four image types, `mp4`, and seven document types — with a
limit per kind: 20MB for an image, 300MB for a video, 50MB for a document. Desktop sends videos and
documents as they are ([ADR-0148](./0148-desktop-sends-videos-and-documents-as-they-are.md)). Mobile
could send none: the attach menu's "file" entry opened the photo input, and the pre-send check knew
four image types.

Three facts make mobile different from desktop:

- **Bytes cross the bridge as base64, in one message.** `WriteTempFile` is how a page file reaches the
  shell's transfer module. A 20MB photo already has to be serialised to get through; a 300MB video is
  a 400MB message, and the WebView does not survive it.
- **An iPhone records HEVC in a QuickTime container**, and the server takes `video/mp4` only. The
  page's own file input does not help: measured on iOS 26, WKWebView hands every picked video over as
  `.mov` / `video/quicktime`, after converting it silently for up to two minutes.
- **A page upload stops with the page.** Android 15 cuts a WebView's connection about five seconds
  after the app goes to the background unless a foreground service runs; the shell's transfer module
  is one.

## Decision

**In the app, the shell picks videos and documents, keeps them, converts what needs it, and uploads
from its own folder. The page holds addresses, never the bytes.**

- **`PickAttachments` opens the OS pickers** — the photo-and-video picker for "choose from album", the
  documents picker for "choose from files" (a second step behind the menu's file entry). The shell
  copies each pick into `<cache>/attach-pick/<uuid>/` before answering and returns its address, name,
  type and size. Photos picked alongside are kept there too, as prepared copies, and answered by
  address like the rest. Their bytes still reach the page, because the page prepares every photo
  itself ([ADR-0150](./0150-the-shell-reads-the-photo-library-and-prepares-what-it-hands-over.md)),
  but one photo at a time and in pick order (`ReadAttachment`), as the in-app grid reads them. A photo
  that cannot be read is refused alone; the pick resolves once all are read.
- **The copy is made at once.** Android's picker grants read access only while the receiving screen
  lives — measured, it was gone five seconds after, even in the same process — and iOS deletes the
  picker's temp file after the callback. A copy outlives both, and a retry can send it again.
- **`PrepareVideo` makes a picked video sendable** after the pending row is shown: iOS converts with
  `AVAssetExportSession` at 1080p, steps down once to 720p when the shell's size estimate is over the
  limit, and refuses past that; Android sends an H.264/AAC file in an MP4 box as it is and refuses
  anything else. Both make a poster frame, which goes up as the upload's thumbnail.
- **The page uploads a shell file by its address** (`StartFileTransfer`), and the shell accepts an
  upload source only inside `attach-pick` or the temp-file folder. A page file that is a video or a
  document goes up by the page's own PUT and never as base64.
- **A pick is judged by one function** (`judgeChatAttachments`), page files and shell files alike: the
  twelve formats, each kind's limit, the same item twice, ten per message. A video the shell will
  convert is judged as the `mp4` it becomes and not by its source size, which the conversion decides.
- **A converted video is judged again**, and a refusal fails that video alone. The conversion runs in
  `useSendImages` before the upload sequence, since the sequence fails the whole message when its
  preparation throws.
- **Old apps and browsers use the page's inputs.** An app without the picker answers `NOT_FOUND`, and
  the page opens its own input when that answer comes within 800ms of the tap — iOS lets a page open a
  file input only within about a second of the gesture — and otherwise asks for another tap, which
  then opens it at once. iOS WebKit's input gets photos only, with a line that an update sends videos
  (inside the app) or that videos can be sent from the app (in a browser).
- **The folder is swept, not emptied at ack.** Folders untouched for a day go at the next pick.

## Consequences

- **A 300MB video never touches page memory**, and it keeps uploading with the app in the background.
- **The web ships first and degrades.** An old app keeps the page inputs and the page PUT: documents and
  `mp4` go up while the app is in front; iOS videos cannot be sent until the app is updated.
- **A sent video's copy can sit in the cache for up to a day.** Deleting at the transfer's
  acknowledgement would break the poster, which is PUT after the original is acknowledged, and every
  retry, which sends the same files again. After the OS purges the cache a retry fails with `SOURCE`
  and the row can only be deleted.
- **iOS caps a video at about four minutes** (720p runs at about 76MB a minute on the simulator's
  encoder, so 300MB lands near 3.9 minutes). The notice names the length; a device's hardware encoder
  may move it.
- **A refused video that would only fail again can only be deleted.** `TOO_LARGE`, `UNSUPPORTED`, a
  conversion over the limit, or a file the shell lost leaves its message delete-only; only a failure in
  passing — the conversion stopped because the app left the screen — offers a retry. A retry that
  converts the same file to the same result would cost minutes and end where it started.
- **Ten photos reach the page as ten messages, not one.** Each costs a round trip, but no single message
  is larger than one prepared photo.
- **Android refuses a phone that records HEVC.** Converting would need a transcoding library, which is
  left for when the refusals show it is worth one.
- **The pick-time judgement trusts the shell's size for photos (as prepared), documents and Android
  videos only.** An iOS
  source is often larger than its conversion — a minute of 4K HEVC is about 170MB — so it is not held to
  the limit before converting.

## Alternatives

- **Answer picked photos as base64 in the pick itself.** Rejected: ten photos are one message of some
  200MB of base64, which can take the WebView down the way a video would.
- **Stream the page file to the shell in chunks.** Rejected: still pushes every byte through the bridge
  as base64, and the shell already has a picker that hands it the file directly.
- **Let the page's input pick, and convert in the page.** Rejected: iOS WebKit gives a QuickTime file
  after a silent conversion of its own, and a page has no H.264 encoder short of a WebAssembly one.
- **Hand the page the picker's own URI** (`content://`, the iOS temp file). Rejected: both expire before
  a background upload or a retry needs them.
- **Convert inside the sequence's `prepare` port.** Rejected: a throwing preparation fails the whole
  message, and one refused video must not take the photos beside it down.
- **Delete the copies once each upload is acknowledged.** Rejected: see the poster and retry above.
- **Media3 Transformer on Android.** Deferred, not rejected: no new dependency until the refusals show
  how many phones record HEVC.
