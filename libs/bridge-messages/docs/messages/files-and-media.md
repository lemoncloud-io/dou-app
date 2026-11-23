# Files, photos and attachments

Source: `file-transfer.ts`, `media-export.ts`, `attachment-picker.ts`, `audio-recording.ts`,
`photo-library.ts`, `share-intake.ts`. See the [index](./README.md) for conventions.

The shell owns the files. It keeps picked and recorded media in a folder of its own (`attach-pick`) and
downloads into another, and hands the web a `file://` URI for each. Large bytes never cross the bridge:
a 300 MB video would arrive as one 400 MB base64 message, and ten photos in one answer would be around
200 MB. Photos cross one at a time, as base64, when the web needs their bytes. Every message below that
takes a URI accepts only files inside the shell's own folders and refuses anything else with `INVALID`.

## File transfer

The web hands the shell a transfer instruction (a signed URL plus the headers it covers); the shell moves
the bytes, keeps going in the background and reports back. The contract is direction-neutral: a download is
one more `direction` on the same messages.

- **`StartFileTransfer`** (web→native, reply `OnStartFileTransfer`) — start an upload or a download. The
  reply means _accepted_, not done; results arrive as `OnFileTransferState`. Refused with `INVALID`: a reused
  `transferId`, a URL that is not absolute http(s), a method that does not fit the direction (`upload` needs
  `PUT`, `download` needs `GET`), and a download that names `file.uri`.
    - `transferId` is chosen by the caller (a UUID) and must not be reused while the shell still holds it.
      A download whose id is reused after acknowledgement starts from an empty folder; the earlier file is gone.
    - `url` is signed and is never persisted or logged by the shell (only its host appears in logs). `headers`
      are sent as given except the ones the platform owns (`content-length`, `host`). `title` is the name in
      the system notification; it falls back to a direction-specific default and is never a URL or path.
    - Upload: `file.uri` is read and sent. `file.contentLength` is required, since it is the progress
      denominator.
    - Download: where the file goes is the shell's decision. The web bundle is loaded remotely, so a caller that
      could name the target path could overwrite the app's own database or settings; a request carrying
      `file.uri` is refused with `INVALID`. `file.name` is only a hint: path segments and control characters are
      dropped, it is shortened, and the extension is replaced by the one the bytes show when they are a known
      image type. The shell asks for the body unencoded (`Accept-Encoding: identity`), so the stored bytes are
      the object's.
- **`CancelFileTransfer`** — cancel by `transferId`; cancelling a transfer that already ended fails with
  `INVALID`. The reply means accepted; a `cancelled` event follows.
- **`ListFileTransfers`** — everything the shell holds: running transfers plus ended ones not yet
  acknowledged, each in its latest state.
- **`AckFileTransfers`** — acknowledge ended transfers so the shell can drop them. A terminal result is kept
  until acknowledged because the event announcing it can be missed (the WebView may be suspended or
  reloading). Ids still running are ignored. The reply's `remaining` is how many the shell still holds.
- **`WriteTempFile`** — write bytes the web already holds (`base64`, for example an image it resized) to a temp
  file and get its `file://` URI. Needed because the transfer module only reads files; the bytes cross the
  bridge once and the transfer then streams from disk. `fileName` supplies the suffix so the extension is kept.
- **`OnFileTransferState`** (native→web push) — state of one transfer. `state` is `running` (emitted any
  number of times) or one of three terminal states (`responded`, `failed`, `cancelled`); each transfer
  reaches exactly one. `transferredBytes` is a byte count, not a ratio. `totalBytes` of `0` means unknown.
    - `httpStatus` (only `responded`) is passed through unjudged: 403 and 412 are both `responded`.
      `providerCode` is the storage error code from the body (the S3 `<Code>`) when `httpStatus >= 300`.
    - `errorCode` is set only when `failed`, which means no HTTP response arrived: `NETWORK` (connection,
      timeout, drop mid-transfer), `SOURCE` (the local file could not be opened or read, or a download could not
      be written, for example a full disk), `INVALID` (a bad request, a duplicate id, or an operation on an ended
      transfer), `SYSTEM` (the OS stopped it, for example Android's data-sync limit; may be restarted once back in
      the foreground), `INTERNAL`. `errorMessage` is a short diagnostic with any URL removed.
    - `file` appears only for a download that ended `responded` with a 2xx status; any other response leaves no
      file. It is the local file to hand as is to `SaveToPhotoLibrary` or `ShareFile`, held with the result until
      acknowledged so a WebView that reloaded can find it again through `ListFileTransfers`. `file.contentType`
      is the response's `Content-Type` carried as is; nothing decides on it, since the export messages read the
      file's bytes.

## Taking a download onward

All four take the `file://` URI from a download's terminal event and nothing else. The web ships before the
app: it shows its photo-save and share controls only when the handshake lists both `SaveToPhotoLibrary` and
`ShareFile`; `OpenFile` and `SaveFile` are newer (since 2.4.0) and the web learns a shell without them from
`NOT_FOUND`.

Shared failure codes: `PERMISSION_DENIED` (photo access denied or restricted; `details.canAskAgain` of `false`
means only system settings can change it), `UNSUPPORTED_TYPE` (the bytes are not a format the message takes;
an empty ZIP has no local file header and is refused this way too), `SOURCE` (the file is gone, the OS may
have cleared the cache), `INVALID` (missing field or a URI outside the download folder), `INTERNAL`
(the media store refused, or there is no screen). `NO_HANDLER` belongs to `OpenFile` alone.

- **`SaveToPhotoLibrary`** — add an image or video to the photo library (camera roll on iOS, `Pictures/DoU`
  or `Movies/DoU` on Android). Takes PNG, JPEG, GIF, WebP and MP4; the original bytes are stored as they are
  (an animated GIF stays animated) and the shell deletes its copy on success. The reply's `mimeType` is read
  from the bytes and is the type it was saved as.
- **`ShareFile`** — put the file on the system share sheet as a file, with no text added. Typed by the name's
  extension once the bytes are found to be an allowed family (DOCX and XLSX are both ZIP files; only the name
  tells them apart), because a receiving app offered both text and a file tends to take the text and drop the
  file. Takes the photo types plus the server's documents (PDF, DOCX, XLSX, PPTX, HWPX, plain ZIP, OLE2 for
  HWP, text). On iOS the reply arrives when the sheet closes, which can be minutes later, so the caller must
  wait longer than its default timeout; `completed` is `true` when a target was picked and finished, `false`
  when the sheet was closed (not a failure) and `activityType` names the chosen activity. On Android the reply
  arrives as soon as the sheet is shown, `completed` is `null` (the system reports no outcome) and the title
  is the chooser's; iOS shows no chooser title. The shell keeps the file, since a receiving app may read it late.
- **`OpenFile`** — open a document in the OS preview (iOS QuickLook, Android `ACTION_VIEW`). Fails with
  `NO_HANDLER` when nothing on the device opens the format (usually HWP; iOS asks QuickLook first, which would
  otherwise draw an empty page) and the web then offers the share sheet. iOS replies when the preview closes,
  Android once the viewer starts.
- **`SaveFile`** — keep a document on the device under `name`. Android 10+: `Download/DoU/<name>` through the
  media store, no permission; a taken name is numbered by the OS (`name (1).pdf`), known only after the save,
  so the reply's `location` says where it went. Android 7-9: the public `Download/DoU/` folder, asking for
  storage permission the first time, and the shell numbers a taken name itself. iOS: the export sheet, where
  the user picks the place; dismissing it is `saved: false`, not a failure. The shell re-checks the name: path
  separators are removed and an extension outside the server's formats is `INVALID`. An app built before the
  phone kept ZIP archives answers `.zip` that way too, and the web tells the person to update rather than
  reporting a failure. The downloaded file stays, so `OpenFile` can follow.

## Chat attachment picker

The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the web then opens its
own file input and learns not to ask again for the page's life.

- **`PickAttachments`** (web→native, since 2.4.0) — open the OS picker. `source: 'media'` is iOS `PHPickerViewController`
  (images and videos, the asset's current representation) or the Android Photo Picker (no permission needed;
  falls back to the documents picker on devices without one). `source: 'document'` is the documents picker,
  filtered to the formats the app sends; every item comes back as a `file` under the type the OS gave it and
  the web tells a photo or video apart by format. An app built before the phone sent ZIP archives leaves ZIP
  out, and one built before audio leaves audio out; the request is the same. `selectionLimit` is how many more
  items the message may take. `maxBytes` holds the server's per-kind ceilings (`image`, `video`, `file`); the
  shell copies nothing over them. The reply arrives when the picker closes and every file is copied, which can
  be minutes later, so the caller waits longer than its default timeout.
    - Reply `items` are in pick order; a cancelled picker is `items: []`, not an error. `refused` lists items
      the shell would not copy (`too-large`, `unsupported`, `unreadable`) with the kind, so the web names the
      right limit and reports them as it reports its own refusals.
    - A picked photo (`kind: 'image'`) is prepared the way the in-app grid prepares one (location removed, HEIC
      written as JPEG) and its type is one the server takes; its bytes come with `ReadAttachment`.
    - A video or document (`kind: 'video' | 'file'`) is a copy in `attach-pick`. `name` is the file's own name;
      a name the OS made up from a media id (Android's Photo Picker gives `1000000123.mp4`) is replaced with
      `video-<yyyyMMdd-HHmmss>.mp4` or `photo-...`, by capture time or else pick time. An extension that does not
      match the format is left for the web to judge. `contentType` is as the OS declared it, or
      `application/octet-stream` when it does not know the format (HWP).
    - `needsExport` (iOS): the video is not yet an H.264 `mp4` of 1080p or less, so `PrepareVideo` converts it. Until
      then its `name`, `contentType` and `size` are the source's (`IMG_0001.MOV`, `video/quicktime`) and the shell
      does not hold it to the video size limit; the conversion decides its size.
    - Failures: `BUSY` (a picker is already open), `INVALID` (missing or malformed field), `INTERNAL` (no screen to
      present on, or anything else). A cancelled picker is not an error.
- **`ReadAttachment`** — the bytes of one picked photo, in the shape `ReadPhoto` answers. The web asks one at a
  time, in pick order, so at most one photo is on the bridge. Ships in the same build as `PickAttachments`.
  `INVALID` for a missing URI or one outside `attach-pick`; `SOURCE` when the copy is gone; `INTERNAL` otherwise.
  The web refuses that photo alone, as `unreadable`.
- **`PrepareVideo`** — make a picked video ready to upload: an H.264/AAC `mp4` with its index first (iOS
  converts what needs it; Android checks and sends as is), plus a poster frame beside it. Called for every shell
  video, converted or not, because the poster is made here. A conversion can take minutes; the web waits up to
  ten and treats running out as a failure of that video only. Reply `file` is the file to upload (the name with
  its extension changed to `.mp4`); `poster` is a JPEG of the frame at 0.5 s (the first frame for a shorter
  video), 400 px on its long side and at most 200 KB, or `null` when no frame could be read. `poster.base64` is a
  copy of the same bytes for the web's preview while the video is sent, since the page cannot read a `file://`
  URI. Failures: `TOO_LARGE` (still over the limit after stepping down from 1080p to 720p), `UNSUPPORTED`
  (Android: not an `mp4` of H.264 with AAC or no audio; the shell does not convert), `SOURCE` (file gone),
  `SYSTEM` (conversion failed; on iOS also when the app went to the background mid-way), `INVALID`.
- **`ReadVideoFrame`** — a JPEG of one frame of a received video, made by the shell from its signed `https:`
  address, for the tile of a video sent without a poster. The shell reads the remote file itself (a ranged read
  via `AVAssetImageGenerator` / `MediaMetadataRetriever`), so the bucket needs no CORS and the WebView, which
  loads no media before a tap, is never asked to. Follows the poster's rule: `atMs` in (first frame for a
  shorter video), `maxEdge` is the long side in pixels and the frame is never upscaled, JPEG from quality 0.7
  down until it fits 200,000 bytes. The web sends `atMs` 500 and `maxEdge` 400. Nothing is written to disk.
  The shell runs at most two at once and gives up on one after 20 seconds; the web waits 25 so the shell's own
  answer settles each. `INVALID` (address not `https:` or a number missing), `UNREADABLE` (network, an expired
  address returning 403, a codec the device cannot decode). Since 2.5.0.

## Voice messages

The shell records with the OS recorder into `attach-pick` and answers with the same file reference a picked
document gets; the web uploads it with `StartFileTransfer`. Always AAC-LC, mono, 44.1 kHz, 64 kbps in an `.m4a`
typed `audio/mp4`, which the server accepts, so no conversion follows. The web offers the voice entry only when
the handshake lists `StartAudioRecording`. Since 2.13.0.

- **`StartAudioRecording`** (reply `OnAudioRecordingStarted`) — asks for the microphone permission first when it
  is undecided, starts only when granted; one recording at a time. `maxDurationMs` is capped at five minutes
  (300,000): an absent or larger value means the cap, and each side keeps its own copy of that number. The
  reply's `startedAt` is epoch milliseconds, for the elapsed time the web shows, and `maxDurationMs` is the limit
  the shell applied. Failures: `PERMISSION_DENIED` (refused now or before; the web points to Settings), `BUSY`,
  `INTERNAL`.
- **`StopAudioRecording`** (reply `OnAudioRecordingEnded`) — `send` when the button is released, `cancel` when
  slid away or the screen is leaving. Failures: `NOT_RECORDING` (it already ended by itself and that end was
  pushed), `INVALID`.
- **`OnAudioRecordingEnded`** is also **pushed** when the shell ends a recording itself, which is why the reply
  is not named `OnStopAudioRecording`: one name for every way a recording ends. `reason`: `SENT` (file ready),
  `MAX_DURATION` (limit reached, file ready, pushed), `CANCELLED`, `TOO_SHORT` (`send` under one second in),
  `INTERRUPTED` (a call, another app taking the audio, or the app leaving the foreground; pushed), `INTERNAL`
  (the recorder failed or wrote a file that is not MPEG-4 audio). The file and `durationMs` exist only for
  `SENT` and `MAX_DURATION`; in every other case the file is deleted.

## In-app photo library

The in-app picker reads the device library through the shell. The web never sees a device path (a `ph://` or
`content://` URI cannot be opened from the WebView), so previews and picked photos travel as base64. A shell
without these handlers answers `NOT_FOUND`; the web learns that once and falls back to the page's own file
input.

- **`ListPhotoAlbums`** — albums, with `access` (`granted`: every photo; `limited`: iOS "selected photos" only;
  `denied`: nothing, and the web offers system settings). The first album is "all photos", newest first; the
  list is empty when `denied`. `coverBase64` is a small JPEG of the newest photo, square at `thumbSize` when
  asked. `mediaTypes` is opt-in (default `['image']`): a shell from before videos ignores it; one that has them
  adds a "Videos" album where the platform has one (iOS). Album `id` is opaque and handed back as
  `ListPhotos.albumId`.
- **`ListPhotos`** — one page, newest first (videos too since 2.5.0, when `mediaTypes` asks). `after` is the previous page's `next`; omit for the first page.
  `limit` is a page size the shell may undercut. `mediaTypes` as above: a page with no `mediaType: 'video'`
  item says nothing about the library, because an older shell lists photos only (Android lists videos only
  once video access is granted too). Items: `id` is opaque (handed back to `ReadPhoto`, or to `KeepLibraryVideo`
  for a video; Android prefixes a video's with `v:`, which an older shell's `ReadPhoto` refuses as `INVALID`);
  `mediaType` absent means `image`; `mimeType` is the original's when the library reports it.
    - `thumbSize` (opt-in): the side of a square in device pixels, what the tile is drawn at; the
      shell clamps it and may answer a little under (it uses a smaller rendition the system already keeps when
      that is enough, so judge sharpness by the size asked for, never the pixels that came back). Without it,
      about 256 px on the long edge, uncropped. A shell from before it answers its old, only smaller, previews.
      An empty `thumbBase64` occurs only for an `offset` page whose item had no preview; its place in the list is
      still its own. A video's preview is its poster frame.
    - `offset` (opt-in): where the page starts as an index (0 = newest), so the grid can fill any stretch of a long
      album without paging up to it. When set, `after` is ignored and the reply carries `offset` and `total`;
      `next` is absent. `offset` is clamped to `total` (past the end gives an empty page at `total`). Every item of
      an `offset` page is the one at its index, even one without a preview. `total` is the count as the page was
      cut: a count that differs from what the grid laid out means the library changed. A shell from before it
      ignores it and answers the first page with neither field, so the web trusts `offset` only when the reply
      carries it.
- **`ReadPhoto`** — the bytes of one photo, to send. Formats the server does not take (HEIC) are converted to
  JPEG, so the reply is always sendable as is.
- **`ManagePhotoSelection`** — iOS limited access only: let the user change the shared photos; resolves when the
  system sheet is dismissed (the web then lists again) and returns the new `access`. A no-op elsewhere.
- **`KeepLibraryVideo`** — copy one library video into `attach-pick` and judge it there, as `PickAttachments`
  does for a picked video; what follows is the same (`PrepareVideo`, then the shell's own upload). The reply has
  the `PickedShellAttachment` shape. Copying can mean an iCloud download first, with no progress; the web waits
  up to ten minutes and asks for one video at a time. On iOS `needsExport` is set when the video is not yet an
  H.264 `mp4` of 1080p or less; an edited video is kept as the edit under its original name with a `.mov`
  extension, so it is always converted. A shell from before videos answers `NOT_FOUND`. Failures: `UNSUPPORTED`
  (Android: not `mp4` H.264 with AAC or no audio), `TOO_LARGE` (over the limit: as stored on Android, as the
  conversion estimates on iOS), `PHOTO_MISSING`, `READ_FAILED` (including a failed iCloud download), `INVALID`
  (missing id or not a video's). The web refuses that video alone. Since 2.5.0.

## Share intake

What another app shared to DoU through the OS share sheet. The iOS Share Extension and the Android
`ACTION_SEND` intent copy the items into `attach-pick` and open the app on `<scheme>://share?id=<id>`; the
deep-link pipeline turns that into `OnNavigate('/share?id=<id>')`, and the web's share page asks for the items
by that id and sends them like a pick. Named "intake" because `ShareFile` already names the opposite direction.
Since 2.9.0.

- **`FetchShareIntake`** — the items of one share by id. Not destructive: a reload asks again and gets the same
  answer until released. Android copies the items after it opened the app and answers once the last copy is
  written, so the caller waits longer than its default timeout. `items` are in the order the other app gave
  them (a photo is a `file` too; the web reads its bytes at send time with `ReadAttachment`), `refused` as for a
  pick, and `text` is any text or link shared with or instead of the items. Failures: `INVALID` (not a UUID the
  shell makes), `GONE` (released already or cleared with the cache; deliberately not `NOT_FOUND`, which the web
  reads as "no such handler"), `INTERNAL`.
- **`ReleaseShareIntake`** — forget a share. With `discard` the copies are deleted too (the person cancelled);
  without it they stay for the uploads still reading them, until the `attach-pick` sweep at the next pick finds
  the folder a day old. An id the shell does not hold is not an error.
