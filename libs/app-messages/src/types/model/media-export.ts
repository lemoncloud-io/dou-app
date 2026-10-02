// --- Media Export Types ---
//
// Hands a file the shell downloaded to an OS surface: the photo library, the system share sheet, the
// OS preview, or the device's downloads. Every message takes a local `file://` URI and nothing else —
// never a URL. Fetching the bytes is a
// `StartFileTransfer` download, and its terminal event carries the URI these messages accept; keeping
// the two apart lets the next consumer of a download reuse it without a new message.
//
// The shell accepts only files inside its own download folder. A URI anywhere else — the app's
// database, its settings, a file another feature wrote — is refused with `INVALID`, so the web
// cannot put an internal file on the share sheet.
//
// Failures use the envelope's `error.code`:
// - `PERMISSION_DENIED`: photo access was denied or is restricted. `details` is
//   `{ canAskAgain: boolean }` — `false` means only the system settings can change it.
// - `UNSUPPORTED_TYPE`: the file's bytes are not a format the message takes. `SaveToPhotoLibrary`
//   takes PNG, JPEG, GIF, WebP and MP4; `ShareFile` takes those and the server's documents (PDF, the
//   ZIP family — DOCX, XLSX, PPTX, HWPX —, OLE2 for HWP, and text). An app built before videos and
//   documents answers a video or document this way, which is how the web learns it cannot.
// - `SOURCE`: the file does not exist or cannot be read (the OS may have cleared the cache).
// - `INVALID`: a missing field, or a URI outside the shell's download folder.
// - `INTERNAL`: anything else — the photo library or media store refused, or there is no screen to
//   present the share sheet on.
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`. The web shows its
// photo save and share controls only when the handshake's `supportedWebMessages` lists both names.
// `OpenFile` and `SaveFile` are newer still; the web learns a shell without them from `NOT_FOUND`.

/**
 * The error codes the export messages fail with. `NO_HANDLER` is `OpenFile`'s alone: nothing on the
 * device opens this format (an HWP, usually), and the web offers the share sheet instead.
 */
export type MediaExportErrorCode =
    | 'PERMISSION_DENIED'
    | 'UNSUPPORTED_TYPE'
    | 'SOURCE'
    | 'INVALID'
    | 'INTERNAL'
    | 'NO_HANDLER';

/** `details` of a `PERMISSION_DENIED` failure. */
export type MediaExportPermissionDetails = {
    /** Whether asking again can show the system prompt. `false`: only the settings can grant it. */
    canAskAgain: boolean;
};

/** The image types the shell recognises from a file's first bytes. */
export type MediaExportImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** The media types the photo library takes: the images, and an MP4 video (an ISO BMFF file). */
export type MediaExportMediaType = MediaExportImageType | 'video/mp4';

/**
 * [Request] Add an image or video the shell downloaded to the photo library — the camera roll on iOS,
 * `Pictures/DoU` (images) or `Movies/DoU` (videos) on Android. The original bytes are stored as they
 * are, so an animated GIF stays animated. The shell deletes its copy once the save succeeds.
 */
export type SaveToPhotoLibraryPayload = {
    /** A `file://` URI from a download's terminal event (`OnFileTransferStatePayload.file.uri`). */
    uri: string;
};

/** [Response] The image was saved. */
export type OnSaveToPhotoLibraryPayload = {
    /** The type read from the file's bytes, which is also the type it was saved as. */
    mimeType: MediaExportMediaType;
};

/**
 * [Request] Put a file the shell downloaded on the system share sheet, as a file — no text is added,
 * typed by its name's extension once its bytes are found to be of an allowed family (a DOCX and an
 * XLSX are both ZIP files; only the name tells them apart),
 * because a receiving app offered both tends to take the text and drop the file.
 *
 * On iOS the reply arrives when the sheet closes, which can be minutes later; a caller must wait
 * longer than its default request timeout. On Android the reply arrives as soon as the sheet is
 * shown. The shell keeps the file afterwards, since a receiving app may read it late.
 */
export type ShareFilePayload = {
    /** A `file://` URI from a download's terminal event (`OnFileTransferStatePayload.file.uri`). */
    uri: string;
    /** Title of the Android chooser. iOS does not show one. */
    title?: string;
};

/** [Response] The share sheet was shown and, on iOS, closed. Closing it is not a failure. */
export type OnShareFilePayload = {
    /**
     * iOS: `true` when the user picked a target and it finished, `false` when the sheet was closed.
     * Android: `null` — the system does not report the outcome.
     */
    completed: boolean | null;
    /** iOS only: the chosen activity, for example `com.apple.UIKit.activity.SaveToCameraRoll`. */
    activityType?: string;
};

/**
 * [Request] Open a document the shell downloaded in the OS preview: iOS QuickLook (which carries its
 * own share button), Android the app the system picks for `ACTION_VIEW`. Fails with `NO_HANDLER` when
 * nothing can show it — iOS asks QuickLook first, which would otherwise draw an empty page for an HWP —
 * and the web then puts the file on the share sheet instead.
 *
 * On iOS the reply arrives when the preview closes; on Android once the viewer is started.
 */
export type OpenFilePayload = {
    /** A `file://` URI from a download's terminal event (`OnFileTransferStatePayload.file.uri`). */
    uri: string;
};

/** [Response] The preview was shown. */
export type OnOpenFilePayload = Record<string, never>;

/**
 * [Request] Keep a document the shell downloaded on the device, under its own name, straight from the
 * chat.
 *
 * - Android 10+: `Download/DoU/<name>` through the media store, with no permission. When the name is
 *   taken the OS numbers it (`name (1).pdf`), which is known only after the save — `location` says
 *   where it went.
 * - Android 7–9: the public `Download/DoU/` folder, asking for the storage permission the first time.
 *   The shell numbers a taken name itself, since that folder would overwrite it.
 * - iOS: the export sheet (`UIDocumentPickerViewController`, as a copy), where the user picks the place.
 *   The sheet remembers the last one. Dismissing it is `saved: false`, not a failure.
 *
 * The shell checks the name once more: path separators are removed, and an extension that is not one
 * of the server's formats is `INVALID`. The downloaded file stays in the shell's folder, so the web can
 * open it afterwards with `OpenFile`.
 */
export type SaveFilePayload = {
    /** A `file://` URI from a download's terminal event (`OnFileTransferStatePayload.file.uri`). */
    uri: string;
    /** The name to keep it under — the upload's own name. */
    name: string;
};

/** [Response] Where it was kept, or that the user backed out of the iOS sheet. */
export type OnSaveFilePayload =
    | {
          saved: true;
          /** A place the user can recognise: `Download/DoU/name (1).pdf` on Android, the file name on iOS. */
          location: string;
      }
    | { saved: false };
