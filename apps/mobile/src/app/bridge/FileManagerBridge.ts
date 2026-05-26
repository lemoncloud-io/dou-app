import { NativeModules } from 'react-native';

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
}

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

    readFile: async (path: string): Promise<string> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.readFile(path);
    },

    unlink: async (path: string): Promise<boolean> => {
        if (!FileManager) throw new Error('FileManager native module is not available');
        return FileManager.unlink(path);
    },
};
