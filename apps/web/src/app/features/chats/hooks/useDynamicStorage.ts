import { useMemo } from 'react';

import type { ChatStorageAdapter } from '../storages/ChatStorageAdapter';
import { IndexedDBStorageAdapter } from '../storages/IndexedDBStorageAdapter';

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

export const useDynamicStorage = (): ChatStorageAdapter => {
    return useMemo(() => {
        if (isReactNativeWebView()) {
            // TODO: ReactNativeStorageAdapter 구현 후 교체
            return IndexedDBStorageAdapter;
        }
        return IndexedDBStorageAdapter;
    }, []);
};
