import type {
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    OnKeepLibraryVideoPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnManagePhotoSelectionPayload,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadPhotoPayload,
    PermissionStatus,
    PickAttachmentsPayload,
} from '@chatic/bridge-messages';

import type { ShellOrBrowser } from './ports';

/**
 * Who picks the photos, videos and documents a person attaches.
 *
 * - `shell` — the app does: its own picker and photo library, its video conversion, and the permission
 *   prompts behind them. What it picked stays in the app and goes up from there.
 * - `browser` — the page does, with its own file input; nothing else is on offer.
 *
 * Each of the app's pieces is a member that is `null` where the host has none, so a feature asks for
 * the piece it needs, not for the side. The members carry the app's answers as it sends them; turning
 * them into the page's files and the send's shapes takes types from the data layer and the runtime, so
 * that stays in the app that uses them.
 */
export interface MediaPort {
    readonly kind: MediaMethod;
    /**
     * The app's own picker for photos, videos and documents, which keeps what was picked in the app.
     * `null` where the page picks with its file input: a browser, and the desktop app.
     */
    readonly picker: AppAttachmentPicker | null;
    /**
     * The device's photo library, read page by page for the in-app grid. `null` where the page has no
     * library to read: a browser, and the desktop app.
     */
    readonly photoLibrary: DevicePhotoLibrary | null;
    /**
     * The app's conversion of a video it keeps into one the server takes, with its poster. `null` where
     * the page never holds a video kept outside it: a browser, and the desktop app.
     */
    readonly videoConverter: VideoConverter | null;
    /**
     * The camera permission, asked before the page opens a capturing file input. `null` where the page
     * opens the input straight away and leaves the prompt to the browser.
     */
    readonly cameraPermission: CameraPermission | null;
}

export type MediaMethod = ShellOrBrowser;

/** The app's own picker. */
export interface AppAttachmentPicker {
    /**
     * Opens the picker and resolves with what was picked, in pick order, and what the app would not
     * copy. Waits for as long as the person browses and the copies take. A cancel is an empty pick.
     * Rejects with the app's code — `BUSY` while a picker is already open.
     */
    pick(input: PickAttachmentsPayload): Promise<OnPickAttachmentsPayload>;
    /**
     * The prepared bytes of one picked photo, named by its `uri`. Rejects when the app cannot read it —
     * the copy is gone, or the address is not one of its picks.
     */
    read(uri: string): Promise<OnReadAttachmentPayload>;
}

/** The device's photo library. */
export interface DevicePhotoLibrary {
    /** The albums, once the OS permission is asked for. */
    albums(input: ListPhotoAlbumsPayload): Promise<OnListPhotoAlbumsPayload>;
    /** One page of the library, newest first, with small previews. */
    photos(input: ListPhotosPayload): Promise<OnListPhotosPayload>;
    /** The prepared bytes of the photo behind `id`. */
    read(id: string): Promise<OnReadPhotoPayload>;
    /**
     * Copies the video behind `id` into the app's own folder and resolves with where it is kept.
     * Rejects with the app's code (`UNSUPPORTED`, `TOO_LARGE`, …).
     */
    keepVideo(id: string): Promise<OnKeepLibraryVideoPayload>;
    /** Opens the iOS sheet that changes which photos are shared, and resolves once it closes. */
    manageSelection(): Promise<OnManagePhotoSelectionPayload>;
}

/** The app's video conversion. */
export interface VideoConverter {
    /**
     * Converts the kept video at `uri` and makes its poster. Waits as long as a long video takes.
     * Rejects with the app's code (`TOO_LARGE`, `UNSUPPORTED`, …).
     */
    prepare(uri: string): Promise<OnPrepareVideoPayload>;
}

/** The camera permission, as the app holds it. */
export interface CameraPermission {
    /**
     * Asks for the camera, raising the OS prompt when it has not been answered yet, and resolves with
     * the app's answer — `null` when the answer names none. Rejects when the request fails.
     */
    request(): Promise<PermissionStatus | null>;
}
