import type { AppMessage, AppMessageType, CacheModelMap, CacheType, WebMessage } from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from './cacheStorage';

const generateNonce = (): string => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const getScopeCid = (contextProvider: DataContextProvider): string => {
    return contextProvider.getContext().cid || 'default';
};

const waitForAppMessage = <T extends AppMessageType>(
    type: T,
    predicate: (msg: Extract<AppMessage, { type: T }>) => boolean,
    timeout = 5000
): Promise<Extract<AppMessage, { type: T }>> =>
    new Promise((resolve, reject) => {
        const handler = (msg: Extract<AppMessage, { type: T }>) => {
            if (!predicate(msg)) return;
            clearTimeout(timer);
            useAppMessageStore.getState().removeHandler(type, handler);
            resolve(msg);
        };

        const timer = setTimeout(() => {
            useAppMessageStore.getState().removeHandler(type, handler);
            reject(new Error(`Timeout waiting for app message: ${type}`));
        }, timeout);

        useAppMessageStore.getState().addHandler(type, handler);
    });

const sendMessage = (message: WebMessage): void => {
    postMessage(message);
};

export const createNativeDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];

    return {
        save: async (id: string, item: Model): Promise<Model> => {
            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'SaveCacheData',
                nonce,
                data: { type, cid, id, item },
            } as WebMessage);

            await waitForAppMessage('OnSaveCacheData', message => message.nonce === nonce);
            return item;
        },

        saveAll: async (items: Model[]): Promise<Model[]> => {
            if (items.length === 0) return [];

            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'SaveAllCacheData',
                nonce,
                data: { type, cid, items },
            } as WebMessage);

            await waitForAppMessage('OnSaveAllCacheData', message => message.nonce === nonce);
            return items;
        },

        load: async (id: string): Promise<Model | null> => {
            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'FetchCacheData',
                nonce,
                data: { type, cid, id },
            } as WebMessage);

            const response = await waitForAppMessage('OnFetchCacheData', message => message.nonce === nonce);
            return (response.data.item as Model) || null;
        },

        loadAll: async (): Promise<Model[]> => {
            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'FetchAllCacheData',
                nonce,
                data: { type, cid, query: { cid } },
            } as WebMessage);

            const response = await waitForAppMessage('OnFetchAllCacheData', message => message.nonce === nonce);
            return (response.data.items as Model[]) || [];
        },

        async replaceAll(items: Model[]): Promise<Model[]> {
            const cid = getScopeCid(contextProvider);

            const fetchNonce = generateNonce();
            sendMessage({
                type: 'FetchAllCacheData',
                nonce: fetchNonce,
                data: { type, cid, query: { cid } },
            } as WebMessage);
            const fetched = await waitForAppMessage('OnFetchAllCacheData', message => message.nonce === fetchNonce);
            const existingIds = ((fetched.data.items || []) as Array<{ id?: string | null }>)
                .map(item => item?.id)
                .filter((id): id is string => !!id);

            if (existingIds.length > 0) {
                const deleteNonce = generateNonce();
                sendMessage({
                    type: 'DeleteAllCacheData',
                    nonce: deleteNonce,
                    data: { type, cid, ids: existingIds },
                } as WebMessage);
                await waitForAppMessage('OnDeleteAllCacheData', message => message.nonce === deleteNonce);
            }

            if (items.length > 0) {
                const saveNonce = generateNonce();
                sendMessage({
                    type: 'SaveAllCacheData',
                    nonce: saveNonce,
                    data: { type, cid, items },
                } as WebMessage);
                await waitForAppMessage('OnSaveAllCacheData', message => message.nonce === saveNonce);
            }

            return items;
        },

        delete: async (id: string): Promise<void> => {
            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'DeleteCacheData',
                nonce,
                data: { type, cid, id },
            } as WebMessage);

            await waitForAppMessage('OnDeleteCacheData', message => message.nonce === nonce);
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;

            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'DeleteAllCacheData',
                nonce,
                data: { type, cid, ids },
            } as WebMessage);

            await waitForAppMessage('OnDeleteAllCacheData', message => message.nonce === nonce);
        },

        clearAll: async (): Promise<void> => {
            const nonce = generateNonce();
            const cid = getScopeCid(contextProvider);
            sendMessage({
                type: 'ClearCacheData',
                nonce,
                data: { type, cid },
            } as WebMessage);

            await waitForAppMessage('OnClearCacheData', message => message.nonce === nonce);
        },
    };
};
