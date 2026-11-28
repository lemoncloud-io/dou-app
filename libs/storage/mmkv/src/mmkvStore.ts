import type { KeyValueStore } from '@chatic/storage-compose';

export type { KeyValueStore };

export interface MmkvFile {
    getString(key: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): unknown;
    clearAll(): void;
    getAllKeys(): string[];
}

export const mmkvStore = (file: MmkvFile): KeyValueStore => ({
    get: key => file.getString(key) ?? null,
    set: (key, value) => file.set(key, value),
    remove: key => {
        file.remove(key);
    },
    clear: () => file.clearAll(),
    keys: () => file.getAllKeys(),
});
