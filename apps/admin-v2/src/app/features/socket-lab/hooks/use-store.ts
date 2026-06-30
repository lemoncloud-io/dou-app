/**
 * `hooks/use-store.ts`
 * - Store<T> → React. getSnapshot은 version()(primitive)을 반환해 식별 안정화(Map 레퍼런스 문제 회피).
 */
import { useSyncExternalStore } from 'react';
import type { Store } from '../store/store';

export const useStore = <T>(store: Store<T>): ReadonlyMap<string, T> => {
    useSyncExternalStore(store.subscribe, store.version, store.version);
    return store.readAll();
};
