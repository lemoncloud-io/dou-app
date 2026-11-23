import { NativeModules } from 'react-native';

import { logger } from '@chatic/logger';

const { FileManager } = NativeModules;

if (!FileManager) {
    console.warn('FileManager native module is not registered. Please ensure native side is compiled and registered.');
}

export interface IFileManagerBridge {
    DocumentDirectoryPath: string;
    TransferTempPath: string;
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string>;
    unlink(path: string): Promise<boolean>;
    downloadFile(url: string, toPath: string): Promise<string>;
    createDummyFile(path: string, sizeInBytes: number): Promise<string>;
    writeTempFile(base64: string, fileName?: string): Promise<string>;
}

export const safeHost = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return 'unparsable';
    }
};

export const FileManagerBridge: IFileManagerBridge = {
    DocumentDirectoryPath: FileManager?.DocumentDirectoryPath ?? '',
    TransferTempPath: FileManager?.TransferTempPath ?? '',

    exists: async (path: string): Promise<boolean> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.exists(path);
    },

    readFile: async (path: string): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        try {
            return await FileManager.readFile(path);
        } catch (error) {
            logger.error('FILE', 'Failed to read file', { error, data: { path } });
            throw error;
        }
    },

    unlink: async (path: string): Promise<boolean> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        try {
            return await FileManager.unlink(path);
        } catch (error) {
            logger.error('FILE', 'Failed to delete file', { error, data: { path } });
            throw error;
        }
    },

    downloadFile: async (url: string, toPath: string): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        try {
            return await FileManager.downloadFile(url, toPath);
        } catch (error) {
            logger.error('FILE', 'Failed to download file', {
                error,
                data: { host: safeHost(url), toPath },
            });
            throw error;
        }
    },

    createDummyFile: async (path: string, sizeInBytes: number): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.createDummyFile(path, sizeInBytes);
    },

    writeTempFile: async (base64: string, fileName?: string): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        try {
            return await FileManager.writeTempFile(base64, fileName ?? null);
        } catch (error) {
            logger.error('FILE', 'Failed to write temp file', { error, data: { fileName, length: base64.length } });
            throw error;
        }
    },
};
