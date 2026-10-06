# Photo library

The web's in-app photo picker (the recent-photos strip in the attach menu, and the grid behind it)
reads the device library through the shell. The shell lists albums, pages of small previews, and
hands over the photos the user sends. Videos are listed too when the web asks for them; a picked one
is not handed over as bytes but kept in the shell (`KeepLibraryVideo`) and uploaded from there, the
way the attachment picker's videos are ([attachment-picker.md](./attachment-picker.md)).

Both platforms answer the same five messages: iOS from PhotoKit, Android from MediaStore. A native
build without the module leaves them unregistered, so the web gets `NOT_FOUND` and falls back to the
page's own file input, the same path a browser takes.

## Files

| Layer             | File                                                                                                                                                                                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/photo-library.ts`                                                                                                                                         |
| WebView handler   | `src/app/webview/hooks/photoLibraryHandlers.ts`, `usePhotoLibraryHandler.ts`                                                                                                                 |
| TS native wrapper | `src/app/bridge/PhotoLibraryBridge.ts`                                                                                                                                                       |
| iOS               | `ios/Bridges/PhotoLibrary/` — `Core/PhotoLibraryCore.swift` (decisions), `PhotoLibrary.swift` (RN face and PhotoKit)                                                                         |
| Android           | `io/chatic/dou/photo/core/PhotoLibraryCore.kt` (decisions), `module/PhotoLibraryModule.kt` (RN face and MediaStore), `photo/PhotoPreparer.kt` (preparation), `bridge/PhotoLibraryPackage.kt` |

## Messages

| Request                | Reply                    | What it does                                                               |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `ListPhotoAlbums`      | `OnListPhotoAlbums`      | Albums with a count and a cover preview, "all photos" first                |
| `ListPhotos`           | `OnListPhotos`           | One page of previews, newest first, by `next` cursor or by `offset`        |
| `ReadPhoto`            | `OnReadPhoto`            | The photo itself, as base64, in a format the server takes                  |
| `ManagePhotoSelection` | `OnManagePhotoSelection` | Under limited access, the system "select more photos" sheet; else a no-op  |
| `KeepLibraryVideo`     | `OnKeepLibraryVideo`     | Copies one library video into `attach-pick` and answers with its reference |

The router registers the first four only when `PhotoLibraryBridge.isAvailable` — the native module
exists in this build — and `KeepLibraryVideo` only when that module also has `keepLibraryVideo`
(`canKeepVideo`). Videos came after the module, so a build with the module but not the method must
still answer `NOT_FOUND` for it. For the same reason the wrapper forwards `mediaTypes` only to a
build with the method, and calls such a build's `listAlbums` with no argument: the older native method
takes none, and React Native rejects a call with the wrong count.

## Rules

- **Permission is asked once, by the first list.** The web lists the newest photos when the attach
  menu opens, so that is where the system prompt appears. After that the shell reports what the user
  chose and does not ask again; denied (and iOS's restricted) reach the web as `denied`, with no
  albums or photos, and the web offers the settings instead. iOS keeps that state itself; Android
  records in its preferences that the user answered, since asking again would show the same dialog
  on every attach-menu open until the system stops showing it. A request that never showed a dialog
  (no activity, or one cancelled by another permission request in flight) is not recorded, so the
  next list asks again. React Native's activity keeps one permission listener, so a request made
  elsewhere while the prompt is up can take its answer; after 50 s the list goes ahead with the
  access as it stands, inside the web's 60 s timeout, rather than never answering.
- **Permissions on Android:** `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` on 13+, plus
  `READ_MEDIA_VISUAL_USER_SELECTED` on 14+, and `READ_EXTERNAL_STORAGE` (declared up to SDK 32) below
  13, which covers both. `ACCESS_MEDIA_LOCATION` is not asked for, so Android 10+ already hides a
  photo's location from the stream the shell reads. The access reported to the web is the photos'.
  Video access is judged apart: granted `READ_MEDIA_VIDEO`, or partial access — on 14+
  `READ_MEDIA_VISUAL_USER_SELECTED` granted while both full grants are denied, since "allow all" also
  reports the partial permission as granted.
- **Video access is asked for once more on Android.** A user who allowed photos under a build that never
  asked for videos would otherwise never see a video in the grid. The first list that asks for videos,
  from someone with photo access (all or a selection) and no video grant, requests the permissions again, and that the
  user answered is recorded under its own preference (`asked_video`), apart from the photo prompt's —
  so it happens once. The first prompt ever asks for both and records both. Measured on API 35: with
  photos fully allowed the grant comes with no dialog; with partial access the system asks to allow
  more photos and videos, and its "allow limited access" opens a video picker. Refused, the grid lists
  photos only and is not asked again. Android 13 and 14's dialogs have not been seen on a device.
- **Limited access** — iOS "selected photos", Android 14 "allow limited access" — lists only what the
  user shared and reaches the web as `limited`. `ManagePhotoSelection` re-opens the choice: iOS's
  "select more photos" sheet, or Android's permission request, which is how Android 14 offers it. iOS
  would also show its own alert on the first fetch of each launch; `Info.plist` turns that off
  (`PHPhotoLibraryPreventAutomaticLimitedAccessAlert`) because the grid already has a row for it.
- **Media types.** `ListPhotos` and `ListPhotoAlbums` take `mediaTypes` (`image`, `video`); absent,
  empty, or naming neither, the shell lists photos only — exactly what it did before videos, and what
  a shell from before videos does with any request. With videos, one list holds both, newest first in
  each platform's own order (iOS `creationDate`, Android `date_added`), so a mixed list can differ a
  little between the two. Every item says `mediaType`; a video also carries `durationMs`.
    - iOS: the fetch predicate is `mediaType IN {…}`. Album counts, covers and pages all use the same
      options, and with videos the "Videos" smart album is listed after Favorites.
    - Android: photos only reads `MediaStore.Images` as before. With videos it reads
      `MediaStore.Files` with `media_type IN (1, 3)` — one query, the same keyset paging — and a video's
      id is `v:<_id>`, which `ReadPhoto` refuses as `INVALID`. Duration comes from the `DURATION`
      column on 29+ and from a second query on the Video table below. A video request from someone
      without video access lists photos only. A request for videos alone reads the same table with
      `media_type = 3`; the web always asks for both.
- **Albums.** The first album is the whole library, under the fixed id `all` — the web treats the
  first album as "all photos" and hands its id back, and `all` or no id at all both list the whole
  library. It stays first even when empty, titled by the system on iOS ("Recents") and by the app's
  own string on Android.
    - iOS: a handful of smart albums (favorites, selfies, screenshots, live photos, panoramas,
      portrait, animated, bursts) and the user's own albums, each listed only when it holds a photo
      this app can see. Hidden, Recently Deleted and shared albums are never listed — a shared album's
      photos live in iCloud, so its cover and every page would be downloads.
    - Android: one album per folder (MediaStore bucket), ordered by its newest photo, collected in a
      single pass over the library.

    An album that disappears between the list and the page lists as empty rather than failing.

- **Paging.** A page is at most 200 photos (the web asks for 60). The cursor is opaque to the web, and
  each platform uses what its library allows, so a photo taken or deleted while the grid is open
  neither repeats nor skips one at a page boundary:
    - iOS: the offset the page was cut at plus the id of its last photo. The next page starts right
      after wherever that photo sits now; the offset is used only when it was deleted meanwhile.
    - Android: the last photo's `date_added` and `_id`. The next page is "older than that", in the
      same `date_added DESC, _id DESC` order, which needs neither an offset nor the photo to still
      exist.

    A cursor the shell did not write starts over from the top.

    **By offset.** A `ListPhotos` with `offset` (a number ≥ 0; a fraction is floored) ignores `after`
    and answers the page starting at that index of the same list — same album, types and order — with
    `offset` (the start actually used, clamped to the end) and `total` (the list's count now), and no
    `next`. iOS indexes the fetch result; Android runs the cursor page's query without its key and
    moves the cursor to the start (no `LIMIT`/`OFFSET`, which API 30+ rejects in the sort order). Every
    index answers its own item: one whose preview could not be made comes with an empty `thumbBase64`
    instead of being left out, or every index after it would be one off. A gone album answers an empty
    page at `offset: 0, total: 0`.

    Offsets are what let the grid lay out an album at its full length and fill any stretch of it
    directly — a fast-scroll to the end of a 10,000-photo album would otherwise page through all of it.
    They give up the cursor's guarantee: a photo taken between two pages moves every index after it, so
    a page can repeat or skip one at its edge. `total` is how the web notices: a count different from
    the one it laid out for makes it lay out again. The echoed `offset` is how it knows the field was
    read at all — an app from before offsets ignores it and answers the first page, with neither field,
    and the web then pages by cursor for the session.

- **One list at a time; reads apart.** Lists run on one serial queue (one thread on Android): the web
  drops a page it no longer wants (an album switched away from) but cannot cancel it, so overlapping
  pages would only compete. Reads have their own, so sending a photo does not wait behind a page of
  previews.
- **Preview size.** `ListPhotos` and `ListPhotoAlbums` (its covers) take `thumbSize`: the side of a
  square, in pixels — the tile's size on screen times the device pixel ratio. The shell rounds and
  clamps it to 64–720 (720 covers two columns on a 440pt phone at 3×) and answers the photo's centre
  square at that side, JPEG quality 0.8. It asks the library for the photo fitted in a box whose side
  brings the short edge to `thumbSize` (`fitBox`: `thumbSize × long ÷ short`, rounded up), then crops
  the middle square of what came back and scales it to `thumbSize` — never up: a library image smaller
  than that stays its own size. The ratio is capped at 3:1, so a panorama is decoded at three times the
  size rather than ten, and its square comes out a little under. The box is a square whichever side is
  long, so width and height metadata that ignores rotation cannot shrink it. Square, because every
  place the web draws a preview (grid, recent strip, picked strip, album cover) fills a square, and
  sending the rest would be bytes cropped away on arrival. iOS asks PhotoKit with `resizeMode .exact`
  (`.fast` may return any size at or above the target) and draws the crop with `UIGraphicsImageRenderer`,
  which also applies the image's orientation. Android's `loadThumbnail` is served from the system's
  own thumbnail and does not go past it: on API 35 a request for 544 px came back 500 px, so the
  two-column square is that size and the tile draws it about 7% larger. Decoding the original instead
  would cost a full image decode per tile, for a difference hard to see. Without `thumbSize` the preview is what it was before
  the field — about 256 px on the long edge, uncropped, quality 0.7 — which is what a web from before it
  gets, and what an app from before it answers anyway.
- **Previews never wait on the network.** iOS makes them from what Photos keeps on the device — the
  sharp rendition if it is there, the fast one if not; waiting on iCloud for each of 60 would
  outlast the web's request timeout. The fast rendition can come back smaller than asked; its square
  is then smaller too, and the tile draws it larger — a soft tile is better than none. Android's
  MediaStore is local, and its system thumbnail is used from Android 10. A photo with no preview is
  left out of a cursor page rather than drawn as a blank tile (an offset page keeps it, empty — see
  Paging). A video's preview is its poster frame: the same local-only request on iOS,
  `loadThumbnail` on the video's URI on Android 10+, and the Video table's `MINI_KIND` thumbnail
  below.
- **What `ReadPhoto` sends.** The original — downloaded from iCloud first on iOS if it has to be — and
  not resized: the web decides sizes (`prepareImage`), with one exception below. Only the form changes:

    | Library holds | Sent as                                                                                                      |
    | ------------- | ------------------------------------------------------------------------------------------------------------ |
    | JPEG          | the same compressed data, without its GPS tags                                                               |
    | PNG           | iOS: re-encoded losslessly with GPS cleared (a plain copy kept it). Android: the same bytes without GPS tags |
    | GIF           | untouched, so it stays animated                                                                              |
    | WebP          | untouched                                                                                                    |
    | camera RAW    | JPEG at most 4096 px on the long edge, upright, no location                                                  |
    | anything else | JPEG at full size, quality 90, no location — HEIC, HEIF, TIFF                                                |

    Where a JPEG keeps its bytes, the orientation stays a tag, which the web's decode applies. A photo
    converted to JPEG keeps its metadata on iOS; on Android it is a new bitmap, so it is upright in the
    pixels and carries no other metadata. If a JPEG or PNG cannot be rewritten, it goes up as a
    full-size JPEG instead (so a PNG can arrive as `.jpg`). Every result is then read once more for a
    location, in its EXIF or as an XMP `exif:GPS…` tag; one that still has it is redrawn as a new JPEG
    bitmap, and refused with `READ_FAILED` if even that keeps it. A transparent image converted to
    JPEG is drawn over white, since JPEG has no transparency and the pixels would otherwise go black.

    Android bounds what a read may hold. A photo sent as stored that is over 20 MiB (the web's
    per-image ceiling) is refused before its bytes are read — holding it as the original, the stripped
    copy and base64 at once is what runs a phone's app heap out. A photo converted to JPEG is decoded
    from the library directly, never alongside its stored bytes, and at no more than 24 MP. Running
    out of memory anyway fails the read with `READ_FAILED`; it does not take the app down.

    RAW is the one size the shell decides: a 48 MP ProRAW decoded at full size holds about 200 MB, and
    its JPEG passes the server's 20 MB ceiling, so it would be carried across both bridges only to be
    refused. The location is removed because a photo picked from the grid is shared with everyone in
    the room, and where it was taken is not something the person chose to share by picking it. The
    file name keeps the library's name with the extension the bytes now have (`IMG_0001.HEIC` goes up
    as `IMG_0001.jpg`). Edited photos are sent as edited.

- **What `KeepLibraryVideo` keeps.** The video as stored, copied into a new `attach-pick/<uuid>/`
  folder, answered with the same reference `PickAttachments` gives for a video; the web then sends it
  through `PrepareVideo` and the shell's upload like any picked video. It runs on its own thread, one
  at a time, and may wait minutes on iOS for an iCloud download (the web allows 10). The copy is judged
  at once, so a video that cannot go is refused when it is picked rather than after the message
  appears:
    - iOS: `PHAssetResourceManager` copies the `.video` resource under its original name, or — for an
      edited video — the `.fullSizeVideo` render under the original name with `.mov`, so `needsExport`
      is set and the conversion writes an `.mp4`. The post-copy judgement is the attachment picker's own
      (`AttachmentPicker.keepVideo`), with one addition: a video to be converted is refused `TOO_LARGE`
      when the 1080p→720p export estimate says it is over 300 MiB (`VideoPreparation.exportChoice`, the
      same step `PrepareVideo` takes). One that will not be converted is held to 300 MiB as stored.
    - Android: `attach/PickedCopies.kt`, shared with the attachment picker, copies the row and checks
      it: over 300 MiB is `TOO_LARGE`, and anything that is not an `mp4` of H.264 video with AAC or no
      audio is `UNSUPPORTED` — Android does not convert. It never sets `needsExport`.
    - On either, a copy that fails (an iCloud download included) is `READ_FAILED`, a missing asset
      `PHOTO_MISSING`, and an id that is not a video's `INVALID`. The folder is deleted on any refusal,
      and the 24-hour `attach-pick` sweep runs before every copy, so a person who sends only from the
      grid does not pile up copies.
- **Timeouts are the web's.** Each call waits on something other than the shell, and a timed-out
  request drops an answer that arrives after it. The two lists get 60 s (the first raises the permission
  prompt), a read 2 minutes (an iCloud download), and the limited-access sheet 5 minutes (a person
  choosing). On iOS the sheet is answered at once when the screen is mid-transition, since iOS refuses
  the presentation then without calling back.
- **Error codes** are `INVALID`, `PHOTO_MISSING`, `READ_FAILED` and `INTERNAL`, and the handler maps
  anything else to `INTERNAL`. `KeepLibraryVideo` adds `UNSUPPORTED` and `TOO_LARGE`, and maps anything
  it does not know to `READ_FAILED`. `NOT_FOUND` in particular never goes out: the web reads it as "this app
  has no photo library" and drops the picker for the rest of the session.

Why the shell, not the web, prepares the form — and what the Android permission costs at release —
is ADR-0150. Why videos are kept in the shell rather than read across the bridge is ADR-0171. Why
previews are square at the tile's size, and why pages can be cut by offset, is ADR-0174.
`READ_MEDIA_VIDEO` falls under Play's photo and video permissions policy like `READ_MEDIA_IMAGES`: the
app's Play declaration has to name it before an Android release that lists videos ships.

## Verifying

- JS relay: `yarn workspace @chatic/mobile test photoLibraryHandlers PhotoLibraryBridge useWebMessageRouter`.
- Core rules, the same cases on both platforms (access, albums, cursor, paging, offsets, preview size,
  fit box and centre square, the export choice, file names, media types, video duration, and the
  library video's name on iOS and its `v:` id and video access on Android). Neither runs in CI.
    - iOS: the `PhotoLibraryCoreTests` case in the `ChaticTransferCoreTests` bundle, run as in
      [file-transfer.md](./file-transfer.md#verifying). It also covers the ImageIO export itself
      (location removed from JPEG, PNG and HEIC, orientation kept, GIF byte for byte, RAW scaling),
      with images built in memory. `Core/PhotoLibraryCore.swift` reaches that target as an explicit
      file reference, so a new file in `Core/` has to be added to the target by hand.
    - Android, from `apps/mobile/android`: `./gradlew :app:testDevDebugUnitTest --tests "io.chatic.dou.photo.*"`.
      These are plain JVM tests; the MediaStore, Bitmap and ExifInterface calls are not reachable from
      them.
- On a simulator or emulator, for the library calls and the export: load photos (include a HEIC, a
  GIF and a JPEG carrying GPS) — `xcrun simctl addmedia <udid> <files>` on iOS, `adb push` into
  `/sdcard/Pictures/` and a media scan on Android — then open a chat room's attach menu in a debug
  build and send them. The bytes that went up are the temp files the web wrote before the transfer:
  `tmp/transfer-temp/` in the app's container on iOS, `cache/transfer-temp/` on Android
  (`adb shell run-as <package> ls cache/transfer-temp`).
