import { useMemo } from 'react';

import type { ChatStorageAdapter } from '../../storages/ChatStorageAdapter';
import { IndexedDBStorageAdapter } from '../../storages/IndexedDBStorageAdapter';
import { NativeDBStorageAdapter } from '../../storages/NativeDBStorageAdapter';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useDynamicStorage = (): ChatStorageAdapter => {
    return useMemo(() => {
        if (isReactNativeWebView()) {
            return NativeDBStorageAdapter;
        }
        return IndexedDBStorageAdapter;
    }, []);
};
