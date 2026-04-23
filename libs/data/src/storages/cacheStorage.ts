import { createNativeDBAdapter } from './nativeDBAdapter';
import { createIndexedDBAdapter } from './indexedDBAdapter';
import type { CacheType } from '@chatic/app-messages';

export interface CacheStorage<T> {
    save(id: string, item: T): Promise<void>;
    saveAll(items: T[]): Promise<void>;
    replaceAll(items: T[]): Promise<void>;
    load(id: string): Promise<T | null>;
    loadAll(query?: any): Promise<T[]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
    clearAll(): Promise<void>;
}

export interface CacheSchema<T> {
    key: string;
    type: string;
    cid: string;
    id: string;
    data: T;
}

export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && window.ReactNativeWebView !== undefined;
};

export const createStorageAdapter = <T extends { id?: string }>(type: CacheType, cid: string): CacheStorage<T> => {
    return isNativeApp() ? createNativeDBAdapter<T>(type, cid) : createIndexedDBAdapter<T>(type, cid);
};
