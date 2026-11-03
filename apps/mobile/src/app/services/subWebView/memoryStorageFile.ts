import type { StorageFile } from './subWebViewStorage';

/**
 * A storage file in memory, counting trims: the stand-in for an MMKV file in tests, where the native
 * module is not loaded. Not used at run time.
 */
export const memoryStorageFile = (): StorageFile & { trims: number } => {
    const data = new Map<string, string>();
    const file = {
        trims: 0,
        getString: (key: string) => data.get(key),
        set: (key: string, value: string) => void data.set(key, value),
        remove: (key: string) => data.delete(key),
        getAllKeys: () => [...data.keys()],
        clearAll: () => data.clear(),
        trim: () => void (file.trims += 1),
    };
    return file;
};
