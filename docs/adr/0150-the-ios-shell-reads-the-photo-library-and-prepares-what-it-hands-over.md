# ADR-0150: The iOS shell reads the photo library first, and prepares the form of what it hands over

> Status: Accepted · Decided: 2026-10-01
> · Scope: `apps/mobile/ios/Bridges/PhotoLibrary/**` · `apps/mobile/src/app/bridge/PhotoLibraryBridge.ts` ·
> `apps/mobile/src/app/webview/hooks/{photoLibraryHandlers,usePhotoLibraryHandler,useWebMessageRouter}.ts` ·
> `apps/web/src/app/bridge/appBridge.ts` (photo-library timeouts)
> · The module doc is [apps/mobile native/photo-library.md](../../apps/mobile/docs/native/photo-library.md)
> · Related: [ADR-0123](./0123-picking-a-photo-sends-it-and-the-shell-decides-how-it-is-picked.md)
> (the in-app grid and its `NOT_FOUND` fallback) ·
> [ADR-0111](./0111-the-destination-decides-how-a-picked-image-is-prepared.md) (who prepares a picked image)

## Context

ADR-0123 gave the web an in-app photo grid that reads the device library through four bridge
messages, and left it inert until an app shipped their handlers: every installed app answers
`NOT_FOUND`, and the page falls back to its file input. No app had the handlers. The grid has been
unreachable since it merged.

Two things stand between the contract and a working grid:

- **Only one platform is ready.** iOS's PhotoKit answers every message directly. Android needs a
  MediaStore reader with its own permission model, including the Android 14 partial grant. A
  library-wide read permission also has to be declared to Google Play, which asks apps whose core use
  does not need it to use the system photo picker instead. The native module contract
  (`apps/mobile/docs/native/README.md`) says both platforms ship in the same change, because a
  one-platform bridge usually fails at runtime on the other.
- **`ReadPhoto` hands over library bytes, not a `File` from a file input.** ADR-0111 kept the native
  picker from preparing images and put HEIC conversion in the web's `prepareImage`. The photo-library
  contract already says otherwise for this path — "the shell converts formats the server does not
  take" — because what the library holds is not what a file input would have produced. A HEIC, a
  48 MP ProRAW and a JPEG carrying the place it was taken all come out of the library as they are.

## Decision

**Ship the iOS module now. Leave the four messages unregistered on Android, and have the shell decide
the form, but never the size, of what it hands over.**

1. **iOS only, through the existing fallback.** The router registers the photo-library handlers only
   when the native module exists. Android therefore answers `NOT_FOUND` and gets the file input, the
   same as before. This is the one kind of exception the both-platforms rule allows: a message the web
   already handles when it is missing. For the same reason no reply from the shell, on any platform,
   carries `NOT_FOUND` for an ordinary failure. The web would read it as "no photo library" and drop
   the grid for the session. The handler maps any unnamed native code to `INTERNAL`.
2. **The shell prepares the form.**
    - JPEG and PNG keep their pixels but lose their GPS tags.
    - GIF and WebP go up untouched.
    - Everything else (HEIC, TIFF) becomes JPEG at full size, without GPS.
    - Camera RAW becomes JPEG at no more than 4096 px on the long edge.

    A photo picked from the grid is shared with everyone in the room. The location in its metadata is
    not something the person chose to share by picking it. Orientation and the rest of the metadata
    stay.

3. **Size stays with the web, except RAW.** The original is not resized, as ADR-0111 decided. RAW is
   the exception because at full size it cannot be sent at all. Decoding a 48 MP DNG holds about
   200 MB, and its JPEG passes the server's 20 MB ceiling. It would be read and carried across two
   bridges as base64, and then refused by the web's own size check.
4. **A page is cut by offset and anchored on its last photo.** The next page starts after wherever
   that photo now sits, so a photo taken while the grid is open does not repeat one at a page boundary.
5. **Previews never touch the network; a read may.** A page is 60 synchronous preview requests.
   Waiting on iCloud for each one would exceed the web's request timeout on a slow network. Photos
   keeps a small local rendition of every photo, so previews come from that. The photo actually sent
   is downloaded if it has to be.

    The web gives each call a timeout for what it waits on:
    - the two lists: 60 s, because the first one raises the permission prompt;
    - a read: 2 minutes, for the iCloud download;
    - the limited-access sheet: 5 minutes, because it waits on a person.

## Consequences

- **Android users keep the file input** until a MediaStore module ships and its permission passes
  Play review. Nothing changes for them.
- **EXIF handling now lives in two places.** The web's `prepareImage` reads orientation from what a
  file input or the grid hands it, and the shell writes what the grid hands over. The shell keeps
  orientation as a tag, except in a scaled RAW where it is drawn into the pixels. The web's decode
  handles both.
- **Removing location is checked, not assumed.** ImageIO's "exclude GPS" option did not remove it
  from a PNG, and copying metadata back without care wrote it straight back in. So each result is read
  again: if a location survives, the image is redrawn as a new JPEG bitmap, and refused if even that
  keeps it.
- **A RAW photo arrives smaller than its original.** Nobody can open the full size in the chat anyway.
- **A preview that is not on the device is skipped** rather than drawn as a blank tile, so a page can
  hold fewer photos than asked. The cursor still moves past the skipped ones.

## Alternatives

- **Wait for Android before shipping.** Rejected: the grid stays unreachable on both platforms to keep
  a rule whose purpose — no silent runtime failure on the other platform — the `NOT_FOUND` fallback
  already serves.
- **Answer the messages on Android with an error.** Rejected: any reply other than `NOT_FOUND` keeps
  the web asking and showing an empty grid instead of falling back.
- **Hand over the library's raw bytes and let `prepareImage` convert them.** Rejected. HEIC would
  work, since `prepareImage` already converts it, but the other two would not. RAW would cross the
  bridge at full size before anything could shrink it. And `prepareImage` sends a JPEG's original
  bytes to storage untouched, so removing its location in the page would mean re-encoding every photo
  — the canvas has no way to edit metadata alone.
- **Keep the location.** Rejected: the file input path is what people have used until now, and moving
  to the grid should not start publishing where each photo was taken.
- **Use PhotoKit's rendered image (`requestImage` at maximum size) for everything.** Rejected: it
  re-encodes every photo, loses the GIF's frames, and drops the metadata the web reads orientation from.
