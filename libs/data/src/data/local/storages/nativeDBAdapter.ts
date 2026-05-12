import type { AppMessage, AppMessageType, CacheModelMap, CacheType, WebMessage } from '@chatic/app-messages';
import { postMessage, useAppMessageStore } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage } from './cacheStorage';
import { type AdapterScope, isModelExpired, resolveScopedContext, withCacheMeta } from './utils';

/**
 * 브릿지 통신 시 요청과 응답을 매핑하기 위한 고유 식별자(Nonce)를 생성합니다.
 * 브라우저 환경에서 지원할 경우 암호학적으로 안전한 randomUUID를 사용하며,
 * 그렇지 않을 경우 Math.random()을 활용한 임의의 문자열을 반환합니다.
 */
const generateNonce = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

/**
 * 네이티브 앱으로부터 특정 타입의 메시지가 도착할 때까지 대기합니다.
 * * @param type - 대기할 앱 메시지의 타입
 * @param predicate - 수신된 메시지가 요청에 대한 응답인지 판별하는 조건 함수 (보통 nonce 비교)
 * @param timeout - 타임아웃 시간(ms). 기본값 5000ms. 지정된 시간 내에 응답이 없으면 에러를 발생시킵니다.
 * @returns 조건에 맞는 앱 메시지를 반환하는 Promise
 */
const waitForAppMessage = <T extends AppMessageType>(
    type: T,
    predicate: (msg: Extract<AppMessage, { type: T }>) => boolean,
    timeout = 5000
): Promise<Extract<AppMessage, { type: T }>> =>
    new Promise((resolve, reject) => {
        const handler = (msg: Extract<AppMessage, { type: T }>) => {
            if (!predicate(msg)) return; // 조건에 맞지 않는 메시지는 무시
            clearTimeout(timer); // 타임아웃 타이머 해제
            useAppMessageStore.getState().removeHandler(type, handler); // 이벤트 리스너 제거
            resolve(msg); // 메시지 반환
        };

        const timer = setTimeout(() => {
            useAppMessageStore.getState().removeHandler(type, handler);
            reject(new Error(`Timeout waiting for app message: ${type}`));
        }, timeout);

        // 메시지 수신 핸들러 등록
        useAppMessageStore.getState().addHandler(type, handler);
    });

/**
 * 웹 환경에서 네이티브 앱으로 메시지를 전송하는 래퍼(Wrapper) 함수입니다.
 */
const sendMessage = (message: WebMessage): void => {
    postMessage(message);
};

/**
 * 네이티브 데이터베이스(앱 내장 DB)와 통신하여 데이터를 캐싱하는 어댑터를 생성합니다.
 * * @param type - 캐시 데이터의 도메인 또는 타입
 * @param contextProvider - 채널 ID(cid)와 사용자 ID(uid) 등 데이터 스코프 정보를 제공하는 객체
 * @returns CacheStorage 인터페이스를 구현한 객체 (데이터 CRUD 메서드 제공)
 */
export const createNativeDBAdapter = <TType extends CacheType>(
    type: TType,
    contextProvider: DataContextProvider
): CacheStorage<TType> => {
    type Model = CacheModelMap[TType];
    type Scope = AdapterScope;

    const post = (message: WebMessage): void => sendMessage(message);

    /**
     * 네이티브로 요청(WebMessage)을 보내고, 동일한 Nonce를 가진 응답(AppMessage)이 올 때까지 대기합니다.
     */
    const postAndWait = async <T extends AppMessageType>(
        request: WebMessage,
        responseType: T,
        nonce: string
    ): Promise<Extract<AppMessage, { type: T }>> => {
        post(request);
        return waitForAppMessage(responseType, message => message.nonce === nonce);
    };

    /**
     * Fetch 요청 시 사용할 스코프 기반 쿼리 조건(cid, uid)을 생성합니다.
     */
    const buildQuery = (scope: Scope) => ({ cid: scope.cid, uid: scope.uid });

    /**
     * 특정 ID의 단일 데이터를 삭제하기 위해 네이티브 측에 DeleteCacheData 명령을 전송합니다.
     */
    const deleteItem = async (scope: Scope, id: string): Promise<void> => {
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

    /**
     * 여러 ID의 데이터를 한 번에 삭제하기 위해 네이티브 측에 DeleteAllCacheData 명령을 전송합니다.
     */
    const deleteItems = async (scope: Scope, ids: string[]): Promise<void> => {
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

    /**
     * 특정 스코프(cid, uid)에 속하는 해당 타입의 모든 데이터를 초기화(Clear)합니다.
     * replaceAll이나 clearAll 등에서 사용되어 개별 데이터 Fetch나 Delete 과정 없이 전체 삭제를 수행합니다.
     */
    const clearScopedData = async (scope: Scope): Promise<void> => {
        const nonce = generateNonce();
        await postAndWait(
            {
                type: 'ClearCacheData',
                nonce,
                data: { type, cid: scope.cid, uid: scope.uid },
            } as WebMessage,
            'OnClearCacheData',
            nonce
        );
    };

    return {
        /**
         * 단일 데이터를 네이티브 캐시에 저장합니다.
         */
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

        /**
         * 다수의 데이터를 한 번에 네이티브 캐시에 저장합니다.
         */
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

        /**
         * 특정 ID의 데이터를 네이티브 캐시에서 불러옵니다.
         * 반환된 데이터가 만료되었다면 삭제 명령을 백그라운드에서 실행하고 null을 반환합니다.
         */
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

            // 데이터 만료 검사 및 비동기(Fire-and-forget) 삭제 처리
            if (isModelExpired(rawItem)) {
                deleteItem(scope, id).catch(() => {
                    /* empty */
                });
                return null;
            }
            return rawItem;
        },

        /**
         * 스코프에 해당하는 모든 데이터를 네이티브 캐시에서 불러옵니다.
         * 만료된 데이터는 백그라운드에서 일괄 삭제 처리하며, 유효한 데이터 배열만 필터링하여 반환합니다.
         */
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

            // 만료된 아이템 추출
            const expiredIds = items
                .filter(isModelExpired)
                .map(item => (item as { id?: string }).id)
                .filter((id): id is string => !!id);

            // 만료된 데이터가 존재할 경우 비동기 일괄 삭제 처리
            if (expiredIds.length > 0) {
                deleteItems(scope, expiredIds).catch(() => {
                    /* empty */
                });
            }

            // 만료되지 않은 유효한 데이터만 반환
            return items.filter(item => !isModelExpired(item));
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
