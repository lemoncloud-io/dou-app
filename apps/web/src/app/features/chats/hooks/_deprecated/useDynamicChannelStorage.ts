import { useMemo } from 'react';

import type { ChannelStorageAdapter } from '../../storages/ChannelStorageAdapter';
import { IndexedDBChannelAdapter } from '../../storages/IndexedDBChannelAdapter';
import { NativeDBChannelAdapter } from '../../storages/NativeDBChannelAdapter';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
const isReactNativeWebView = (): boolean => !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useDynamicChannelStorage = (): ChannelStorageAdapter => {
    return useMemo(() => {
        if (isReactNativeWebView()) {
            return NativeDBChannelAdapter;
        }
        return IndexedDBChannelAdapter;
    }, []);
};
