export interface StorageAdapter {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

let _adapter: StorageAdapter = sessionStorage;

export const setStorageAdapter = (adapter: StorageAdapter): void => {
    _adapter = adapter;
};

export const coreStorage = {
    get: (key: string): string | null => _adapter.getItem(key),
    set: (key: string, value: string): void => _adapter.setItem(key, value),
    remove: (key: string): void => _adapter.removeItem(key),
};
