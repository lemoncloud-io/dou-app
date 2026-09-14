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
    startBackgroundTask(uploadId: string, fileName: string, progress: number): Promise<void>;
    endBackgroundTask(uploadId: string): Promise<void>;
    createDummyFile(path: string, sizeInBytes: number): Promise<string>;
}

/** Origin only — a download URL's query string can hold a signed credential. */
const safeHost = (url: string): string => {
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
     * The three terminal file operations log their failures (ADR-0075). `exists` and `readChunk`
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

    startBackgroundTask: async (uploadId: string, fileName: string, progress: number): Promise<void> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.startBackgroundTask(uploadId, fileName, progress);
    },

    endBackgroundTask: async (uploadId: string): Promise<void> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.endBackgroundTask(uploadId);
    },

    createDummyFile: async (path: string, sizeInBytes: number): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.createDummyFile(path, sizeInBytes);
    },
};
