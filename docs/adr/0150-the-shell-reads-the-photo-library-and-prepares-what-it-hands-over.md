# ADR-0150: The shell reads the photo library itself, and prepares the form of what it hands over

> Status: Accepted · Decided: 2026-10-01
> · Scope: `apps/mobile/ios/Bridges/PhotoLibrary/**` ·
> `apps/mobile/android/.../module/PhotoLibraryModule.kt` · `apps/mobile/android/.../photo/core/**` ·
> `apps/mobile/src/app/bridge/PhotoLibraryBridge.ts` ·
> `apps/mobile/src/app/webview/hooks/{photoLibraryHandlers,usePhotoLibraryHandler,useWebMessageRouter}.ts` ·
> `apps/web/src/app/bridge/appBridge.ts` (photo-library timeouts)
> · The module doc is [apps/mobile native/photo-library.md](../../apps/mobile/docs/native/photo-library.md)
> · Related: [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md)
> (the in-app grid and its `NOT_FOUND` fallback) ·
> [ADR-0111](./0111-the-destination-decides-how-a-picked-image-is-prepared.md) (who prepares a picked image)

## Context

ADR-0123 gave the web an in-app photo grid that reads the device library through four bridge
messages, and left it inert until an app shipped their handlers: every installed app answers
`NOT_FOUND`, and the page falls back to its file input. No app had the handlers, so the grid has
been unreachable since it merged.

Three things stand between the contract and a working grid:

- **The two platforms read a library differently.** iOS has PhotoKit, with its own albums, limited
  access and an iCloud-backed library. Android has MediaStore, where an album is a folder (a bucket),
  the read permission changed in Android 13, and Android 14 added a partial grant.
- **Android's library-wide read has to be justified to Google Play.** Play asks apps whose core use
  does not need `READ_MEDIA_IMAGES` to use the system photo picker instead. A chat app sending photos
  is the use the policy names as legitimate, but the declaration is a release step.
- **`ReadPhoto` hands over library bytes, not a `File` from a file input.** ADR-0111 kept the native
  picker from preparing images and put HEIC conversion in the web's `prepareImage`. The photo-library
  contract already says otherwise for this path — "the shell converts formats the server does not
  take" — because what the library holds is not what a file input would have produced. A HEIC, a
  48 MP ProRAW and a JPEG carrying the place it was taken all come out of the library as they are.

## Decision

**Both shells answer the four messages from the platform library, and each decides the form, but not
the size, of what it hands over, by the same rules.**

1. **One contract, two readers.**
    - iOS reads PhotoKit (`PhotoLibrary.swift`).
    - Android reads MediaStore (`PhotoLibraryModule.kt`). It asks for `READ_MEDIA_IMAGES` on 13+,
      adds `READ_MEDIA_VISUAL_USER_SELECTED` on 14+, and asks for `READ_EXTERNAL_STORAGE` below 13.
      The partial grant reaches the web as `limited`, the same word as iOS's selected photos.
    - Each platform's pure rules (access, paging, export choice, file names) sit in a `Core` file with
      its own unit tests. The two test suites cover the same cases.
2. **The prompt is raised once, by the first list.** That is when the attach menu opens. Android
   records that it asked and does not ask again, as iOS does, so a denial is not met with the same
   dialog on every open. The web offers the settings instead.
3. **The router registers the handlers only where the native module exists.** A JS bundle run over a
   native build without the module leaves the web its `NOT_FOUND`, and with it the file input. No
   ordinary failure goes out as `NOT_FOUND`: the web would read it as "no photo library" and drop the
   grid for the session. The handler maps any unnamed native code to `INTERNAL`.
4. **The shell prepares the form.**
    - JPEG and PNG keep their pixels but lose their GPS tags.
    - GIF and WebP go up untouched.
    - Everything else (HEIC, HEIF, TIFF) becomes JPEG at full size, without GPS.
    - Camera RAW becomes JPEG at no more than 4096 px on the long edge.

    A photo picked from the grid is shared with everyone in the room. The location in its metadata is
    not something the person chose to share by picking it. Each result is read again for a location,
    and one that still carries it is redrawn as a new bitmap, and refused if even that keeps it.

5. **Size stays with the web, except RAW.** The original is not resized, as ADR-0111 decided. RAW is
   the exception because at full size it cannot be sent at all. Decoding a 48 MP DNG holds about
   200 MB, and its JPEG passes the server's 20 MB ceiling. It would be read and carried across two
   bridges as base64, and then refused by the web's own size check.
6. **Paging survives a library that changes while the grid is open.** The cursor is opaque, so each
   platform uses what its library can do:
    - iOS cuts by offset and resumes after wherever the last photo now sits.
    - Android cuts by key, "older than the last photo's `date_added`, `_id`", which needs neither the
      offset nor the photo to still exist.
7. **Previews never wait on the network; a read may.** A page is 60 synchronous preview requests.
   Waiting on iCloud for each one would exceed the web's request timeout. iOS previews come from the
   renditions Photos keeps on the device, and MediaStore is local by nature. The photo actually sent
   may be downloaded first.

    The web gives each call a timeout for what it waits on:
    - the two lists: 60 s, because the first one raises the permission prompt;
    - a read: 2 minutes, for the iCloud download;
    - the limited-access sheet: 5 minutes, because it waits on a person.

## Consequences

- **The Android release needs the Play Console declaration for `READ_MEDIA_IMAGES`** before it ships.
  If Play refuses it, the module and the permission have to come out again, and Android goes back to
  the file input — the web needs no change either way.
- **The platforms differ where their libraries do:**
    - Album lists: iOS lists smart albums and user albums, without shared ones. Android lists one album
      per folder.
    - Converting to JPEG: iOS keeps the metadata and the orientation tag. Android redraws a bitmap, so
      the orientation is in the pixels and no other metadata comes along.
    - Location: on Android 10+, MediaStore already hides it from an app without
      `ACCESS_MEDIA_LOCATION`, which this app does not ask for. The shell removes it anyway, for older
      versions and as a check.
- **EXIF handling now lives in two places.** The web's `prepareImage` reads orientation from what a
  file input or the grid hands it, and the shell writes what the grid hands over. The web's decode
  handles a tag or upright pixels alike.
- **Removing location is checked, not assumed.** ImageIO's "exclude GPS" option alone dropped all
  metadata, orientation included, and a PNG kept its GPS through a metadata-only copy. Both surprises
  are now tests.
- **A RAW photo arrives smaller than its original.** Nobody can open the full size in the chat anyway.
- **Android refuses what it cannot hold.** A photo sent as stored that is over the web's 20 MiB
  ceiling is refused before it is read, and a conversion decodes at no more than 24 MP. The web
  would have refused the first anyway. Refusing it in the shell means the person sees a failed send
  instead of the size reason the file input path shows.
- **A preview that cannot be made is skipped** rather than drawn as a blank tile, so a page can hold
  fewer photos than asked. The cursor still moves past the skipped ones.

## Alternatives

- **iOS first, Android unregistered.** Considered first, since the `NOT_FOUND` fallback makes it safe.
  Rejected so the grid does not reach one platform's users a release before the other's.
- **Android's system Photo Picker instead of MediaStore.** Rejected: it needs no permission, but it is
  a system screen. It cannot draw the grid, the recent strip or the album switcher the web shows, so
  it would be the file input path the app already has.
- **Answer the messages with an error where a library cannot be read.** Rejected: any reply other than
  `NOT_FOUND` keeps the web asking and showing an empty grid instead of falling back.
- **Hand over the library's raw bytes and let `prepareImage` convert them.** Rejected. HEIC would
  work, since `prepareImage` already converts it, but the other two would not. RAW would cross the
  bridge at full size before anything could shrink it. And `prepareImage` sends a JPEG's original
  bytes to storage untouched, so removing its location in the page would mean re-encoding every photo
  — the canvas has no way to edit metadata alone.
- **Keep the location.** Rejected: the file input path is what people have used until now, and moving
  to the grid should not start publishing where each photo was taken.
- **Re-encode every photo through the platform's rendered image.** Rejected: it loses a GIF's frames,
  costs quality on every JPEG, and on iOS drops the metadata the web reads orientation from.
