# Media export

A file the shell downloaded goes to an OS surface: the photo library, or the system share sheet. The
download itself is a `StartFileTransfer` with `direction: 'download'` ([file-transfer.md](./file-transfer.md));
its terminal event carries the local `file://` URI these two messages take. Fetching and exporting
are separate steps on purpose — the next consumer of a download reuses the first without a message of
its own.

## Files

| Layer             | File                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/media-export.ts`                                      |
| WebView handler   | `src/app/webview/hooks/mediaExportHandlers.ts`, `useMediaExportHandler.ts`               |
| TS native wrapper | `src/app/bridge/MediaExportBridge.ts`                                                    |
| Android           | `io/chatic/dou/module/MediaExportModule.kt`, `media/ShareFileProvider.kt`                |
| Android resources | `res/xml/share_file_paths.xml`, the `<provider>` and permission in `AndroidManifest.xml` |
| iOS               | `ios/Bridges/MediaExport/` — `MediaExport.swift`, `MediaExport.m`                        |
| Shared rules      | `transfer/core/DownloadFiles.kt`, `Transfer/Core/DownloadFiles.swift`                    |

## Messages

| Request              | Reply                  | What it does                                                                  |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `SaveToPhotoLibrary` | `OnSaveToPhotoLibrary` | Adds the image to the photo library, then deletes the shell's copy            |
| `ShareFile`          | `OnShareFile`          | Shows the share sheet with the file alone; `completed` says what the user did |

Both take `{ uri }` — `ShareFile` also an optional Android chooser `title` — and nothing else: no URL
ever reaches them. Failures use the envelope's `error.code`:

| Code                | When                                                                   | `details`                  |
| ------------------- | ---------------------------------------------------------------------- | -------------------------- |
| `PERMISSION_DENIED` | Photo access denied or restricted (iOS), storage refused (Android <29) | `{ canAskAgain: boolean }` |
| `UNSUPPORTED_TYPE`  | The bytes are not PNG, JPEG, GIF or WebP                               | —                          |
| `SOURCE`            | The file is gone or unreadable — the OS may have cleared the cache     | —                          |
| `INVALID`           | A missing field, or a URI outside the download folder                  | —                          |
| `INTERNAL`          | The photo library or media store refused, or there is no screen to use | —                          |

Closing the share sheet is not a failure: it is a success with `completed: false`. A shell that
predates these messages answers `NOT_FOUND`; the web shows its save and share controls only when the
handshake's `supportedWebMessages` lists both names. That list is built from the compiled message
map, not from the router, so the router registers both handlers in the same change as their types
and `useWebMessageRouter.test.ts` holds it there — a type without a handler would be advertised and
then fail.

## Rules

- **Only the shell's own downloads leave the app.** A URI is accepted only when it is `file://`, has
  no host, and — normalised so `..` cannot climb out, then with symbolic links resolved — lies inside
  `<cache>/transfer-download/`, is a file, and is not a `.part` still being received. Both sides of
  the comparison are real paths, because the cache directory itself can sit behind a link (`/var` is
  `/private/var` on iOS, `/data/user/0` a link on Android). Without this, a web page could put the
  app's database or settings on the share sheet. On Android the share provider's single path rule is
  a second line: no other file can become a `content://` URI there.
- **The bytes decide the type.** The first 12 bytes are matched against PNG, JPEG, GIF (87a/89a) and
  WebP (`RIFF…WEBP`); anything else, or a shorter file, is `UNSUPPORTED_TYPE`. The download's
  `contentType` is what the uploader declared, so nothing relies on it. A 200 that delivered an HTML
  page is kept as a file by the transfer and refused here.
- **Permission is asked at the moment of saving, and only for saving.** iOS asks for add-only access
  natively. Android API 24–28 needs `WRITE_EXTERNAL_STORAGE`, which JS requests with
  `PermissionsAndroid` before calling native — asking needs an Activity result, which React Native
  already handles — and API 29+ asks nothing. A refusal on Android reports `canAskAgain: true`, and
  "don't ask again" `false`; an iOS refusal is always `false`, since after one answer only the
  Settings app can change it. The web then offers `OpenSettings`.
- **A saved file is deleted, a shared one is kept.** The share sheet reads lazily — AirDrop and the
  Files app may open the file after the sheet has closed — so a shared file stays until the
  transfer's sweep removes folders older than a day.
- **`ShareFile` on iOS answers when the sheet closes**, which can be minutes. Messages are handled
  concurrently, so it holds up nothing else; the web gives this one request a long timeout.

## iOS

- **Save** is `PHPhotoLibrary.requestAuthorization(for: .addOnly)`, then
  `PHAssetCreationRequest.addResource(with: .photo, fileURL:)` — the original bytes, so an animated
  GIF stays animated; decoding into a `UIImage` first would keep one frame. Nothing is read back
  after the save: add-only access forbids it, and a lookup would turn a successful save into a
  reported failure.
- **Share** is a `UIActivityViewController` with the file URL, presented from the top view
  controller. On iPad it is a popover and needs an anchor, or the app crashes; the web button's
  position cannot be trusted outside the WebView, so the anchor is the bottom centre of the screen.
  The completion handler answers once, with `completed` and `activityType`.
- **`NSPhotoLibraryAddUsageDescription` is required even to share.** The sheet offers "Save Image",
  and that runs in this process. Without the key older iOS terminated the app, and iOS 18 and 26
  fall back to asking for full library access — worded for reading, for something that only adds.

## Android

- **Save, API 29+**: a `MediaStore.Images` row in `Pictures/DoU`, inserted with `IS_PENDING = 1` so
  the gallery never shows half an image, then the bytes, then `IS_PENDING = 0`. A null insert ends as
  `INTERNAL` straight away, and a failed copy deletes the pending row so no empty entry stays.
  MediaStore picks a free name when the name is taken.
- **Save, API 24–28**: a copy in the public `Pictures/DoU` folder, named `photo (1).png`, `(2)`, … on
  a collision, then `MediaScannerConnection.scanFile` so the gallery lists it.
- **Share** is `ACTION_SEND` with `EXTRA_STREAM`, the type from the bytes, the same URI in `ClipData`
  and `FLAG_GRANT_READ_URI_PERMISSION` — the chooser's preview and the chosen app both need the
  grant — shown through `Intent.createChooser`. Android does not report the outcome, so the reply is
  `completed: null`, sent once the chooser is up.
- **The provider is `ShareFileProvider`**, an empty subclass of `androidx.core`'s `FileProvider`, with
  authority `${applicationId}.share.fileprovider`. `react-native-webview` and
  `react-native-image-picker` each merge a provider of their own, so sharing a class or an authority
  with them would break the manifest merge or put these files under their path rules.
- **Declared**: `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"`, and nothing that reads media —
  the photo and video read permissions fall under a Play policy with a declaration form, and a save
  needs none of them. The merged manifest still lists `READ_EXTERNAL_STORAGE`: the build implies it
  for `@dr.pogodin/react-native-fs`, a linked library that declares `WRITE_EXTERNAL_STORAGE` with no
  limit. It predates this module.

## Verifying

- JS relay and the Android <29 permission step: `yarn workspace @chatic/mobile test mediaExportHandlers useWebMessageRouter`.
- The allowed-path and byte rules are core cases `U19` and `U20` on both platforms (see
  [file-transfer.md](./file-transfer.md) § Verifying for the commands).
- Saving adds no media-read permission of its own. The merged manifest's only `READ_MEDIA` entries
  are the in-app photo picker's ([photo-library.md](./photo-library.md)), which reads the library and
  is declared to Play for it:

    ```bash
    grep 'READ_MEDIA' apps/mobile/android/app/build/intermediates/merged_manifest/devDebug/processDevDebugMainManifest/AndroidManifest.xml
    # READ_MEDIA_IMAGES and READ_MEDIA_VISUAL_USER_SELECTED only — both from the photo library
    ```

- End to end: download `GET /s3/image?format=gif` from the test server, then save it — the photo
  library shows it animated; share it — the sheet shows the file, and closing it answers
  `completed: false`. On an iPad simulator the sheet is a popover. `GET /s3/html` downloads fine and
  both calls then answer `UNSUPPORTED_TYPE`.

## Checklist

- Does a URI outside `transfer-download/` — by `..`, a symbolic link or another folder — fail with `INVALID`?
- Is the type read from the bytes, never from `Content-Type` or the file name?
- Does a save leave no copy behind, and a share keep its file?
- Is the iPad share sheet anchored?
- Did the change add a media-read permission beyond the photo picker's to the merged manifest?
