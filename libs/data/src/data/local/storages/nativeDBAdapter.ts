import type { AppMessage, AppMessageType, CacheModelMap, CacheType, WebMessage } from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from './cacheStorage';
import { type AdapterScope, isModelExpired, resolveScopedContext, withCacheMeta } from './utils';

const generateNonce = (): string => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
    type Scope = AdapterScope;

    const post = (message: WebMessage): void => sendMessage(message);

    const postAndWait = async <T extends AppMessageType>(
        request: WebMessage,
        responseType: T,
        nonce: string
    ): Promise<Extract<AppMessage, { type: T }>> => {
        post(request);
        return waitForAppMessage(responseType, message => message.nonce === nonce);
    };

    const buildQuery = (scope: Scope) => ({ cid: scope.cid, uid: scope.uid });

    const removeExpiredItem = async (scope: Scope, id: string): Promise<void> => {
        const nonce = generateNonce();
        await postAndWait(
            {
                type: 'DeleteCacheData',
                nonce,
                data: { type, cid: scope.cid, uid: scope.uid, id },
            } as WebMessage,
            'OnDeleteCacheData',
            nonce
        );
    };

    const removeExpiredItems = async (scope: Scope, ids: string[]): Promise<void> => {
        if (ids.length === 0) return;
        const nonce = generateNonce();
        await postAndWait(
            {
                type: 'DeleteAllCacheData',
                nonce,
                data: { type, cid: scope.cid, uid: scope.uid, ids },
            } as WebMessage,
            'OnDeleteAllCacheData',
            nonce
        );
    };

    return {
        save: async (id: string, item: Model): Promise<Model> => {
            const nonce = generateNonce();
            const scope = resolveScopedContext(type, contextProvider);
            await postAndWait(
                {
                    type: 'SaveCacheData',
                    nonce,
                    data: { type, cid: scope.cid, uid: scope.uid, id, item: withCacheMeta(type, item) },
                } as WebMessage,
                'OnSaveCacheData',
                nonce
            );
            return item;
        },

        saveAll: async (items: Model[]): Promise<Model[]> => {
            if (items.length === 0) return [];

            const nonce = generateNonce();
            const scope = resolveScopedContext(type, contextProvider);
            await postAndWait(
                {
                    type: 'SaveAllCacheData',
                    nonce,
                    data: { type, cid: scope.cid, uid: scope.uid, items: items.map(item => withCacheMeta(type, item)) },
                } as WebMessage,
                'OnSaveAllCacheData',
                nonce
            );
            return items;
        },

        load: async (id: string): Promise<Model | null> => {
            const nonce = generateNonce();
            const scope = resolveScopedContext(type, contextProvider);
            const response = await postAndWait(
                {
                    type: 'FetchCacheData',
                    nonce,
                    data: { type, cid: scope.cid, uid: scope.uid, id },
                } as WebMessage,
                'OnFetchCacheData',
                nonce
            );
            const rawItem = (response.data.item as Model) || null;
            if (!rawItem) return null;
            if (isModelExpired(rawItem)) {
                await removeExpiredItem(scope, id);
                return null;
            }
            return rawItem;
        },

        loadAll: async (): Promise<Model[]> => {
            const nonce = generateNonce();
            const scope = resolveScopedContext(type, contextProvider);
            const response = await postAndWait(
                {
                    type: 'FetchAllCacheData',
                    nonce,
                    data: { type, cid: scope.cid, uid: scope.uid, query: buildQuery(scope) },
                } as WebMessage,
                'OnFetchAllCacheData',
                nonce
            );
            const items = ((response.data.items as Model[]) || []).filter(Boolean);
            const expiredIds = items
                .filter(isModelExpired)
                .map(item => (item as { id?: string }).id)
                .filter((id): id is string => !!id);
            await removeExpiredItems(scope, expiredIds);

            return items.filter(item => !isModelExpired(item)).map(item => item);
        },

        async replaceAll(items: Model[]): Promise<Model[]> {
            const scope = resolveScopedContext(type, contextProvider);

            const fetchNonce = generateNonce();
            const fetched = await postAndWait(
                {
                    type: 'FetchAllCacheData',
                    nonce: fetchNonce,
                    data: { type, cid: scope.cid, uid: scope.uid, query: buildQuery(scope) },
                } as WebMessage,
                'OnFetchAllCacheData',
                fetchNonce
            );
            const existingIds = ((fetched.data.items || []) as Array<{ id?: string | null }>)
                .map(item => item?.id)
                .filter((id): id is string => !!id);

            await removeExpiredItems(scope, existingIds);

            if (items.length > 0) {
                const saveNonce = generateNonce();
                await postAndWait(
                    {
                        type: 'SaveAllCacheData',
                        nonce: saveNonce,
                        data: {
                            type,
                            cid: scope.cid,
                            uid: scope.uid,
                            items: items.map(item => withCacheMeta(type, item)),
                        },
                    } as WebMessage,
                    'OnSaveAllCacheData',
                    saveNonce
                );
            }

            return items;
        },

        delete: async (id: string): Promise<void> => {
            await removeExpiredItem(resolveScopedContext(type, contextProvider), id);
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            await removeExpiredItems(resolveScopedContext(type, contextProvider), ids);
        },

        clearAll: async (): Promise<void> => {
            const nonce = generateNonce();
            const scope = resolveScopedContext(type, contextProvider);
            await postAndWait(
                {
                    type: 'ClearCacheData',
                    nonce,
                    data: { type, cid: scope.cid, uid: scope.uid },
                } as WebMessage,
                'OnClearCacheData',
                nonce
            );
        },
    };
};
