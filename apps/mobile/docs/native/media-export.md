# Media export

A file the shell downloaded goes to an OS surface: the photo library, the system share sheet, the OS
preview, or the device's downloads. The download itself is a `StartFileTransfer` with
`direction: 'download'` ([file-transfer.md](./file-transfer.md)); its terminal event carries the local
`file://` URI these four messages take. Fetching and exporting are separate steps on purpose — the
next consumer of a download reuses the first without a message of its own, so a document saved from
the chat can be opened from the same file afterwards.

## Files

| Layer             | File                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Messages          | `libs/app-messages/src/types/model/media-export.ts`                                                   |
| WebView handler   | `src/app/webview/hooks/mediaExportHandlers.ts`, `useMediaExportHandler.ts`                            |
| TS native wrapper | `src/app/bridge/MediaExportBridge.ts`                                                                 |
| Android           | `io/chatic/dou/module/MediaExportModule.kt`, `media/ShareFileProvider.kt`                             |
| Android resources | `res/xml/share_file_paths.xml`, the `<provider>` and permission in `AndroidManifest.xml`              |
| iOS               | `ios/Bridges/MediaExport/` — `MediaExport.swift`, `MediaExport.m`                                     |
| Shared rules      | `transfer/core/DownloadFiles.kt`, `Transfer/Core/DownloadFiles.swift`                                 |
| Android rules     | `media/core/ExportFormats.kt` — byte families, the outgoing type, `SaveFile`'s name                   |
| Tests             | `test/.../media/core/ExportFormatsTest.kt`, `ios/ChaticTransferCoreTests/MediaExportRulesTests.swift` |

## Messages

| Request              | Reply                  | What it does                                                                      |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `SaveToPhotoLibrary` | `OnSaveToPhotoLibrary` | Adds the image or MP4 video to the photo library, then deletes the shell's copy   |
| `ShareFile`          | `OnShareFile`          | Shows the share sheet with the file alone; `completed` says what the user did     |
| `OpenFile`           | `OnOpenFile`           | Shows the file in the OS preview — QuickLook, or the app Android picks to view it |
| `SaveFile`           | `OnSaveFile`           | Keeps the file on the device under its own name; `location` says where it went    |

All four take `{ uri }` — `ShareFile` also an optional Android chooser `title`, `SaveFile` the `name`
to keep it under — and nothing else: no URL ever reaches them. A missing or empty `uri`, or a
`SaveFile` without a `name`, is `INVALID` before native code runs. Failures use the envelope's
`error.code`:

| Code                | When                                                                                     | `details`                  |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------- |
| `PERMISSION_DENIED` | Photo access denied or restricted (iOS), storage refused (Android <29)                   | `{ canAskAgain: boolean }` |
| `UNSUPPORTED_TYPE`  | The bytes are not of a family the message takes (§ Rules)                                | —                          |
| `SOURCE`            | The file is gone or unreadable — the OS may have cleared the cache                       | —                          |
| `INVALID`           | A missing field, a URI outside the download folder, or a `SaveFile` name it cannot keep  | —                          |
| `INTERNAL`          | The photo library or media store refused, there is no screen to use, or anything unnamed | —                          |
| `NO_HANDLER`        | `OpenFile` only: nothing on the device can show this format (an HWP, usually)            | —                          |

Closing the share sheet is not a failure: it is a success with `completed: false`, and dismissing the
iOS export sheet of `SaveFile` is a success with `saved: false`.

**What a shell can do is learnt three ways.**

- A shell that predates `SaveToPhotoLibrary` and `ShareFile` answers `NOT_FOUND`; the web shows its
  photo save and share controls only when the handshake's `supportedWebMessages` lists both names.
  That list is built from the compiled message map, not from the router, so the router registers both
  handlers in the same change as their types and `useWebMessageRouter.test.ts` holds it there — a type
  without a handler would be advertised and then fail.
- `OpenFile` and `SaveFile` came later, and JS can run over a native `MediaExport` built before them.
  The router registers each only when the native module has its method
  (`MediaExportBridge.canOpenFile`, `canSaveFile`); otherwise the bridge answers `NOT_FOUND`, which is
  how the web learns this shell cannot, and points the person at an update. A registered handler
  answering an error instead would leave the web asking.
- Videos and documents widened two existing messages instead of adding new ones. An app built before
  them answers a video saved to the library, or a document shared, with `UNSUPPORTED_TYPE` — its
  byte check knew images only. The web takes that answer as the signal and hides those controls for
  the rest of the session, so `UNSUPPORTED_TYPE` must keep meaning "this format", never another
  failure.

## Rules

- **Only the shell's own downloads leave the app.** A URI is accepted only when it is `file://`, has
  no host, and — normalised so `..` cannot climb out, then with symbolic links resolved — lies inside
  `<cache>/transfer-download/`, is a file, and is not a `.part` still being received. Both sides of
  the comparison are real paths, because the cache directory itself can sit behind a link (`/var` is
  `/private/var` on iOS, `/data/user/0` a link on Android). Without this, a web page could put the
  app's database or settings on the share sheet. On Android the share provider's single path rule is
  a second line: no other file can become a `content://` URI there. The rule is the same for all four
  messages.
- **The bytes decide the family; the name decides the type.** The download's `contentType` is what the
  uploader declared, so nothing relies on it. The first bytes are matched against a family:

    | Family   | Bytes                                      | Taken by                            |
    | -------- | ------------------------------------------ | ----------------------------------- |
    | Image    | PNG, JPEG, GIF (87a/89a), WebP             | all four                            |
    | ISO BMFF | `ftyp` at offset 4 — an MP4                | all four                            |
    | PDF      | `%PDF`                                     | `ShareFile`, `OpenFile`, `SaveFile` |
    | ZIP      | `PK\x03\x04` — DOCX, XLSX, PPTX and HWPX   | `ShareFile`, `OpenFile`, `SaveFile` |
    | OLE2     | `D0 CF 11 E0 A1 B1 1A E1` — HWP            | `ShareFile`, `OpenFile`, `SaveFile` |
    | Text     | a `.txt` name and no NUL in the first 4 KB | `ShareFile`, `OpenFile`, `SaveFile` |

    Anything else, or a shorter file, is `UNSUPPORTED_TYPE`. A 200 that delivered an HTML page is kept
    as a file by the transfer and refused here. The family only gates: four formats are one ZIP and
    nothing in their first bytes tells them apart, so the MIME type (UTType on iOS) a shared document
    carries comes from its name's extension — a ZIP named `.docx` is shared as a Word document. The
    name is the one the transfer gave the download ([file-transfer.md](./file-transfer.md) § Downloads).
    `OpenFile` and `SaveFile` gate on the family too, so a page of HTML that a failed download left under a
    `.pdf` name is neither opened nor saved. `SaveFile` judges the name it is given as well (below).

- **Permission is asked at the moment of saving, and only for saving.** iOS asks for add-only photo
  access natively. Android API 24–28 needs `WRITE_EXTERNAL_STORAGE` for both `SaveToPhotoLibrary` and
  `SaveFile`, which JS requests with `PermissionsAndroid` before calling native — asking needs an
  Activity result, which React Native already handles — and API 29+ asks nothing. A refusal on
  Android reports `canAskAgain: true`, and "don't ask again" `false`; an iOS refusal is always
  `false`, since after one answer only the Settings app can change it. The web then offers
  `OpenSettings`. `ShareFile` and `OpenFile` never ask.
- **A file put in the photo library is deleted; every other export keeps it.** The share sheet reads
  lazily — AirDrop and the Files app may open the file after the sheet has closed — and a document
  saved or previewed may be opened again from the toast or the card. Kept files stay until the
  transfer's sweep removes folders older than a day.
- **`ShareFile`, `OpenFile` and `SaveFile` on iOS answer when their sheet or preview closes**, which
  can be minutes. Messages are handled concurrently, so they hold up nothing else; the handler has no
  timeout of its own, and the web gives each of these requests a long one.
- **`SaveFile` checks the name once more.** Path separators are removed, and an extension that is not
  one of the server's twelve formats (`png jpg jpeg gif webp mp4 pdf docx xlsx pptx hwp hwpx txt`) is
  `INVALID` — the name comes from the page, and it decides what the OS thinks the file is.

## iOS

- **Save** is `PHPhotoLibrary.requestAuthorization(for: .addOnly)`, then `PHAssetCreationRequest` with
  the file as a `.photo` resource, or `.video` for an MP4 — the original bytes, so an animated GIF
  stays animated; decoding into a `UIImage` first would keep one frame. Nothing is read back after the
  save: add-only access forbids it, and a lookup would turn a successful save into a reported failure.
- **Share** is a `UIActivityViewController` with the file URL, presented from the top view
  controller. On iPad it is a popover and needs an anchor, or the app crashes; the web button's
  position cannot be trusted outside the WebView, so the anchor is the bottom centre of the screen.
  The completion handler answers once, with `completed` and `activityType`.
- **Open** is a `QLPreviewController`, presented over the top view controller — above an RN modal
  too — which carries its own share button. `QLPreviewController.canPreview` is asked first: for an
  HWP it is `false`, yet the preview would still open and draw an empty page with the name, "data"
  and a size. So `false` answers `NO_HANDLER` without presenting, and the web offers the share sheet,
  which lists "Save to Files" and any installed viewer. The reply arrives when the preview closes.
- **Save a file** copies the download under the checked name into a temporary folder and presents
  `UIDocumentPickerViewController(forExporting:asCopy: true)`, where the person picks the place; the
  sheet opens in the folder chosen last, even after a relaunch. It has no cancel button — swiping it
  away, or choosing "Stop" when a file of that name exists, is `documentPickerWasCancelled`, answered
  `saved: false`. A pick answers `saved: true` with the file name as `location`. The app's own folder
  is not exposed in Files: the person chooses each time instead.
- **`NSPhotoLibraryAddUsageDescription` is required even to share.** The sheet offers "Save Image",
  and that runs in this process. Without the key older iOS terminated the app, and iOS 18 and 26
  fall back to asking for full library access — worded for reading, for something that only adds.

## Android

- **Save, API 29+**: a `MediaStore.Images` row in `Pictures/DoU`, or a `MediaStore.Video` row in
  `Movies/DoU` for an MP4, inserted with `IS_PENDING = 1` so the gallery never shows half a file, then
  the bytes, then `IS_PENDING = 0`. A null insert ends as `INTERNAL` straight away, and a failed copy
  deletes the pending row so no empty entry stays. MediaStore picks a free name when the name is taken.
- **Save, API 24–28**: a copy in the public `Pictures/DoU` or `Movies/DoU` folder, named `photo (1).png`,
  `(2)`, … on a collision, then `MediaScannerConnection.scanFile` so the gallery lists it.
- **Share** is `ACTION_SEND` with `EXTRA_STREAM`, the type from the name's extension, the same URI in `ClipData` and `FLAG_GRANT_READ_URI_PERMISSION` — the chooser's preview and
  the chosen app both need the grant — shown through `Intent.createChooser`. Android does not report
  the outcome, so the reply is `completed: null`, sent once the chooser is up.
- **Open** is `ACTION_VIEW` with the share provider's `content://` URI, the MIME type from the
  extension and `FLAG_GRANT_READ_URI_PERMISSION`, started directly — not through `createChooser`.
  Wrapped in a chooser, a format nothing opens raises no error and shows a dead-end "no app can
  perform this action" sheet; started directly it throws `ActivityNotFoundException`, which answers
  `NO_HANDLER`. Asking the package manager first would need a `<queries>` declaration from API 30 on,
  which the manifest does not carry. The reply is sent once the viewer is started.
- **Save a file, API 29+**: a `MediaStore.Downloads` row with `RELATIVE_PATH` `Download/DoU/`, written
  with the same `IS_PENDING` steps, and no permission. When the name is taken the OS numbers it
  (`name (1).pdf`), and only after `IS_PENDING` is cleared, so the row's `DISPLAY_NAME` is read back
  then and answered as `location: "Download/DoU/<final name>"`.
- **Save a file, API 24–28**: there is no `MediaStore.Downloads`. The copy goes into the public
  downloads folder's `DoU/`, with the storage permission JS asked for. That folder silently overwrites
  a file of the same name, so the shell picks `name (1).ext`, `(2)`, … itself.
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

- JS relay, the Android <29 permission step for both saves, and where the router registers each
  message: `npx jest --config apps/mobile/jest.config.js mediaExportHandlers MediaExportBridge useWebMessageRouter`.
- The allowed-path and byte rules are core cases `U19` and `U20` on both platforms (see
  [file-transfer.md](./file-transfer.md) § Verifying for the commands).
- The export rules — byte families, the type a file goes out under, `SaveFile`'s name check — have
  their own tests: Android `ExportFormatsTest.kt`, from `apps/mobile/android`:
  `./gradlew :app:testDevDebugUnitTest --tests "io.chatic.dou.media.*"`; iOS `MediaExportRulesTests.swift`,
  in the `ChaticTransferCoreTests` target, run with the core command in
  [file-transfer.md](./file-transfer.md) § Verifying.
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
- Documents: download a PDF and an HWP. `OpenFile` shows the PDF (Drive's viewer on a Play emulator)
  and answers `NO_HANDLER` for the HWP on both platforms. `SaveFile` twice with the same name ends as
  `Download/DoU/name (1).pdf` on Android 10+ and on API 28 alike; on iOS the export sheet opens, and
  swiping it away answers `saved: false`.

## Checklist

- Does a URI outside `transfer-download/` — by `..`, a symbolic link or another folder — fail with `INVALID`?
- Is the family read from the bytes, never from `Content-Type`, and the shared type from the name?
- Does a save to the library leave no copy behind, and every other export keep its file?
- Is the iPad share sheet anchored?
- Does `OpenFile` on Android start the viewer without a chooser, and iOS ask `canPreview` first?
- Does an old native module leave `OpenFile` and `SaveFile` unregistered rather than failing them?
- Did the change add a media-read permission beyond the photo picker's to the merged manifest?
