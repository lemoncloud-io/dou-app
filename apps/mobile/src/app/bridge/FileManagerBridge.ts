import { NativeModules } from 'react-native';

// The shared logging core, not the app's `services` barrel: `services` already imports from this
// `bridge` directory (NotificationService → BadgeSyncBridge), so importing it back would close a
// cycle. Both names resolve to the same process-wide singleton anyway.
import { logger } from '@chatic/logger';

const { FileManager } = NativeModules;

if (!FileManager) {
    console.warn('FileManager native module is not registered. Please ensure native side is compiled and registered.');
}

export interface IFileManagerBridge {
    DocumentDirectoryPath: string;
    exists(path: string): Promise<boolean>;
    readChunk(path: string, length: number, offset: number): Promise<string>;
    readFile(path: string): Promise<string>;
    unlink(path: string): Promise<boolean>;
    downloadFile(url: string, toPath: string): Promise<string>;
    createDummyFile(path: string, sizeInBytes: number): Promise<string>;
    /** Writes base64 bytes to a file in the shell's temporary directory and resolves its `file://` URI. */
    writeTempFile(base64: string, fileName?: string): Promise<string>;
}

/** Origin only — a download or transfer URL's query string can hold a signed credential. */
export const safeHost = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return 'unparsable';
    }
};

export const FileManagerBridge: IFileManagerBridge = {
    DocumentDirectoryPath: FileManager?.DocumentDirectoryPath ?? '',

    exists: async (path: string): Promise<boolean> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.exists(path);
    },

    readChunk: async (path: string, length: number, offset: number): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.readChunk(path, length, offset);
    },

    /**
     * The three terminal file operations log their failures (ADR-0099). `exists` and `readChunk`
     * deliberately do not: the first is a probe whose negative answer is information rather than a
     * fault, and the second runs once per chunk of an upload — a hot path the catalog's volume rules
     * keep out of the log.
     *
     * Paths are recorded; they are app-private locations, not user content.
     */
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
            // A file that cannot be deleted accumulates — repeated failures are a storage leak.
            logger.error('FILE', 'Failed to delete file', { error, data: { path } });
            throw error;
        }
    },

    downloadFile: async (url: string, toPath: string): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        try {
            return await FileManager.downloadFile(url, toPath);
        } catch (error) {
            // The URL can carry a signed query, so only its origin and path are recorded.
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
            // A failed write means the bytes never reach a transfer, so the upload silently has nothing to send.
            logger.error('FILE', 'Failed to write temp file', { error, data: { fileName, length: base64.length } });
            throw error;
        }
    },
};
