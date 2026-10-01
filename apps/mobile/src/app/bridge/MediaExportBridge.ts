import { NativeModules } from 'react-native';
import type {
    MediaExportErrorCode,
    MediaExportMediaType,
    OnOpenFilePayload,
    OnSaveFilePayload,
    OnShareFilePayload,
} from '@chatic/app-messages';

/**
 * MediaExport — the native module that puts a downloaded file on an OS surface (Kotlin
 * `MediaExportModule`, Swift `MediaExport`).
 *
 * Every call takes the `file://` URI a download's terminal event carries. The native side accepts only
 * files inside its own download folder, and for the photo library and the share sheet only formats it
 * recognises by their bytes, so a caller cannot use it to export any other file of the app.
 *
 * `openFile` and `saveFile` came after the first two. JS can run over a native build whose module
 * predates them, so `canOpenFile` / `canSaveFile` say whether the native method exists; the router
 * registers `OpenFile` and `SaveFile` only then, leaving the web the `NOT_FOUND` it learns from.
 */
const { MediaExport } = NativeModules;

/** A rejected native call carries one of the media export codes in `code`, ready for the reply envelope. */
export interface MediaExportError extends Error {
    code: MediaExportErrorCode;
}

export interface IMediaExportBridge {
    /**
     * Adds the image or MP4 video to the photo library (iOS) or `Pictures/DoU` / `Movies/DoU`
     * (Android), then deletes the shell's copy. On iOS the add-only permission prompt is shown here
     * the first time; on Android API 24–28 the storage permission must already be granted.
     */
    saveToPhotoLibrary(uri: string): Promise<{ mimeType: MediaExportMediaType }>;
    /**
     * Shows the share sheet with the file. Resolves on iOS when the sheet closes and on Android as
     * soon as it is shown (`completed: null`).
     */
    shareFile(uri: string, title?: string): Promise<OnShareFilePayload>;
    /** Whether this build's native module has `openFile`. */
    readonly canOpenFile: boolean;
    /**
     * Shows the file in the OS preview (QuickLook, or the `ACTION_VIEW` app). Resolves on iOS when the
     * preview closes and on Android once the viewer started. `NO_HANDLER` when nothing can show it.
     */
    openFile(uri: string): Promise<OnOpenFilePayload>;
    /** Whether this build's native module has `saveFile`. */
    readonly canSaveFile: boolean;
    /**
     * Keeps the file on the device under `name`: `Download/DoU` on Android, the export sheet on iOS
     * (`saved: false` when it was dismissed). On Android API 24–28 the storage permission must already
     * be granted.
     */
    saveFile(uri: string, name: string): Promise<OnSaveFilePayload>;
}

const hasMethod = (name: string): boolean => typeof MediaExport?.[name] === 'function';

const unavailable = (): Promise<never> => {
    const error = new Error('MediaExport native module is not available') as MediaExportError;
    error.code = 'INTERNAL';
    return Promise.reject(error);
};

export const MediaExportBridge: IMediaExportBridge = {
    saveToPhotoLibrary: uri => (MediaExport ? MediaExport.saveToPhotoLibrary(uri) : unavailable()),
    shareFile: (uri, title) => (MediaExport ? MediaExport.shareFile(uri, title ?? null) : unavailable()),
    canOpenFile: hasMethod('openFile'),
    openFile: uri => (hasMethod('openFile') ? MediaExport.openFile(uri) : unavailable()),
    canSaveFile: hasMethod('saveFile'),
    saveFile: (uri, name) => (hasMethod('saveFile') ? MediaExport.saveFile(uri, name) : unavailable()),
};
