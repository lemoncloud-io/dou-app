import { NativeModules } from 'react-native';
import type { MediaExportErrorCode, MediaExportImageType, OnShareFilePayload } from '@chatic/app-messages';

/**
 * MediaExport — the native module that puts a downloaded file on an OS surface (Kotlin
 * `MediaExportModule`, Swift `MediaExport`).
 *
 * Both calls take the `file://` URI a download's terminal event carries. The native side accepts only
 * files inside its own download folder and only images it recognises by their bytes, so a caller
 * cannot use it to export any other file of the app.
 */
const { MediaExport } = NativeModules;

/** A rejected native call carries one of the media export codes in `code`, ready for the reply envelope. */
export interface MediaExportError extends Error {
    code: MediaExportErrorCode;
}

export interface IMediaExportBridge {
    /**
     * Adds the image to the photo library (iOS) or `Pictures/DoU` (Android), then deletes the
     * shell's copy. On iOS the add-only permission prompt is shown here the first time; on Android
     * API 24–28 the storage permission must already be granted.
     */
    saveToPhotoLibrary(uri: string): Promise<{ mimeType: MediaExportImageType }>;
    /**
     * Shows the share sheet with the file. Resolves on iOS when the sheet closes and on Android as
     * soon as it is shown (`completed: null`).
     */
    shareFile(uri: string, title?: string): Promise<OnShareFilePayload>;
}

const unavailable = (): Promise<never> => {
    const error = new Error('MediaExport native module is not available') as MediaExportError;
    error.code = 'INTERNAL';
    return Promise.reject(error);
};

export const MediaExportBridge: IMediaExportBridge = {
    saveToPhotoLibrary: uri => (MediaExport ? MediaExport.saveToPhotoLibrary(uri) : unavailable()),
    shareFile: (uri, title) => (MediaExport ? MediaExport.shareFile(uri, title ?? null) : unavailable()),
};
