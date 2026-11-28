import type { KeyValueStore } from '@chatic/storage-compose';

import type { ISecureStorageService } from './types';

export type { KeyValueStore };

export const keychainStore = async (
    vault: Pick<ISecureStorageService, 'get' | 'save' | 'clear'>
): Promise<KeyValueStore> => {
    const snapshot = await vault.get();
    if (snapshot.status !== 'available') throw new Error(`keychain vault unavailable: ${snapshot.reason}`);
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
