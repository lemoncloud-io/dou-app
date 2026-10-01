// --- Media Export Types ---
//
// Hands a file the shell downloaded to an OS surface: the photo library, or the system share sheet.
// Both messages take a local `file://` URI and nothing else — never a URL. Fetching the bytes is a
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
// - `UNSUPPORTED_TYPE`: the file's bytes are not PNG, JPEG, GIF or WebP.
// - `SOURCE`: the file does not exist or cannot be read (the OS may have cleared the cache).
// - `INVALID`: a missing field, or a URI outside the shell's download folder.
// - `INTERNAL`: anything else — the photo library or media store refused, or there is no screen to
//   present the share sheet on.
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`. The web shows its
// save and share controls only when the handshake's `supportedWebMessages` lists both names.

/** The error codes `SaveToPhotoLibrary` and `ShareFile` fail with. */
export type MediaExportErrorCode = 'PERMISSION_DENIED' | 'UNSUPPORTED_TYPE' | 'SOURCE' | 'INVALID' | 'INTERNAL';

/** `details` of a `PERMISSION_DENIED` failure. */
export type MediaExportPermissionDetails = {
    /** Whether asking again can show the system prompt. `false`: only the settings can grant it. */
    canAskAgain: boolean;
};

/** The image types the shell recognises from a file's first bytes. */
export type MediaExportImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/**
 * [Request] Add an image the shell downloaded to the photo library — the camera roll on iOS,
 * `Pictures/DoU` on Android. The original bytes are stored as they are, so an animated GIF stays
 * animated. The shell deletes its copy once the save succeeds.
 */
export type SaveToPhotoLibraryPayload = {
    /** A `file://` URI from a download's terminal event (`OnFileTransferStatePayload.file.uri`). */
    uri: string;
};

/** [Response] The image was saved. */
export type OnSaveToPhotoLibraryPayload = {
    /** The type read from the file's bytes, which is also the type it was saved as. */
    mimeType: MediaExportImageType;
};

/**
 * [Request] Put a file the shell downloaded on the system share sheet, as a file — no text is added,
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
