import type { AppMessage, AppMessageType, CacheType } from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { CacheStorage } from './cacheStorage';

const generateNonce = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

/**
 * 네이티브 앱(App)으로부터 특정 타입의 메시지가 도착할 때까지 대기합니다.
 *
 * @param type 대기할 메시지 타입 (예: 'OnSaveCacheData')
 * @param predicate 특정 조건(예: nonce 일치 여부)을 검사하는 필터 함수
 * @param timeout 타임아웃 밀리초 (기본값 5초)
 * @returns 조건에 맞는 메시지 객체를 반환하는 Promise
 */
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

/**
 * @param type 저장소 도메인 타입 (예: 'chat', 'channel')
 * @param cid 특정 도메인에서 요구하는 고유 식별자 (Optional)
 */
export const createNativeDBAdapter = <T>(type: CacheType, cid: string): CacheStorage<T> => {
    return {
        save: async (id: string, item: T): Promise<void> => {
            const nonce = generateNonce();
            postMessage({
                type: 'SaveCacheData',
                nonce,
                data: { type, id, item: item as any, cid } as any,
            });
            await waitForAppMessage('OnSaveCacheData', m => m.nonce === nonce);
        },

        saveAll: async (items: T[]): Promise<void> => {
            if (items.length === 0) return;
            const nonce = generateNonce();
            postMessage({
                type: 'SaveAllCacheData',
                nonce,
                data: { type, items: items as any[], cid } as any,
            });
            await waitForAppMessage('OnSaveAllCacheData', m => m.nonce === nonce);
        },

        load: async (id: string): Promise<T | null> => {
            const nonce = generateNonce();
            postMessage({
                type: 'FetchCacheData',
                nonce,
                data: { type, id, cid } as any,
            });
            const response = await waitForAppMessage('OnFetchCacheData', m => m.nonce === nonce);
            return (response.data.item as T) || null;
        },

        loadAll: async (query?: any): Promise<T[]> => {
            const nonce = generateNonce();
            postMessage({
                type: 'FetchAllCacheData',
                nonce,
                data: { type, query: { ...query, cid } } as any,
            });
            const response = await waitForAppMessage('OnFetchAllCacheData', m => m.nonce === nonce);
            return (response.data.items as T[]) || [];
        },

        delete: async (id: string): Promise<void> => {
            const nonce = generateNonce();
            postMessage({
                type: 'DeleteCacheData',
                nonce,
                data: { type, id, cid } as any,
            });
            await waitForAppMessage('OnDeleteCacheData', m => m.nonce === nonce);
        },

        replaceAll: async (items: T[]): Promise<void> => {
            const nonce = generateNonce();
            postMessage({
                type: 'FetchAllCacheData',
                nonce,
                data: { type, query: { cid } } as any,
            });
            const response = await waitForAppMessage('OnFetchAllCacheData', m => m.nonce === nonce);
            const existing = (response.data.items as any[]) || [];
            const existingIds = existing.map((item: any) => item.id).filter(Boolean);
            if (existingIds.length > 0) {
                const deleteNonce = generateNonce();
                postMessage({
                    type: 'DeleteAllCacheData',
                    nonce: deleteNonce,
                    data: { type, ids: existingIds, cid } as any,
                });
                await waitForAppMessage('OnDeleteAllCacheData', m => m.nonce === deleteNonce);
            }
            if (items.length > 0) {
                const saveNonce = generateNonce();
                postMessage({
                    type: 'SaveAllCacheData',
                    nonce: saveNonce,
                    data: { type, items: items as any[], cid } as any,
                });
                await waitForAppMessage('OnSaveAllCacheData', m => m.nonce === saveNonce);
            }
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            const nonce = generateNonce();
            postMessage({
                type: 'DeleteAllCacheData',
                nonce,
                data: { type, ids, cid } as any,
            });
            await waitForAppMessage('OnDeleteAllCacheData', m => m.nonce === nonce);
        },
    };
};
