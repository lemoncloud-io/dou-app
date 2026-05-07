import { createIndexedDBAdapter } from './indexDBAdpater';
import { createNativeDBAdapter } from './nativeDBAdapter';
import type { CacheStorage } from '../cacheStorage';
import type { CacheType } from '@chatic/app-messages';

/**
 * @deprecated
 */
export const isNativeApp = (): boolean => {
    return typeof window !== 'undefined' && window.ReactNativeWebView !== undefined;
};

/**
 * @deprecated
 */
export const createStorageAdapter = <TType extends CacheType>(type: TType, cid: string): CacheStorage<TType> => {
    return isNativeApp() ? createNativeDBAdapter(type, cid) : createIndexedDBAdapter(type, cid);
};
