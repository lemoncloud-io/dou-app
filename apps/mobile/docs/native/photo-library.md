# Photo library

The web's in-app photo picker (the recent-photos strip in the attach menu, and the grid behind it)
reads the device library through the shell. The shell lists albums, pages of small previews, and
hands over the bytes of the photos the user sends. Only still images are listed.

**iOS only.** Android has no module yet. There the four messages are left unregistered, so the web
gets `NOT_FOUND` and falls back to the page's own file input, the same path a browser takes. That
fallback is why the asymmetry is safe to ship, and it is also why the Android side should not answer
these messages with an error of its own: any reply other than `NOT_FOUND` keeps the web asking.

## Files

| Layer             | File                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/photo-library.ts`                                                                 |
| WebView handler   | `src/app/webview/hooks/photoLibraryHandlers.ts`, `usePhotoLibraryHandler.ts`                                         |
| TS native wrapper | `src/app/bridge/PhotoLibraryBridge.ts`                                                                               |
| iOS               | `ios/Bridges/PhotoLibrary/` — `Core/PhotoLibraryCore.swift` (decisions), `PhotoLibrary.swift` (RN face and PhotoKit) |
| Android           | none                                                                                                                 |

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

- **Permission is asked on the first list, not at launch.** The web lists the newest photos when the
  attach menu opens, so that is where the system prompt appears. Restricted and denied access both
  reach the web as `denied`, with no albums or photos; the web offers the settings instead.
- **Limited access** (iOS "selected photos") lists only what the user shared. iOS would also show its
  own "select more photos" alert on the first fetch of each launch; `Info.plist` turns that off
  (`PHPhotoLibraryPreventAutomaticLimitedAccessAlert`) because the grid already has a row for it.
- **Albums.** The first album is the whole library, under the fixed id `all` — the web treats the
  first album as "all photos" and hands its id back, and `all` or no id at all both list the whole
  library. It stays first even when empty. After it come a handful of smart albums (favorites, selfies,
  screenshots, live photos, panoramas, portrait, animated, bursts) and the user's own albums, each
  listed only when it holds a photo this app can see. Hidden, Recently Deleted and shared albums are
  never listed — a shared album's photos live in iCloud, so its cover and every page would be
  downloads. An album that disappears between the list and the page lists as empty rather than failing.
- **Paging.** A page is at most 200 photos (the web asks for 60). The cursor is the offset the page
  was cut at plus the id of its last photo. The next page starts right after wherever that photo sits
  now, so a photo taken while the grid is open does not repeat one at the page boundary; the offset
  is used only when that photo was deleted meanwhile. A cursor the shell did not write starts over
  from the top.
- **One list at a time; reads apart.** Lists run on one serial queue: the web drops a page it no longer
  wants (an album switched away from) but cannot cancel it, so overlapping pages would only compete
  for threads. Reads have their own queue, so sending a photo does not wait behind a page of previews.
- **Previews never use the network.** They are JPEG, about 256 px on the long edge, made from what
  Photos keeps on the device — the sharp rendition if it is there, the fast one if not. A page is 60
  synchronous requests, and waiting on iCloud for each would outlast the web's request timeout. A photo
  with no preview on the device is left out of its page rather than drawn as a blank tile.
- **What `ReadPhoto` sends.** The original, downloaded from iCloud if it has to be, and not resized —
  the web decides sizes (`prepareImage`), with one exception below. Only the form changes:

    | Library holds | Sent as                                                                               |
    | ------------- | ------------------------------------------------------------------------------------- |
    | JPEG          | the same compressed data, with metadata rebuilt without its GPS tags                  |
    | PNG           | re-encoded losslessly with the GPS dictionary cleared — iOS kept GPS in a plain copy  |
    | GIF           | untouched, so it stays animated                                                       |
    | WebP          | untouched (ImageIO cannot write it)                                                   |
    | camera RAW    | JPEG at most 4096 px on the long edge, orientation drawn into the pixels, no location |
    | anything else | JPEG at full size, quality 0.9, no location — HEIC, HEIF, TIFF                        |

    If a JPEG or PNG cannot be rewritten, it goes up as a full-size JPEG instead (so a PNG can arrive
    as `.jpg`). Every result is then read once more for a location, in its GPS dictionary or as an XMP
    `exif:GPS…` tag; one that still has it is redrawn as a new JPEG bitmap, and refused with
    `READ_FAILED` if even that keeps it.

    RAW is the one size the shell decides: a 48 MP ProRAW decoded at full size holds about 200 MB, and
    its JPEG passes the server's 20 MB ceiling, so it would be carried across both bridges only to be
    refused. The location is removed because a photo picked from the grid is shared with everyone in
    the room, and where it was taken is not something the person chose to share by picking it.
    Orientation and the rest of the metadata are kept, and the web's decode applies the orientation.
    The file name keeps the library's name with the extension the bytes now have (`IMG_0001.HEIC` goes
    up as `IMG_0001.jpg`). Edited photos are sent as edited.

- **Timeouts are the web's.** Each call waits on something other than the shell, and a timed-out
  request drops an answer that arrives after it. The two lists get 60 s (the first raises the permission
  prompt), a read 2 minutes (an iCloud download), and the limited-access sheet 5 minutes (a person
  choosing). The sheet is answered at once when the screen is mid-transition, since iOS refuses the
  presentation then without calling back.
- **Error codes** are `INVALID`, `PHOTO_MISSING`, `READ_FAILED` and `INTERNAL`, and the handler maps
  anything else to `INTERNAL`. `NOT_FOUND` in particular never goes out: the web reads it as "this app
  has no photo library" and drops the picker for the rest of the session.

Why iOS ships alone and why the shell, not the web, prepares the form is ADR-0150.

## Verifying

- JS relay: `yarn workspace @chatic/mobile test photoLibraryHandlers`.
- Core rules — access, albums, cursor, paging, the export choice, file names, and the ImageIO export
  itself (location removed from JPEG, PNG and HEIC, orientation kept, GIF byte for byte, RAW scaling):
  the `PhotoLibraryCoreTests` case in the `ChaticTransferCoreTests` bundle, run as in
  [file-transfer.md](./file-transfer.md#verifying). It builds its images in memory, so it needs no
  fixtures. `Core/PhotoLibraryCore.swift` reaches that target as an explicit file reference, so a new
  file in `Core/` has to be added to the target by hand.
- Not run in CI, and not reachable from a unit test: the PhotoKit calls. Check them on a simulator —
  `xcrun simctl addmedia <udid> <files>` loads photos (include a HEIC, a GIF and a JPEG carrying GPS),
  then open a chat room's attach menu in the Debug build.
