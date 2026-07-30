export interface StorageAdapter {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

const noopAdapter: StorageAdapter = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

let _adapter: StorageAdapter = typeof sessionStorage !== 'undefined' ? sessionStorage : noopAdapter;

export const setStorageAdapter = (adapter: StorageAdapter): void => {
    _adapter = adapter;
};

export const storage = {
    get: (key: string): string | null => _adapter.getItem(key),
    set: (key: string, value: string): void => _adapter.setItem(key, value),
    remove: (key: string): void => _adapter.removeItem(key),
};
