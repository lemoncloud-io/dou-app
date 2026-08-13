import type { IWebBridgeClient } from '@chatic/bridges';
import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
    ClearCacheDataPayload,
    DeleteAllCacheDataPayload,
    DeleteCacheDataPayload,
    FetchAllCacheDataPayload,
    FetchCacheDataPayload,
    OnFetchAllCacheDataPayload,
    OnFetchCacheDataPayload,
    SaveAllCacheDataPayload,
    SaveCacheDataPayload,
} from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories-v2/types';
import { withCacheMeta } from './utils';
import { type NativeCacheOperation, recordNativeCacheOperation } from './nativeCacheMetrics';
import { BaseDbAdapter } from './types';

/** 브릿지 메시지 → 계측 연산명. 이 어댑터가 보내는 7종이 전부입니다. */
const OPERATION_BY_MESSAGE: Record<string, NativeCacheOperation> = {
    SaveCacheData: 'save',
    SaveAllCacheData: 'saveAll',
    FetchCacheData: 'load',
    FetchAllCacheData: 'loadAll',
    DeleteCacheData: 'delete',
    DeleteAllCacheData: 'deleteAll',
    ClearCacheData: 'clearAll',
};

/**
 * 네이티브 앱 환경(SQLite 등)의 로컬 DB와 WebBridge를 통해 통신하는 캐시 스토리지 어댑터 클래스입니다.
 *
 * @template TType 캐시 도메인 타입
 */
export class NativeDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly bridge: IWebBridgeClient,
        type: TType,
        contextProvider: DataContextProvider
    ) {
        super(type, contextProvider);
    }

    /**
     * 브릿지 왕복을 태우는 유일한 지점. 여기서 소요 시간을 재므로 새 연산을 추가해도 계측이 저절로
     * 따라옵니다(`bridge.request`를 직접 부르면 빠집니다).
     *
     * 실패해도 기록하려고 `finally`를 씁니다 — 타임아웃이 가장 느린 호출인데 그걸 빼면 분포가
     * 실제보다 좋아 보입니다. 계측 비용은 호출당 `Date.now()` 두 번이라 왕복 앞에서 무시할 수준입니다.
     */
    private async send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        const startedAt = Date.now();
        try {
            return await this.bridge.request(message);
        } finally {
            recordNativeCacheOperation(OPERATION_BY_MESSAGE[message.type], this.type, Date.now() - startedAt);
        }
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();

        await this.send({
            type: 'SaveCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
                item: withCacheMeta(this.type, item),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveCacheDataPayload, { type: TType }>,
        });
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();

        await this.send({
            type: 'SaveAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                items: items.map(item => withCacheMeta(this.type, item)),
                // Double cast: the generic TType cannot narrow the discriminated payload union.
            } as unknown as Extract<SaveAllCacheDataPayload, { type: TType }>,
        });
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();

        const response = await this.send({
            type: 'FetchCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<FetchCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchCacheDataPayload, { type: TType }> | undefined;
        return (data?.item ?? null) as CacheModelOf<TType> | null;
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        const query = {
            cid: scope.cid,
            uid: scope.uid,
            ...options,
        };

        const response = await this.send({
            type: 'FetchAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                query,
            } as Extract<FetchAllCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchAllCacheDataPayload, { type: TType }> | undefined;
        return (data?.items ?? []) as CacheModelOf<TType>[];
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();

        await this.send({
            type: 'DeleteCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<DeleteCacheDataPayload, { type: TType }>,
        });
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();

        await this.send({
            type: 'DeleteAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                ids,
            } as Extract<DeleteAllCacheDataPayload, { type: TType }>,
        });
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();

        await this.send({
            type: 'ClearCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
            } as Extract<ClearCacheDataPayload, { type: TType }>,
        });
    }
}
