import { createNativeDBAdapter } from './nativeDBAdapter';
import { createIndexedDBAdapter } from './indexedDBAdapter';
import type { CacheType, CacheModelMap } from '@chatic/app-messages';

export interface CacheStorage<TType extends CacheType> {
    save(id: string, item: CacheModelMap[TType]): Promise<CacheModelMap[TType]>;
    saveAll(items: CacheModelMap[TType][]): Promise<CacheModelMap[TType][]>;
    load(id: string): Promise<CacheModelMap[TType] | null>;
    loadAll(): Promise<CacheModelMap[TType][]>;
    delete(id: string): Promise<void>;
    deleteAll(ids: string[]): Promise<void>;
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

export const createStorageAdapter = <TType extends CacheType>(type: TType, cid: string): CacheStorage<TType> => {
    return isNativeApp() ? createNativeDBAdapter(type, cid) : createIndexedDBAdapter(type, cid);
};
