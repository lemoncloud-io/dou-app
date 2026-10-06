import type { PickedShellAttachment } from './attachment-picker';

// --- Photo Library Types ---
//
// The in-app photo picker reads the device library through the shell: albums, a page of photos with
// small previews, and the bytes of the ones the user sends. The web never sees a device path — a
// `ph://` or `content://` URI cannot be opened from the WebView — so previews and picked photos both
// travel as base64.
//
// Videos are listed too when the web asks for them (`mediaTypes`). A picked video never crosses as
// base64: `KeepLibraryVideo` copies it into the shell's `attach-pick` folder and answers with the same
// reference `PickAttachments` gives, and the shell uploads it from there.
//
// The web ships before the app. A shell without these handlers answers `NOT_FOUND`, and the web
// learns from that once and falls back to the page's own file input. A shell from before videos drops
// `mediaTypes` and lists photos only, which is why the field is opt-in.

/**
 * Whether the page may read the library.
 * - `granted`: every photo.
 * - `limited`: iOS "selected photos" — only what the user chose to share; `ManagePhotoSelection`
 *   lets them change that choice.
 * - `denied`: nothing; the web offers to open the system settings.
 */
export type PhotoLibraryAccess = 'granted' | 'limited' | 'denied';

/** One album as the picker lists it. The first album a shell returns is "all photos". */
export type PhotoLibraryAlbum = {
    /** Opaque to the web — handed back as `ListPhotos.albumId`. */
    id: string;
    title: string;
    count: number;
    /** A small base64 JPEG of the album's newest photo, when it has one. */
    coverBase64?: string;
};

/** What a library item is. */
export type PhotoLibraryMediaType = 'image' | 'video';

/** One photo or video in a page of the library. */
export type PhotoLibraryItem = {
    /**
     * Opaque to the web — handed back as `ReadPhoto.id` for a photo, `KeepLibraryVideo.id` for a video.
     * Android prefixes a video's with `v:`, which an older shell's `ReadPhoto` refuses as `INVALID`.
     */
    id: string;
    /** A small base64 JPEG preview, about 256px on the long edge. Not the photo itself; a video's poster frame. */
    thumbBase64: string;
    width?: number;
    height?: number;
    /** MIME type of the original, when the library reports it (e.g. `image/heic`). */
    mimeType?: string;
    /** Absent means `image`: a shell from before videos never sets it. */
    mediaType?: PhotoLibraryMediaType;
    /** A video's length, in milliseconds. */
    durationMs?: number;
};

/** [Request] List the albums the picker can switch between. */
export type ListPhotoAlbumsPayload = {
    /**
     * What the albums count and draw their covers from. Default `['image']`. A shell from before videos
     * ignores it; one that has them adds a "Videos" album where the platform has one (iOS).
     */
    mediaTypes?: PhotoLibraryMediaType[];
};

/** [Response] Albums, newest-first "all photos" first. Empty when access is `denied`. */
export type OnListPhotoAlbumsPayload = {
    access: PhotoLibraryAccess;
    albums: PhotoLibraryAlbum[];
};

/** [Request] One page of photos (and videos, when asked for), newest first. */
export type ListPhotosPayload = {
    /** Omit for "all photos". */
    albumId?: string;
    /** The `next` cursor of the previous page; omit for the first. */
    after?: string;
    /** Page size. The shell may return fewer. */
    limit: number;
    /**
     * What to list. Default `['image']`, and a shell from before videos ignores the field and lists
     * photos only — so a page with no `mediaType: 'video'` item says nothing about the library.
     * Android lists videos only once the user has granted video access as well.
     */
    mediaTypes?: PhotoLibraryMediaType[];
};

/** [Response] A page of photos. `next` is absent on the last page. */
export type OnListPhotosPayload = {
    access: PhotoLibraryAccess;
    items: PhotoLibraryItem[];
    next?: string;
};

/**
 * [Request] The bytes of one photo, to send. The shell converts formats the server does not take
 * (HEIC) to JPEG, so what comes back is always sendable as-is.
 */
export type ReadPhotoPayload = {
    id: string;
};

/** [Response] The photo itself. */
export type OnReadPhotoPayload = {
    base64: string;
    mimeType: string;
    fileName: string;
    width?: number;
    height?: number;
};

/**
 * [Request] Let the user change which photos are shared, under iOS limited access. Resolves once the
 * system sheet is dismissed; the web then lists again. A no-op elsewhere.
 */
export type ManagePhotoSelectionPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] The access after the sheet closed. */
export type OnManagePhotoSelectionPayload = {
    access: PhotoLibraryAccess;
};

/**
 * [Request] Keep one library video in the shell for sending: the shell copies it into its `attach-pick`
 * folder and judges it there, as `PickAttachments` does for a video picked from the system picker.
 * What follows is the same — `PrepareVideo`, then the shell's own upload.
 *
 * Copying can mean an iCloud download first, with no progress to report; the web waits up to ten
 * minutes and asks for one video at a time. A shell from before videos answers `NOT_FOUND`.
 */
export type KeepLibraryVideoPayload = {
    /** A video item's `PhotoLibraryItem.id`. */
    id: string;
};

/**
 * [Response] The kept copy, in the shape `PickAttachments` answers for a video. On iOS `needsExport`
 * is set when the video is not yet an H.264 `mp4` of 1080p or less; an edited video is kept as the
 * edit, under its original name with a `.mov` extension, so it is always converted.
 */
export type OnKeepLibraryVideoPayload = PickedShellAttachment;

/**
 * The error codes `KeepLibraryVideo` fails with. The web refuses that video alone.
 * - `UNSUPPORTED`: Android — not an `mp4` of H.264 video with AAC or no audio. The shell does not convert.
 * - `TOO_LARGE`: over the video limit — on Android as stored, on iOS as the conversion estimates it.
 * - `PHOTO_MISSING`: the video is no longer in the library.
 * - `READ_FAILED`: the copy could not be made, an iCloud download that failed included.
 * - `INVALID`: a missing id, or one that is not a video's.
 */
export type KeepLibraryVideoErrorCode = 'UNSUPPORTED' | 'TOO_LARGE' | 'PHOTO_MISSING' | 'READ_FAILED' | 'INVALID';
