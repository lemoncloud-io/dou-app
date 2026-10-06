# ADR-0171: The photo grid lists videos, and keeps a picked one in the shell

> Status: Accepted · Decided: 2026-10-06 · Implemented: `feat/video-poster-and-grid-videos`
> · Scope: `libs/app-messages` (`ListPhotos.mediaTypes`, `PhotoLibraryItem.mediaType`/`durationMs`,
> `KeepLibraryVideo`) · the iOS and Android `PhotoLibrary` modules · `apps/mobile/src/app/{bridge,webview}` ·
> `apps/web/src/app/bridge/photoLibrary.ts` · `apps/web/src/app/features/channels/` (`usePhotoPicker`,
> `ChatImageAttach`) · `libs/web-ui-kit/src/composites/media` · Android `READ_MEDIA_VIDEO`
> · Extends [ADR-0150](./0150-the-shell-reads-the-photo-library-and-prepares-what-it-hands-over.md) to
> videos; the video path after the pick is
> [ADR-0158](./0158-mobile-picks-videos-and-documents-in-the-shell-and-uploads-them-from-its-folder.md)'s.
> · The module docs are [apps/mobile native/photo-library.md](../../apps/mobile/docs/native/photo-library.md)
> and [apps/web channels/image-send.md](../../apps/web/docs/feature/channels/image-send.md)

## Context

The app's photo grid (ADR-0150) listed still images only: iOS asked PhotoKit for `mediaType == image`
and Android read `MediaStore.Images`. Videos could be sent from the app, but only through "File →
Choose from album", the OS picker that ADR-0158 added. People looked for their videos in the grid and
reported that it "does not show them".

A video cannot travel the way a grid photo does. A photo crosses the bridge as base64; a 300 MB video
would be one 400 MB message. ADR-0158 already solved this for the OS picker: the shell copies the
file into its own `attach-pick` folder, hands the page a reference, converts it with `PrepareVideo`
and uploads it from there.

Android adds a permission question. The grid has `READ_MEDIA_IMAGES` (and the API 34 partial grant);
videos need `READ_MEDIA_VIDEO`, and a user who already allowed photos is never asked again unless the
app asks.

## Decision

### 1. Videos are listed when the web asks for them

`ListPhotos` and `ListPhotoAlbums` take an optional `mediaTypes`, and each item says what it is
(`mediaType`) and how long it runs (`durationMs`). An app from before this ignores the field and lists
photos only, so the web can always ask. The grid draws a video as its poster frame with a play mark
and its length; the menu's recent strip and the picked strip do the same.

### 2. A picked video is kept in the shell, as a picker's video is

`KeepLibraryVideo { id }` copies one library video into `attach-pick` and answers with the same
reference `PickAttachments` gives for a video. From there the send is ADR-0158's: `PrepareVideo`, then
the shell's own upload. An edited iOS video is kept as the edit, named after the original with a
`.mov` extension so it is always converted.

The shell judges the copy at once, so a video that cannot be sent is refused when it is picked rather
than failing after the message appears: Android refuses anything that is not an H.264/AAC `mp4` (it
does not convert) and anything over 300 MiB; iOS refuses a video whose conversion it estimates over
300 MiB.

### 3. Each item is read on its own

The grid used to read every picked photo and fail the whole pick when one read failed. It now reads
photos and keeps videos one at a time, in pick order, and an item that fails is refused alone with
the same notices the attach menu already uses. The whole pick is judged like any other — by format,
size and count, not "photos only". The grid stays open, saying it is preparing, until every item is
read, since a video stored only in iCloud can take minutes to come down.

### 4. Each new method is detected on its own

`KeepLibraryVideo` and the `mediaTypes` argument are registered by method, not by module, so a native
build with the photo-library module but without the new method still lists photos and answers
`NOT_FOUND` for the rest. A `NOT_FOUND` from `KeepLibraryVideo` stops the web asking for videos for
the session.

### 5. Android asks for video access once

The manifest gains `READ_MEDIA_VIDEO`. A user who granted photos but not videos is asked for videos
once, the first time the grid lists with videos; the answer is remembered apart from the photo
prompt. Measured on API 35: with photos fully allowed the grant comes without a dialog, and with a
partial grant the system asks to allow more photos and videos. Refused, the grid lists photos as
before.

## Consequences

- Photos and videos are picked from one screen; the "Choose from album" path stays for documents and
  for anything the grid cannot list.
- Order between photos and videos follows each platform's own date (iOS `creationDate`, Android
  `date_added`), so a mixed list can differ slightly between the two.
- Play's photo and video permission declaration has to include `READ_MEDIA_VIDEO` before an Android
  release ships this.
- iOS purpose strings now say what chat uses the library and the camera for: photos and videos sent
  and saved, and photos taken.
- A video copied out of iCloud shows no progress; the web waits up to ten minutes for it.

## Alternatives

- **Send grid videos as base64, like photos.** No new message, but a 300 MB video does not fit through
  the bridge.
- **Open the OS picker from the grid's video tiles.** Reuses ADR-0158 unchanged, but a second picker
  over the grid for the item already chosen is the same detour people complained about.
- **Copy videos without judging them, and let `PrepareVideo` refuse later.** Simpler at pick time, but
  the refusal then arrives after the message is already on screen, which is what the grid exists to
  avoid.
- **One module-level switch for the whole grid.** Fewer checks, but an app with the grid and without
  `KeepLibraryVideo` could not be told apart from one with both.
