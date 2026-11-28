import type { KeyValueStore } from '@chatic/storage-compose';

import type { ISecureStorage } from './types';

export type { KeyValueStore };

export const safeStorageStore = async (
    vault: Pick<ISecureStorage, 'get' | 'save' | 'clear'>
): Promise<KeyValueStore> => {
    const snapshot = await vault.get();
    const values = new Map(Object.entries(snapshot.values));
    return {
        get: key => values.get(key) ?? null,
        set: (key, value) => {
            values.set(key, value);
            void vault.save({ [key]: value }, []);
        },
        remove: key => {
            if (!values.delete(key)) return;
            void vault.save({}, [key]);
        },
        clear: () => {
            values.clear();
            void vault.clear();
        },
        keys: () => [...values.keys()],
    };
};
