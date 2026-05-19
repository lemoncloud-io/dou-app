import type { IWebBridgeClient } from '@chatic/bridges';
import type { CacheModelMap, CacheQueryMap, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from './cacheStorage';
import { type AdapterScope, resolveScopedContext, withCacheMeta } from './utils';

/**
 * 네이티브 데이터베이스(앱 내장 DB)와 통신하여 데이터를 캐싱하는 어댑터를 생성합니다.
 * 이 어댑터는 WebBridgeClient 인스턴스를 주입받아 실제 통신을 위임합니다.
 *
 * @param bridge - 통신을 담당할 WebBridgeClient 인스턴스.
 * @param type - 생성할 캐시 스토리지의 타입 (e.g., 'Channel').
 * @param contextProvider - 스코프(cid, uid)를 확인하기 위한 컨텍스트 프로바이더.
 */
export const createNativeDBAdapter = <TType extends CacheType>(
    bridge: IWebBridgeClient,
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];
    type Scope = AdapterScope;

    const buildQuery = (scope: Scope) => ({ cid: scope.cid, uid: scope.uid });

    return {
        save: async (id: string, item: Model): Promise<Model> => {
            const scope = resolveScopedContext(type, contextProvider);
            await bridge.request('SaveCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    id,
                    item: withCacheMeta(type, item),
                },
            } as any);
            return item;
        },

        saveAll: async (items: Model[]): Promise<Model[]> => {
            if (items.length === 0) return [];
            const scope = resolveScopedContext(type, contextProvider);
            await bridge.request('SaveAllCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    items: items.map(item => withCacheMeta(type, item)),
                },
            } as any);
            return items;
        },

        load: async (id: string): Promise<Model | null> => {
            const scope = resolveScopedContext(type, contextProvider);
            const response = await bridge.request('FetchCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    id,
                },
            } as any);

            // 괄호로 묶고 unknown을 거쳐서 안전하게 Model로 캐스팅합니다.
            const item = response?.data?.item;
            return item ? (item as unknown as Model) : null;
        },

        loadAll: async (options?: Partial<CacheQueryMap[TType]>): Promise<Model[]> => {
            const scope = resolveScopedContext(type, contextProvider);
            const query = { ...buildQuery(scope), ...options };
            const response = await bridge.request('FetchAllCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    query,
                },
            } as any);

            const items = response?.data?.items;
            return items ? (items as unknown as Model[]) : [];
        },

        delete: async (id: string): Promise<void> => {
            const scope = resolveScopedContext(type, contextProvider);
            await bridge.request('DeleteCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    id,
                },
            } as any);
        },

        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            const scope = resolveScopedContext(type, contextProvider);
            await bridge.request('DeleteAllCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                    ids,
                },
            } as any);
        },

        clearAll: async (): Promise<void> => {
            const scope = resolveScopedContext(type, contextProvider);
            await bridge.request('ClearCacheData', {
                data: {
                    type,
                    cid: scope.cid,
                    uid: scope.uid,
                },
            } as any);
        },
    };
};
