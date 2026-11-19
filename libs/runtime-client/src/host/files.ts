import type { OnReadVideoFramePayload, OnSaveFilePayload, ReadVideoFramePayload } from '@chatic/bridge-messages';
import type { PutPort, ShellFilePutPort } from '@chatic/data';

import type { ShellOrBrowser } from './ports';

/**
 * Who moves a message's files: uploads, downloads, and the first frame of a video without a poster.
 *
 * - `shell` — the app does: its transfer module puts and fetches the bytes in the background, keeps a
 *   downloaded file to open, save or share, and reads a video's frame from the device.
 * - `browser` — the page does, with its own requests: a PUT for an upload, a fetch saved under the file's
 *   name for a download, and a frame drawn from the bucket's copy.
 *
 * Every host sends an upload, each its own way, so that is a method. The app's transfer module is a
 * member that is `null` where the page moves the files itself, so a feature asks for the member, not
 * for the side.
 */
export interface FilesPort {
    readonly kind: FilesMethod;
    /**
     * Sends a file the page holds to its upload target. The phone app's transfer module carries it in
     * the background and hands the page's own PUT whatever it does not move itself; everywhere else the
     * page sends it with its own PUT.
     */
    readonly put: PutPort;
    /**
     * The app's transfer module: the files it keeps, the downloads it hands to the OS, and the video
     * frames it reads from the device. `null` where the page moves files with its own requests — a
     * browser, and the desktop app.
     */
    readonly transfers: AppFileTransfers | null;
}

export type FilesMethod = ShellOrBrowser;

/** The app's transfer module, as the page reaches it. */
export interface AppFileTransfers {
    /** Sends a file the app keeps, from where it lies in the app's own folder. */
    readonly putShellFile: ShellFilePutPort;
    /**
     * Catches up with the uploads the app finished while the page was away — reloaded, or suspended in
     * the background while the app kept moving bytes. Downloads have a reader of their own.
     */
    syncUploads(): Promise<void>;
    /**
     * Opens a file the app downloaded (a `file://` URI) with the OS: QuickLook on iOS, the format's
     * viewer on Android. On iOS it resolves when the preview closes, however long the person keeps it
     * up. Rejects with the app's `code` — `NO_HANDLER` where nothing opens the format.
     */
    openFile(uri: string): Promise<void>;
    /**
     * Keeps a file the app downloaded on the device under `name`, and resolves with where it went —
     * `saved: false` when the person backed out of the iOS sheet; `undefined` when the app answered
     * without a body. Rejects with the app's `code`.
     */
    saveFile(uri: string, name: string): Promise<OnSaveFilePayload | undefined>;
    /**
     * Reads one frame of the video at `request.url` on the device, as a JPEG. Rejects with the app's
     * `code` — `NOT_FOUND` from an app built before it could.
     */
    readVideoFrame(request: ReadVideoFramePayload): Promise<OnReadVideoFramePayload>;
}
