import type { StoragePort } from '@chatic/ports';

export type KeyValueStore = StoragePort['device'];

export const memoryStore = (): KeyValueStore => {
    const values = new Map<string, string>();
    return {
        get: key => values.get(key) ?? null,
        set: (key, value) => {
            values.set(key, value);
        },
        remove: key => {
            values.delete(key);
        },
        clear: () => {
            values.clear();
        },
        keys: () => [...values.keys()],
    };
};

export const memoryStoragePorts = (): StoragePort => ({
    secret: memoryStore(),
    plain: memoryStore(),
    device: memoryStore(),
});
