# Attachment picker

Videos and documents for a chat message are picked, kept and prepared by the shell. Their bytes never
cross the bridge: a 300 MB video sent as base64 is one 400 MB message, which the WebView does not
survive. The shell opens the OS picker, copies what was picked into a folder of its own, and answers
with each copy's `file://` URI. The web uploads from that URI with `StartFileTransfer`
([file-transfer.md](./file-transfer.md)), and before that asks `PrepareVideo` to make each video ready
to send. Photos picked here are kept the same way, already prepared as the in-app photo grid prepares
them ([photo-library.md](./photo-library.md)), and the pick answers with their addresses too. Their
bytes do cross, because the web resizes every photo itself, but later and one photo at a time
(`ReadAttachment`): ten photos in the pick's own answer would be one message of some 200 MB of base64,
which can take the WebView down just as a video would.

## Files

| Layer             | File                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Messages          | `libs/app-messages/src/types/model/attachment-picker.ts`                                                                                                                                                                 |
| WebView handler   | `src/app/webview/hooks/attachmentPickerHandlers.ts`, `useAttachmentPickerHandler.ts`                                                                                                                                     |
| TS native wrapper | `src/app/bridge/AttachmentPickerBridge.ts`                                                                                                                                                                               |
| iOS               | `ios/Bridges/AttachmentPicker/` — `AttachmentPicker.swift`, `Core/AttachmentPickerCore.swift` (pure rules)                                                                                                               |
| Android           | `module/AttachmentPickerModule.kt`, `attach/PickedCopies.kt` (copy and video check, shared with the photo grid's `KeepLibraryVideo`), `attach/core/AttachPickRules.kt` (pure rules), `bridge/AttachmentPickerPackage.kt` |
| Tests             | `ios/ChaticTransferCoreTests/AttachmentPickerCoreTests.swift`, `test/.../attach/core/AttachPickRulesTest.kt`                                                                                                             |

## Messages

| Request           | Reply               | What it does                                                                    |
| ----------------- | ------------------- | ------------------------------------------------------------------------------- |
| `PickAttachments` | `OnPickAttachments` | Opens the picker; answers once it closed and every picked item was copied       |
| `PrepareVideo`    | `OnPrepareVideo`    | Writes a picked video as an H.264 `mp4` ready to upload, and a poster beside it |
| `ReadAttachment`  | `OnReadAttachment`  | Answers one kept photo's bytes as base64, in the shape `ReadPhoto` answers      |
| `ReadVideoFrame`  | `OnReadVideoFrame`  | Answers a JPEG of one frame of a received video, read from its signed address   |

`PickAttachments` takes `{ source: 'media' | 'document', selectionLimit, maxBytes }`: which picker,
how many more items the message may take (what is left of ten), and the server's per-kind ceilings
(`image`, `video`, `file`). The handler checks each field — a source it does not know, a limit that is
not a positive integer, or a ceiling that is not a positive number is `INVALID` before native code
runs — and hands native only the three ceilings. A cancelled picker is a success with nothing picked,
not an error. Other failures are `BUSY` (a picker is already open) and `INTERNAL` (no screen to present
it on, or anything native did not name).

`PrepareVideo` takes `{ uri }`, a picked video's URI. A missing or empty one is `INVALID`. Native fails
with `TOO_LARGE`, `UNSUPPORTED`, `SOURCE`, `SYSTEM` or `INVALID`; anything else reaches the web as
`SYSTEM`, a failed conversion.

`ReadAttachment` takes `{ uri }`, a picked photo's URI — one from `media`, or a photo picked through
the documents picker — and answers
`{ base64, mimeType, fileName, width, height }`. A missing or empty one is `INVALID`. Native fails with
`INVALID` (not a picked file), `SOURCE` (the copy is gone) or `INTERNAL` (anything else — on iOS also
a photo that cannot be decoded). The web asks for one photo at a time, in pick order, waits up to two
minutes for each, and refuses only the photo whose read failed, as `unreadable`; the pick resolves
once every photo is read, so the pending row appears with all of them, as it does from the grid. What
may be read differs by platform. iOS reads only a file whose extension is one a prepared photo is
kept as (`jpg`, `jpeg`, `png`, `gif`, `webp`) and refuses anything else with `INTERNAL`, so a video in
the same folders is never turned into base64. Android reads any file at the right place and types it
from its extension. `ReadAttachment` has no `NOT_FOUND` fallback of its own: it ships in the same
build as `PickAttachments`, so an app that answers a pick answers this too.

`ReadVideoFrame` takes `{ url, atMs, maxEdge }` — a received video's signed address, where to take the
frame (the web sends 500) and the frame's long edge (400) — and answers `{ base64, contentType, width,
height }`. It is the tile's first frame for a video that came without a poster: the page cannot make
one in the app, because the WebView loads no media before a tap. The handler passes only an `https:`
address to native code — anything local would make the call a reader of the app's own files — and a
negative time or a non-positive edge is `INVALID` too. Native answers `INVALID` or `UNREADABLE`
(network, an expired address, a codec, no frame); anything else reaches the web as `UNREADABLE`, and
the log carries the code alone, never the signed address. Native reads the remote file itself (iOS
`AVURLAsset` + `AVAssetImageGenerator`, Android `MediaMetadataRetriever.setDataSource(url, …)`), so it
needs no CORS on the bucket, and writes nothing to disk. The frame follows the poster rule below
(`atMs`, or the first frame of a shorter video; never upscaled; JPEG from 0.7 down to fit 200,000
bytes). At most two run at once. iOS gives up after 20 s and cancels the read; Android answers
`UNREADABLE` after 20 s but cannot cancel `MediaMetadataRetriever`, so a stuck read keeps its thread
until it returns.

**Which file a URI may name.** `PrepareVideo` and `ReadAttachment` accept only a file at exactly
`attach-pick/<uuid>/<file>` — what a pick wrote, and where a video's results go beside it. A file
directly in `attach-pick/`, one deeper than a pick folder, or anywhere else is `INVALID`, and so is a
symbolic link that resolves out of its folder. Android refuses a path with a `..` segment outright;
iOS normalises the path first, so a `..` cannot climb out.

**No handler ever answers `NOT_FOUND`.** The router registers the first three only when the native
module exists (`AttachmentPickerBridge.isAvailable`), and `ReadVideoFrame` only when the module also has
`readVideoFrame` (`canReadVideoFrame`) — it came later, and an app without it must answer `NOT_FOUND`
so the web draws the tile another way. So a JS bundle run over a native build without it
answers `NOT_FOUND` — the web's signal to open its own file input for the rest of the page's life. A
registered handler mapping one failed pick to `NOT_FOUND` would turn that fallback on for a shell
that has the picker.

**Timeouts are the web's.** A pick answers when the person is done and every copy is written; a
conversion can take minutes. The RN handler waits as long as native does, and the web gives each
request its own wait (ten minutes for `PrepareVideo`), dropping an answer that arrives after it.

## Picking

- **iOS.** `media` is `PHPickerViewController` over images and videos, with
  `preferredAssetRepresentationMode = .current` — the asset as stored, not a compatibility transcode
  the picker would make while the person waits. It needs no photo library permission. A
  `selectionLimit` below 1 is raised to 1, since 0 means "no limit" to PHPicker. An item that offers
  both an image and a video — a Live Photo — goes as its still. `document` is
  `UIDocumentPickerViewController(forOpeningContentTypes:asCopy: true)` with the UTTypes of twelve of
  the formats the server takes — PNG, JPEG, GIF, WebP, MP4 and the seven document formats, not ZIP —
  so a photo or video kept in Files can be sent too; it cannot cap a selection, so a pick past the
  limit is cut by the web's own count.
- **Android.** `media` is the Photo Picker (`PickMultipleVisualMedia`, images and videos), which needs
  no permission. A device without the system picker (API 30 without the SDK extension) falls back to
  `ACTION_OPEN_DOCUMENT` through androidx, and the result is read by the same code. `document` is
  `ACTION_OPEN_DOCUMENT` with the MIME types of twelve of the formats the server takes (`image/png`,
  `image/jpeg`, `image/gif`, `image/webp`, `video/mp4` and the seven document types, not ZIP) plus
  `application/octet-stream`, which is how an HWP usually arrives, and the four labels Hancom's own
  apps declare for HWP and HWPX. A media
  pick of one item uses `PickVisualMedia`; more uses `PickMultipleVisualMedia`, capped on API 33+ at
  what the system picker allows. Results past the limit are dropped.
- **Everything picked is copied before the reply,** into `<cache>/attach-pick/<uuid>/<name>`, one
  folder per item. The upload starts later — after the web judged the files and wrote the pending
  message — and the URI an OS picker hands over does not live that long:
    - Android's grant on a picker URI ends when the screen that received the result closes, even with
      the app alive: the same process read it 5 seconds later and got a `SecurityException`. So the
      copy runs inside the result callback, while that screen is still there.
      The copy runs on a worker thread, started from that callback: the grant lasts as long as
      `MainActivity` does, not only the main thread's turn, and ten 300 MB copies on the main thread
      would freeze the app into "not responding". `MainActivity` destroyed while the picker is open
      ends the pick as `INTERNAL` rather than leaving it `BUSY`. `takePersistableUriPermission` would
      keep the grant, but a copy makes it unnecessary, and the transfer then never has to read a
      `content://` URI at all. Copying 300 MB took under a second on an emulator.
    - iOS deletes the temporary file a picker hands over once the callback returns.
- **Photos** picked from `media` are prepared exactly as `ReadPhoto` prepares a photo from the grid —
  the same code: location removed, HEIC and the other formats the server does not take written as
  JPEG. The prepared photo is kept in a pick folder of its own (`IMG_0002.jpg`) and answered as a
  reference, `{ kind: 'image', uri, name, contentType, size, width, height }`; its bytes are read
  later with `ReadAttachment`. One still over `maxBytes.image` after preparation is refused
  `too-large`. On Android a photo that cannot be converted is `unsupported` and one whose copy fails is
  `unreadable`; its width and height are read from the prepared bytes, swapped for a 90° or 270°
  rotation.
- **A `document` pick is a `file`, whatever it is.** Neither shell looks inside it: a PNG from Files
  is copied as it is, not prepared, and answered as `{ kind: 'file', contentType: 'image/png', … }`
  under the type the OS gave it. The documents picker offers twelve of the server's formats and, on
  Android, the generic types an HWP the system does not know arrives under (`application/octet-stream`
  and the Hancom labels) — no wildcard, and no photo or video type the server would refuse (HEIC,
  QuickTime). ZIP, the thirteenth, is not offered: a `.zip` the system types as `application/zip` is
  greyed out. On Android one it types generically can still be picked; the web refuses it as
  `unsupported`, since the phone sends no archive. The web tells a photo among them by its format,
  reads it with `ReadAttachment` and prepares it as it prepares any photo; an `.mp4` goes to `PrepareVideo` by its format (below). That
  works with builds that shipped before the picker offered photos: `ReadAttachment` reads any picked
  file named as one of the four photo formats on both platforms. So iOS names the copy of a photo
  whose name lacks its extension (`scan`, typed `image/png`) with one appended (`scan.png`), the
  base cut so the name still fits 255 bytes.
- **A `document` pick is held to the limit its format implies.** It is reported as a `file`, but the
  web sends a photo or an `.mp4` from it as a photo or a video, and the server caps those at their own
  limits. So the shell checks it against `maxBytes.image` when it is PNG, JPEG, GIF or WebP,
  `maxBytes.video` when it is MP4, and `maxBytes.file` otherwise — a 120 MB `.mp4` from Files passes,
  a 30 MB PNG does not — and refuses it under that kind. The OS's type decides; only when there is
  none, or it is `application/octet-stream`, does the name's extension. The rule is
  `limitKindForDocument` in `AttachmentPickerCore` and `AttachPickRules`. Nothing from here is
  converted, so a video is checked at its own size.
- **The shell refuses before it copies.** A video or document over its ceiling is listed in `refused`
  as `too-large` and not copied; one that cannot be read is `unreadable`. Every `refused` entry carries
  the item's `kind` (`image`, `video` or `file`), so the web names the limit that was passed — 20 MB for a
  photo, 300 MB for a video, 50 MB for a document — rather than one notice for all three. The web
  reports those as it reports its own refusals, and judges what was copied once more — it does not
  rely on the shell.
- **A video iOS will convert is not size-checked at pick.** A picked video that is not already an
  `.mp4` with an H.264 (`avc1`/`avc3`) track, AAC or no audio, and a frame within 1920×1080 either way
  round is answered with `needsExport: true` and the source's own name, type
  and size (`IMG_0001.MOV`, `video/quicktime`). Its size after conversion is not known yet, so the
  ceiling is applied by `PrepareVideo` instead; refusing a 400 MB `.mov` that converts to 200 MB would
  refuse a video that can be sent. A video whose tracks cannot be read at pick is refused
  `unreadable`.
- **Names.** Android's Photo Picker names a file after its media id (`1000000123.mp4`). A name made
  only of digits is replaced with `video-<yyyyMMdd-HHmmss>.mp4` (`photo-…` for a photo), from the
  capture time, or the pick time when there is none. The documents picker gives the real name, which
  is kept. A name whose extension is missing or does not match the format is left alone — the web's
  judgement adds the extension or refuses the file.
- **Type.** `contentType` is what the OS declared, `application/octet-stream` when it does not know
  the format (HWP); the web corrects it from the extension. A video or document of a type the shell
  cannot name is still returned for the web to judge.

## Preparing a video

`PrepareVideo` is asked for every shell file whose format is a video, converted or not: the poster is
made here. The web decides that by the name's format, not by the `kind` the shell answered, so an
`.mp4` picked through the documents picker is checked and gets a poster too. Its result is written
into the same `attach-pick/<uuid>/` folder as its source, and its `name` is the picked name with the
extension changed to `.mp4`.

- **iOS converts what needs it.** A source that needs no export (the rule above) is sent as it
  is; the check (loading the tracks and their format) costs about 80 ms the first time and a few ms
  after. Anything else goes through `AVAssetExportSession` with `AVAssetExportPreset1920x1080`,
  `.mp4` output and `shouldOptimizeForNetworkUse`, which puts the index (`moov`) right after `ftyp`, so
  the web can start playing before the whole file has arrived. A `.mov` source stays beside its
  `.mp4`; an `.mp4` source that needed converting (an HEVC `clip.mp4`) is replaced through a hidden
  staging file, so a retry with the same URI finds it ready and only makes the poster. Each export
  writes a staging file of its own name (`.export-<uuid>.mp4`), so two exports never write into one
  file. iOS never answers `UNSUPPORTED`.
- **One conversion per video at a time (iOS).** The web stops waiting after ten minutes, and its retry
  can ask again while the first export is still running. A `PrepareVideo` for a source path that is
  already being prepared joins the running job and gets its answer, rather than starting a second
  export that would write the same result and poster. Once the job ends it is forgotten, so a later
  call runs afresh.
- **Size is decided before converting, in at most two steps.** The session's
  `estimatedOutputFileLengthInBytes` (the async one — the old synchronous `estimatedOutputFileLength`
  answers 0) was within 1–2 % of the result when measured. Over the 300 MB video limit at 1080p, the
  preset steps down once to `AVAssetExportPreset1280x720`; still over, the answer is `TOO_LARGE`. There
  is no lower step: measured on a simulator, 1080p runs about 109 MB a minute and 720p about 76 MB, so
  the limit lands near 2.7 and 3.9 minutes of video, which is why the web's notice says about four
  minutes. The estimate can still be a little short; the
  web checks the result's size again and fails that one video when it is over. When the session gives
  no estimate at all, the export goes ahead and that re-check decides.
- **A conversion runs in the foreground.** `AVAssetExportSession` has no background time, and iOS may
  stop it when the app leaves the screen. That ends as `SYSTEM`; the web's retry starts over.
- **Which failures a retry can mend.** Only a passing one: `SYSTEM` (or a timeout) leaves the failed
  message retryable. A video refused `TOO_LARGE` or `UNSUPPORTED`, one whose result fails the web's
  own size check, and one the shell lost (`SOURCE`, here or at the upload's start) would only fail again, so the web offers delete
  alone for it.
- **Android does not convert.** A file whose bytes 4–7 are `ftyp` (and not a QuickTime brand), with
  one `video/avc` track and one `audio/mp4a-latm` track or none, is sent as it is — a 3GP that holds
  H.264 and AAC passes and is named `.mp4`. Tracks that are neither audio nor video, such as a camera's
  timed metadata, are ignored. Anything else — HEVC, another container — is `UNSUPPORTED`, and
  `TOO_LARGE` never occurs, since nothing changes size. Such a file may keep its
  index at the end (a long camera recording usually does). The WebView then reads the tail first with
  a range request, which storage serves, so the first play starts a little later; that is accepted.
- **The poster** is the frame at 0.5 s, or the first one for a shorter video, at most 400 px on its
  long side, JPEG from quality 0.7 down until it is at most 200,000 bytes — the server's thumbnail
  slot, which drops a larger one without an error. Android capped it at 200 × 1024 bytes before, so a
  poster between the two was made and then thrown away. It is
  `poster.jpg` beside the video, uploaded with it, and also answered as `base64`: the page cannot read
  a `file://` URI, and it shows the poster on the pending message while the video uploads. When no
  frame can be read, `poster` is `null` and the video goes without one.

## Folders and cleanup

| Folder                                          | Holds                                                                                            | Removed                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `<cache>/attach-pick/<uuid>/`                   | A picked copy (a photo already prepared) or a grid video's copy, its converted `mp4`, its poster | At the next pick, once untouched for 24 hours; OS cache purge               |
| `transfer-temp/` (cache on Android, tmp on iOS) | Images the web wrote with `WriteTempFile`                                                        | Never eagerly; the OS reclaims it ([file-transfer.md](./file-transfer.md))  |
| `<cache>/transfer-download/`                    | Downloaded files                                                                                 | The download sweep, after 24 hours ([file-transfer.md](./file-transfer.md)) |

An upload reads only from the first two; anything else is refused at `start`
([file-transfer.md](./file-transfer.md) § Rules).

**`attach-pick` is cleaned by one sweep and nothing else.** Each `PickAttachments` first deletes every
`attach-pick/<uuid>/` folder whose newest change is more than 24 hours old. The photo grid's
`KeepLibraryVideo` ([photo-library.md](./photo-library.md)) writes folders here too, and runs the same
sweep before it copies, so a person who sends only from the grid does not pile up copies. Nothing is deleted when the
web acknowledges a finished upload (`AckFileTransfers`), for two reasons:

- The web acknowledges the original as soon as its upload ends and starts the poster's upload
  _after_ that. Deleting the folder at that point would fail the poster with `SOURCE`.
- A failed message is retried from the same files, from the start. The shell does not know whether
  the server stored a message or failed it, so deleting at acknowledgement would turn every retry into
  `SOURCE`.

The cost is space: a sent video's copy, and its conversion, can stay in the cache for up to a day —
300 MB for each video picked. The OS empties caches first when storage runs low; a retry after that
fails with `SOURCE`, and that pending message can then only be deleted.

## Verifying

- `ReadVideoFrame` on a device: send a video from a browser that cannot draw a poster (or one sent
  before browsers drew posters), then scroll to it in the app — the tile shows the frame once it is on
  screen, and again at once after a relaunch (it is kept in the page's image cache, `frame` variant).
- JS relay, registration and the payload checks:
  `npx jest --config apps/mobile/jest.config.js attachmentPickerHandlers AttachmentPickerBridge useWebMessageRouter`.
- Android rules, from `apps/mobile/android`:
  `./gradlew :app:testDevDebugUnitTest --tests "io.chatic.dou.attach.*" --tests "io.chatic.dou.media.*"`.
- iOS rules: `AttachmentPickerCoreTests` in the `ChaticTransferCoreTests` target — the sweep, the
  pick-folder depth, names, the photo types `ReadAttachment` reads, the size and conversion steps, the
  staging name and the one-job-per-video rule. Run it with the core command in
  [file-transfer.md](./file-transfer.md) § Verifying; a new file in `AttachmentPicker/Core/` has to be
  added to that target by hand.
- On a simulator or emulator: open a chat room's attach menu, choose the file entry and pick from the
  album and from files; from files, a PNG or JPEG should arrive as a photo with a thumbnail, and an
  `.mp4` as a video with a poster. The copies are under `Library/Caches/attach-pick/` in the app's container on
  iOS and `cache/attach-pick/` on Android (`adb shell run-as <package> ls cache/attach-pick`). Pick a
  4K HEVC video on iOS to see `needsExport` and the 1080p conversion; on Android, a video picked
  through the Photo Picker should arrive renamed `video-<date>.mp4`.
- Pick ten photos from the album: the pending row appears once, with all ten, after the photos have
  been read one at a time.
- A JS bundle over a native build without the module: all three messages stay unregistered, and
  the web's file input opens instead (`useWebMessageRouter.test.ts` holds the rule).

## Checklist

- Is every picked file copied inside the picker's result callback, before the reply?
- Does a cancelled picker answer `items: []` rather than an error?
- Does a picked photo come back as a reference, with its bytes only through `ReadAttachment`, one at a time?
- Does every `refused` entry carry its `kind`?
- Do `PrepareVideo` and `ReadAttachment` refuse a URI that is not exactly `attach-pick/<uuid>/<file>`?
- Does iOS `ReadAttachment` refuse a file that is not a prepared photo?
- Is a `needsExport` video spared the size check at pick, and held to it by `PrepareVideo`?
- Does any failure path answer `NOT_FOUND`?
- Does anything delete an `attach-pick` folder other than the 24-hour sweep (and a refused copy's own folder)?
- Does `ReadVideoFrame` reach native code only with an `https:` address, and keep it out of the log?
