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
//
// `thumbSize` and `offset` are opt-in the same way. A shell from before them ignores both: without the
// first it answers its old previews, which are only smaller; without the second it answers the first
// page, which is why a page paged by offset says so (`OnListPhotosPayload.offset`) and the web trusts
// an offset only when it is echoed.

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
    /** A small base64 JPEG of the album's newest photo, when it has one — square at `thumbSize` when asked for. */
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
    /**
     * A small base64 JPEG preview. Not the photo itself; a video's poster frame. With `thumbSize` it is
     * the centre square of the photo, at most `thumbSize` pixels a side. It is smaller when the photo
     * is, or when the shell answers from a smaller rendition the system already keeps: iOS answers 353–440
     * at 352, and Android's system thumbnail has its own ceiling. Whether a preview is sharp enough is
     * judged by the size asked for, never by the pixels that came back. Without `thumbSize`, about 256px
     * on the long edge, uncropped. Empty only on a page asked for by `offset`, for an
     * item whose preview could not be made — its place in the list is still its own.
     */
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
    /** The covers' size, as `ListPhotosPayload.thumbSize`. */
    thumbSize?: number;
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
    /**
     * The previews' size: the side of a square, in device pixels — what the tile is drawn at. The shell
     * clamps it to 64–720, and may answer a little under it (see `PhotoLibraryItem.thumbBase64`). Omitted, the shell answers the uncropped ~256px previews it always did.
     */
    thumbSize?: number;
    /**
     * Where the page starts, as an index into the list (0 = newest). Lets the grid fill any stretch of a
     * long album without paging up to it. Set, `after` is ignored and the reply carries `offset` and
     * `total`. A shell from before it ignores it and answers the first page with neither.
     */
    offset?: number;
};

/** [Response] A page of photos. `next` is absent on the last page and on a page asked for by `offset`. */
export type OnListPhotosPayload = {
    access: PhotoLibraryAccess;
    items: PhotoLibraryItem[];
    next?: string;
    /**
     * The index of `items[0]` — present exactly when the page was cut by `offset`. Clamped to `total`,
     * so an offset past the end answers an empty page at `total`. Every item of such a page is the one at
     * its index: none is left out, even one without a preview.
     */
    offset?: number;
    /**
     * How many items the list holds as this page was cut — with `offset`. A count that differs from the
     * one the grid laid out for means the library changed, and the indices with it.
     */
    total?: number;
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
