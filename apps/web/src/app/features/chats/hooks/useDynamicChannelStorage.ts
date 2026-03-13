import { useMemo } from 'react';

import type { ChannelStorageAdapter } from '../storages/ChannelStorageAdapter';
import { IndexedDBChannelAdapter } from '../storages/IndexedDBChannelAdapter';
import { NativeDBChannelAdapter } from '../storages/NativeDBChannelAdapter';

const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

export const useDynamicChannelStorage = (): ChannelStorageAdapter => {
    return useMemo(() => {
        if (isReactNativeWebView()) {
            return NativeDBChannelAdapter;
        }
        return IndexedDBChannelAdapter;
    }, []);
};
