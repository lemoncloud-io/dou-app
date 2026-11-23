import type { StorageFile } from './subWebViewStorage';

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
