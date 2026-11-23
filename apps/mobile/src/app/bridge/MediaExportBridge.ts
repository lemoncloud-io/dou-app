import { NativeModules } from 'react-native';
import type {
    MediaExportErrorCode,
    MediaExportMediaType,
    OnOpenFilePayload,
    OnSaveFilePayload,
    OnShareFilePayload,
} from '@chatic/bridge-messages';

const { MediaExport } = NativeModules;

export interface MediaExportError extends Error {
    code: MediaExportErrorCode;
}

export interface IMediaExportBridge {
    saveToPhotoLibrary(uri: string): Promise<{ mimeType: MediaExportMediaType }>;
    shareFile(uri: string, title?: string): Promise<OnShareFilePayload>;
    readonly canOpenFile: boolean;
    openFile(uri: string): Promise<OnOpenFilePayload>;
    readonly canSaveFile: boolean;
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
