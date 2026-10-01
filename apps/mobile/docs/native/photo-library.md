# Photo library

The web's in-app photo picker (the recent-photos strip in the attach menu, and the grid behind it)
reads the device library through the shell. The shell lists albums, pages of small previews, and
hands over the bytes of the photos the user sends. Only still images are listed.

Both platforms answer the same four messages: iOS from PhotoKit, Android from MediaStore. A native
build without the module leaves them unregistered, so the web gets `NOT_FOUND` and falls back to the
page's own file input, the same path a browser takes.

## Files

| Layer             | File                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/photo-library.ts`                                                                                                 |
| WebView handler   | `src/app/webview/hooks/photoLibraryHandlers.ts`, `usePhotoLibraryHandler.ts`                                                                         |
| TS native wrapper | `src/app/bridge/PhotoLibraryBridge.ts`                                                                                                               |
| iOS               | `ios/Bridges/PhotoLibrary/` — `Core/PhotoLibraryCore.swift` (decisions), `PhotoLibrary.swift` (RN face and PhotoKit)                                 |
| Android           | `io/chatic/dou/photo/core/PhotoLibraryCore.kt` (decisions), `module/PhotoLibraryModule.kt` (RN face and MediaStore), `bridge/PhotoLibraryPackage.kt` |

## Messages

| Request                | Reply                    | What it does                                                              |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `ListPhotoAlbums`      | `OnListPhotoAlbums`      | Albums with a count and a cover preview, "all photos" first               |
| `ListPhotos`           | `OnListPhotos`           | One page of previews, newest first, with a `next` cursor                  |
| `ReadPhoto`            | `OnReadPhoto`            | The photo itself, as base64, in a format the server takes                 |
| `ManagePhotoSelection` | `OnManagePhotoSelection` | Under limited access, the system "select more photos" sheet; else a no-op |

The router registers them only when `PhotoLibraryBridge.isAvailable` — the native module exists in
this build.

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
- **Permissions on Android:** `READ_MEDIA_IMAGES` on 13+, plus `READ_MEDIA_VISUAL_USER_SELECTED` on
  14+, and `READ_EXTERNAL_STORAGE` (declared up to SDK 32) below 13. `ACCESS_MEDIA_LOCATION` is not
  asked for, so Android 10+ already hides a photo's location from the stream the shell reads.
- **Limited access** — iOS "selected photos", Android 14 "allow limited access" — lists only what the
  user shared and reaches the web as `limited`. `ManagePhotoSelection` re-opens the choice: iOS's
  "select more photos" sheet, or Android's permission request, which is how Android 14 offers it. iOS
  would also show its own alert on the first fetch of each launch; `Info.plist` turns that off
  (`PHPhotoLibraryPreventAutomaticLimitedAccessAlert`) because the grid already has a row for it.
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

- **One list at a time; reads apart.** Lists run on one serial queue (one thread on Android): the web
  drops a page it no longer wants (an album switched away from) but cannot cancel it, so overlapping
  pages would only compete. Reads have their own, so sending a photo does not wait behind a page of
  previews.
- **Previews never wait on the network.** They are JPEG, about 256 px on the long edge. iOS makes them
  from what Photos keeps on the device — the sharp rendition if it is there, the fast one if not;
  waiting on iCloud for each of 60 would outlast the web's request timeout. Android's MediaStore is
  local, and its system thumbnail is used from Android 10. A photo with no preview is left out of its
  page rather than drawn as a blank tile.
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

- **Timeouts are the web's.** Each call waits on something other than the shell, and a timed-out
  request drops an answer that arrives after it. The two lists get 60 s (the first raises the permission
  prompt), a read 2 minutes (an iCloud download), and the limited-access sheet 5 minutes (a person
  choosing). On iOS the sheet is answered at once when the screen is mid-transition, since iOS refuses
  the presentation then without calling back.
- **Error codes** are `INVALID`, `PHOTO_MISSING`, `READ_FAILED` and `INTERNAL`, and the handler maps
  anything else to `INTERNAL`. `NOT_FOUND` in particular never goes out: the web reads it as "this app
  has no photo library" and drops the picker for the rest of the session.

Why the shell, not the web, prepares the form — and what the Android permission costs at release —
is ADR-0150.

## Verifying

- JS relay: `yarn workspace @chatic/mobile test photoLibraryHandlers`.
- Core rules, the same cases on both platforms (access, albums, cursor, paging, the export choice,
  file names). Neither runs in CI.
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
