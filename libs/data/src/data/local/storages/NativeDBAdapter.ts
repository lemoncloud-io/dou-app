import type { IWebBridgeClient } from '@chatic/bridges';
import type {
    CacheModelOf,
    CacheQueryOf,
    CacheType,
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
import type { DataContextProvider } from '../../repositories';
import { withCacheMeta } from './utils';
import { BaseDbAdapter } from './types';

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

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();

        await this.bridge.request({
            type: 'SaveCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
                item: withCacheMeta(this.type, item),
            } as Extract<SaveCacheDataPayload, { type: TType }>,
        });
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();

        await this.bridge.request({
            type: 'SaveAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                items: items.map(item => withCacheMeta(this.type, item)),
            } as Extract<SaveAllCacheDataPayload, { type: TType }>,
        });
        return items;
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();

        const response = await this.bridge.request({
            type: 'FetchCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                id,
            } as Extract<FetchCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchCacheDataPayload, { type: TType }> | undefined;
        return data?.item ?? null;
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();
        const query = {
            cid: scope.cid,
            uid: scope.uid,
            ...options,
        };

        const response = await this.bridge.request({
            type: 'FetchAllCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
                query,
            } as Extract<FetchAllCacheDataPayload, { type: TType }>,
        });

        const data = response?.data as Extract<OnFetchAllCacheDataPayload, { type: TType }> | undefined;
        return data?.items ?? [];
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();

        await this.bridge.request({
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

        await this.bridge.request({
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

        await this.bridge.request({
            type: 'ClearCacheData',
            data: {
                type: this.type,
                cid: scope.cid,
                uid: scope.uid,
            } as Extract<ClearCacheDataPayload, { type: TType }>,
        });
    }
}
