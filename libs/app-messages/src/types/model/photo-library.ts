// --- Photo Library Types ---
//
// The in-app photo picker reads the device library through the shell: albums, a page of photos with
// small previews, and the bytes of the ones the user sends. The web never sees a device path — a
// `ph://` or `content://` URI cannot be opened from the WebView — so previews and picked photos both
// travel as base64.
//
// The web ships before the app. A shell without these handlers answers `NOT_FOUND`, and the web
// learns from that once and falls back to the page's own file input.

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

/** One photo in a page of the library. */
export type PhotoLibraryItem = {
    /** Opaque to the web — handed back as `ReadPhoto.id`. */
    id: string;
    /** A small base64 JPEG preview, about 256px on the long edge. Not the photo itself. */
    thumbBase64: string;
    width?: number;
    height?: number;
    /** MIME type of the original, when the library reports it (e.g. `image/heic`). */
    mimeType?: string;
};

/** [Request] List the albums the picker can switch between. */
export type ListPhotoAlbumsPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};

/** [Response] Albums, newest-first "all photos" first. Empty when access is `denied`. */
export type OnListPhotoAlbumsPayload = {
    access: PhotoLibraryAccess;
    albums: PhotoLibraryAlbum[];
};

/** [Request] One page of photos, newest first. */
export type ListPhotosPayload = {
    /** Omit for "all photos". */
    albumId?: string;
    /** The `next` cursor of the previous page; omit for the first. */
    after?: string;
    /** Page size. The shell may return fewer. */
    limit: number;
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
