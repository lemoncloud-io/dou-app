import { createMMKV } from 'react-native-mmkv';

import { SubWebViewStorage, subWebViewStorageId } from './subWebViewStorage';

const opened = new Map<string, SubWebViewStorage>();

export const openSubWebViewStorage = (origin: string): SubWebViewStorage | null => {
    const known = opened.get(origin);
    if (known) return known;
    try {
        const storage = new SubWebViewStorage(createMMKV({ id: subWebViewStorageId(origin) }));
        opened.set(origin, storage);
        return storage;
    } catch {
        return null;
    }
};
