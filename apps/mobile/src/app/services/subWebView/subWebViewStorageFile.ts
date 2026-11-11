import { createMMKV } from 'react-native-mmkv';

import { SubWebViewStorage, subWebViewStorageId } from './subWebViewStorage';

/** One storage per origin for the run of the app, so its usage count is one too. */
const opened = new Map<string, SubWebViewStorage>();

/**
 * `origin`'s storage, in an MMKV file of its own; `null` when the file cannot be opened, so the page
 * gets `UNAVAILABLE` rather than the view failing. Opened on a page's first storage request, not when
 * the view opens: a page that never stores leaves no file behind. Kept, not reopened, because every
 * MMKV instance registers a memory-warning listener that, on an engine without
 * `FinalizationRegistry`, is never removed.
 *
 * Kept apart from `subWebViewStorage.ts` so the logic and its tests never load the native module. Not
 * through the shared `MmkvStorage`, which wraps the app's default file: a page's data needs a file of
 * its own, which the app's `clearAll` never reaches.
 */
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
