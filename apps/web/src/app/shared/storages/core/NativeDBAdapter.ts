import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { AppMessage, AppMessageType, CacheType } from '@chatic/app-messages';
import type { StorageAdapter } from './StorageAdapter';

const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const waitForAppMessage = <T extends AppMessageType>(
    type: T,
    predicate: (msg: Extract<AppMessage, { type: T }>) => boolean,
    timeout = 5000
): Promise<Extract<AppMessage, { type: T }>> =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            useAppMessageStore.getState().removeHandler(type, handler);
            reject(new Error(`Timeout waiting for app message: ${type}`));
        }, timeout);

        const handler = (msg: Extract<AppMessage, { type: T }>) => {
            if (!predicate(msg)) return;
            clearTimeout(timer);
            useAppMessageStore.getState().removeHandler(type, handler);
            resolve(msg);
        };
        useAppMessageStore.getState().addHandler(type, handler);
    });

export const createNativeDBAdapter = <T>(type: CacheType): StorageAdapter<T> => {
    return {
        save: async (id: string, item: T): Promise<void> => {
            const nonce = generateNonce();
            postMessage({
                type: 'SaveCacheData',
                nonce,
                data: { type, id, item: item as any },
            });
            await waitForAppMessage('OnSaveCacheData', m => m.nonce === nonce);
        },

        saveAll: async (items: T[]): Promise<void> => {
            if (items.length === 0) return;
            const nonce = generateNonce();
            postMessage({
                type: 'SaveAllCacheData',
                nonce,
                data: { type, items: items as any[] },
            });
            await waitForAppMessage('OnSaveAllCacheData', m => m.nonce === nonce);
        },

        load: async (id: string): Promise<T | null> => {
            const nonce = generateNonce();
            postMessage({
                type: 'FetchCacheData',
                nonce,
                data: { type, id },
            });
            const response = await waitForAppMessage('OnFetchCacheData', m => m.nonce === nonce);
            return (response.data.item as T) || null;
        },

        loadAll: async (query?: any): Promise<T[]> => {
            const nonce = generateNonce();
            postMessage({
                type: 'FetchAllCacheData',
                nonce,
                data: { type, query },
            });
            const response = await waitForAppMessage('OnFetchAllCacheData', m => m.nonce === nonce);
            return (response.data.items as T[]) || [];
        },

        delete: async (id: string): Promise<void> => {
            const nonce = generateNonce();
            postMessage({
                type: 'DeleteCacheData',
                nonce,
                data: { type, id },
            });
            await waitForAppMessage('OnDeleteCacheData', m => m.nonce === nonce);
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            const nonce = generateNonce();
            postMessage({
                type: 'DeleteAllCacheData',
                nonce,
                data: { type, ids },
            });
            await waitForAppMessage('OnDeleteAllCacheData', m => m.nonce === nonce);
        },
    };
};
