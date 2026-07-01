/**
 * `hooks/use-store.ts`
 */
import { useSyncExternalStore } from 'react';
import type { Store } from '../store/store';

export const useStore = <T>(store: Store<T>): ReadonlyMap<string, T> => {
    useSyncExternalStore(store.subscribe, store.version, store.version);
    return store.readAll();
};
