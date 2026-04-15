import { useMemo } from 'react';

import type { ChatStorageAdapter } from '../storages/ChatStorageAdapter';
import { IndexedDBStorageAdapter } from '../storages/IndexedDBStorageAdapter';
import { NativeDBStorageAdapter } from '../storages/NativeDBStorageAdapter';

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

export const useDynamicStorage = (): ChatStorageAdapter => {
    return useMemo(() => {
        if (isReactNativeWebView()) {
            return NativeDBStorageAdapter;
        }
        return IndexedDBStorageAdapter;
    }, []);
};
