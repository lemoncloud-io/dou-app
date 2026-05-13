import type {
    AppMessage,
    AppMessageType,
    CacheModelMap,
    CacheQueryMap,
    CacheType,
    WebMessage,
} from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from './cacheStorage';
import { type AdapterScope, resolveScopedContext, withCacheMeta } from './utils';

type PendingRequest = {
    resolve: (msg: AppMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

const pendingRequests = new Map<string, PendingRequest>();
const DEFAULT_TIMEOUT = 5000;

/**
 * 네이티브로부터 오는 모든 'AppMessage'를 처리하는 중앙 핸들러.
 * 메시지에 포함된 nonce를 사용하여 대기 중인 요청을 찾아 Promise를 이행합니다.
 */
const handleIncomingMessages = (msg: AppMessage) => {
    if (!msg.nonce) return;

    const request = pendingRequests.get(msg.nonce);
    if (request) {
        clearTimeout(request.timer);
        request.resolve(msg);
        pendingRequests.delete(msg.nonce);
    }
};

// 앱이 시작될 때 모든 관련 메시지 타입에 대해 중앙 핸들러를 등록합니다.
const messageTypesToListen: AppMessageType[] = [
    'OnSaveCacheData',
    'OnSaveAllCacheData',
    'OnFetchCacheData',
    'OnFetchAllCacheData',
    'OnDeleteCacheData',
    'OnDeleteAllCacheData',
    'OnClearCacheData',
    'OnFetchPreference',
    'OnSavePreference',
    'OnDeletePreference',
    'OnFetchAppLogBuffer',
    'OnPollAppLogBuffer',
    'OnClearAppLogBuffer',
    'OnFetchAppLogBufferSize',
];

messageTypesToListen.forEach(type => {
    useAppMessageStore.getState().addHandler(type, handleIncomingMessages as any);
});

/**
 * 브릿지 통신 시 요청과 응답을 매핑하기 위한 고유 식별자(Nonce)를 생성합니다.
 */
export const generateNonce = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * 웹 환경에서 네이티브 앱으로 메시지를 전송하는 래퍼(Wrapper) 함수입니다.
 */
const sendMessage = (message: WebMessage): void => {
    postMessage(message);
};

/**
 * 네이티브로 요청(WebMessage)을 보내고, 동일한 Nonce를 가진 응답(AppMessage)이 올 때까지 대기합니다.
 * 중앙 집중식 핸들러를 사용하여 여러 요청을 동시에 관리합니다.
 */
const postAndWait = <T extends AppMessage>(request: WebMessage): Promise<T> => {
    const nonce = request.nonce;
    if (!nonce) {
        return Promise.reject(new Error('A nonce must be provided for requests that await a response.'));
    }

    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingRequests.delete(nonce);
            reject(new Error(`Timeout waiting for app message: ${request.type}`));
        }, DEFAULT_TIMEOUT);

        pendingRequests.set(nonce, {
            resolve: resolve as (msg: AppMessage) => void,
            reject,
            timer,
        });

        sendMessage(request);
    });
};

/**
 * 네이티브 데이터베이스(앱 내장 DB)와 통신하여 데이터를 캐싱하는 어댑터를 생성합니다.
 */
export const createNativeDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];
    type Scope = AdapterScope;

    /**
     * Fetch 요청 시 사용할 스코프 기반 쿼리 조건(cid, uid)을 생성합니다.
     */
    const buildQuery = (scope: Scope) => ({ cid: scope.cid, uid: scope.uid });

    /**
     * 특정 ID의 단일 데이터를 삭제하기 위해 네이티브 측에 DeleteCacheData 명령을 전송합니다.
     */
    const deleteItem = async (scope: Scope, id: string): Promise<void> => {
        await postAndWait({
            type: 'DeleteCacheData',
            nonce: generateNonce(),
            data: { type, cid: scope.cid, uid: scope.uid, id },
        } as WebMessage);
    };

    /**
     * 여러 ID의 데이터를 한 번에 삭제하기 위해 네이티브 측에 DeleteAllCacheData 명령을 전송합니다.
     */
    const deleteItems = async (scope: Scope, ids: string[]): Promise<void> => {
        if (ids.length === 0) return;
        await postAndWait({
            type: 'DeleteAllCacheData',
            nonce: generateNonce(),
            data: { type, cid: scope.cid, uid: scope.uid, ids },
        } as WebMessage);
    };

    /**
     * 특정 스코프(cid, uid)에 속하는 해당 타입의 모든 데이터를 초기화(Clear)합니다.
     */
    const clearScopedData = async (scope: Scope): Promise<void> => {
        await postAndWait({
            type: 'ClearCacheData',
            nonce: generateNonce(),
            data: { type, cid: scope.cid, uid: scope.uid },
        } as WebMessage);
    };

    return {
        /**
         * 단일 데이터를 네이티브 캐시에 저장합니다.
         */
        save: async (id: string, item: Model): Promise<Model> => {
            const scope = resolveScopedContext(type, contextProvider);
            await postAndWait({
                type: 'SaveCacheData',
                nonce: generateNonce(),
                data: { type, cid: scope.cid, uid: scope.uid, id, item: withCacheMeta(type, item) },
            } as WebMessage);
            return item;
        },

        /**
         * 다수의 데이터를 한 번에 네이티브 캐시에 저장합니다.
         */
        saveAll: async (items: Model[]): Promise<Model[]> => {
            if (items.length === 0) return [];
            const scope = resolveScopedContext(type, contextProvider);
            await postAndWait({
                type: 'SaveAllCacheData',
                nonce: generateNonce(),
                data: { type, cid: scope.cid, uid: scope.uid, items: items.map(item => withCacheMeta(type, item)) },
            } as WebMessage);
            return items;
        },

        /**
         * 특정 ID의 데이터를 네이티브 캐시에서 불러옵니다.
         */
        load: async (id: string): Promise<Model | null> => {
            const scope = resolveScopedContext(type, contextProvider);
            const response = await postAndWait<Extract<AppMessage, { type: 'OnFetchCacheData' }>>({
                type: 'FetchCacheData',
                nonce: generateNonce(),
                data: { type, cid: scope.cid, uid: scope.uid, id },
            } as WebMessage);

            const rawItem = (response.data.item as Model) || null;
            if (!rawItem) return null;
            return rawItem;
        },

        /**
         * 스코프에 해당하는 모든 데이터를 네이티브 캐시에서 불러옵니다.
         */
        loadAll: async (options?: Partial<CacheQueryMap[TType]>): Promise<Model[]> => {
            const scope = resolveScopedContext(type, contextProvider);
            const query = { ...buildQuery(scope), ...options };

            const response = await postAndWait<Extract<AppMessage, { type: 'OnFetchAllCacheData' }>>({
                type: 'FetchAllCacheData',
                nonce: generateNonce(),
                data: { type, cid: scope.cid, uid: scope.uid, query: query },
            } as WebMessage);
            return ((response.data.items as Model[]) || []).filter(Boolean);
        },

        /**
         * 특정 ID에 해당하는 데이터를 캐시에서 삭제합니다.
         */
        delete: async (id: string): Promise<void> => {
            await deleteItem(resolveScopedContext(type, contextProvider), id);
        },

        /**
         * 여러 ID에 해당하는 데이터를 캐시에서 일괄 삭제합니다.
         */
        deleteAll: async (ids: string[]): Promise<void> => {
            if (ids.length === 0) return;
            await deleteItems(resolveScopedContext(type, contextProvider), ids);
        },

        /**
         * 현재 스코프(cid, uid)에 해당하는 모든 캐시 데이터를 삭제합니다.
         */
        clearAll: async (): Promise<void> => {
            await clearScopedData(resolveScopedContext(type, contextProvider));
        },
    };
};
