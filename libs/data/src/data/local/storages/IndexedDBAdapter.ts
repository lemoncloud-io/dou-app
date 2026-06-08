import type { CacheChatView, CacheModelOf, CacheQueryOf, CacheType } from '@chatic/app-messages';
import type { DataContextProvider } from '../../repositories';
import type { IIndexedDB, IndexedDbQueryExecutor, IndexedDbRow } from '../databases';
import { CHAT_PAGINATION_INDEX, TYPE_CID_UID_INDEX } from '../databases';
import { createTtlMeta, withCacheMeta } from './utils';
import { BaseDbAdapter } from './types';

/** IndexedDB signals an over-quota write as a QuotaExceededError DOMException (legacy code 22). */
const isQuotaExceeded = (error: unknown): boolean =>
    error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22);

/**
 * IndexedDB를 저장소로 사용하는 개별 캐시 스토리지 어댑터 클래스입니다.
 * BaseDbAdapter를 상속하여 스코프 계산 등의 기능을 상속하고,
 * 도메인별 쿼리 대리자(IndexedDbQueryExecutor)를 활용하여 역할을 분담합니다.
 *
 * @template TType 캐시 도메인 타입
 */
export class IndexedDBAdapter<TType extends CacheType> extends BaseDbAdapter<TType> {
    constructor(
        private readonly db: IIndexedDB,
        type: TType,
        contextProvider: DataContextProvider,
        private readonly executor?: IndexedDbQueryExecutor<TType>
    ) {
        super(type, contextProvider);
    }

    private buildKey(cid: string, uid: string, id: string): string {
        return `${this.type}:${cid}:${uid}:${id}`;
    }

    private createSchema(cid: string, uid: string, id: string, item: CacheModelOf<TType>): IndexedDbRow<TType> {
        const row: IndexedDbRow<TType> = {
            key: this.buildKey(cid, uid, id),
            type: this.type,
            cid,
            uid,
            id,
            data: withCacheMeta(this.type, item),
            meta: createTtlMeta(this.type),
        };

        if (this.type === 'chat') {
            const chatItem = item as unknown as CacheChatView;
            if (chatItem.channelId) {
                row.channel_id = chatItem.channelId;
            }
            if (chatItem.chatNo !== undefined) {
                row.chat_no = chatItem.chatNo;
            }
        }

        return row;
    }

    async save(id: string, item: CacheModelOf<TType>): Promise<CacheModelOf<TType>> {
        const scope = this.getScope();
        const row = this.createSchema(scope.cid, scope.uid, id, item);
        await this.writeWithQuotaGuard(() => this.db.save(row));
        return item;
    }

    async saveAll(items: CacheModelOf<TType>[]): Promise<CacheModelOf<TType>[]> {
        if (items.length === 0) return [];
        const scope = this.getScope();
        const rows = items
            .map(item => {
                const id = (item as { id?: string }).id;
                if (!id) return null;
                return this.createSchema(scope.cid, scope.uid, id, item);
            })
            .filter((row): row is IndexedDbRow<TType> => row !== null);

        await this.writeWithQuotaGuard(() => this.db.saveAll(rows));
        return items;
    }

    /**
     * Run an IndexedDB write; on QuotaExceededError, emergency-evict the oldest
     * chats for the current scope and retry once. The chat cache is the unbounded
     * bulk consumer (TTL is effectively permanent, no eviction strategy on web),
     * so dropping its oldest rows is what frees space — even for a non-chat write.
     * Scroll-up refetches the dropped history from the network. A second failure
     * propagates so the caller surfaces it instead of looping. See ADR-0006.
     */
    private async writeWithQuotaGuard(write: () => Promise<void>): Promise<void> {
        try {
            await write();
        } catch (error) {
            if (!isQuotaExceeded(error)) throw error;
            await this.evictOldestChats();
            await write();
        }
    }

    /** Delete the oldest chats (by chat_no) for the current scope to reclaim space. */
    private async evictOldestChats(fraction = 0.2, minDelete = 50): Promise<void> {
        const scope = this.getScope();
        const rows = await this.db.loadAll<'chat'>(TYPE_CID_UID_INDEX, ['chat', scope.cid, scope.uid]);
        if (rows.length === 0) return;
        const oldestFirst = [...rows].sort((a, b) => (a.chat_no ?? 0) - (b.chat_no ?? 0));
        const count = Math.min(oldestFirst.length, Math.max(minDelete, Math.floor(oldestFirst.length * fraction)));
        await this.db.deleteAll(oldestFirst.slice(0, count).map(row => row.key));
    }

    async load(id: string): Promise<CacheModelOf<TType> | null> {
        const scope = this.getScope();
        const key = this.buildKey(scope.cid, scope.uid, id);
        const row = await this.db.load<TType>(key);
        return row?.data ?? null;
    }

    async loadAll(options?: CacheQueryOf<TType>): Promise<CacheModelOf<TType>[]> {
        const scope = this.getScope();

        if (this.executor) {
            const rows = await this.executor.execute(this.db, { type: this.type, ...scope }, options);
            return rows.map((row: IndexedDbRow<TType>) => row.data);
        }

        const rows = await this.db.loadAll<TType>(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
        return rows.map((row: IndexedDbRow<TType>) => row.data);
    }

    async delete(id: string): Promise<void> {
        const scope = this.getScope();
        await this.db.delete(this.buildKey(scope.cid, scope.uid, id));
    }

    async deleteAll(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const scope = this.getScope();
        const keys = ids.map(id => this.buildKey(scope.cid, scope.uid, id));
        await this.db.deleteAll(keys);
    }

    async clearAll(): Promise<void> {
        const scope = this.getScope();
        await this.db.clearAll(TYPE_CID_UID_INDEX, [this.type, scope.cid, scope.uid]);
    }

    override async clearByChannelId(channelId: string): Promise<void> {
        const scope = this.getScope();
        const lower = [this.type, scope.cid, scope.uid, channelId];
        const upper = [this.type, scope.cid, scope.uid, channelId, []];
        const range = IDBKeyRange.bound(lower, upper);
        await this.db.clearByRange(CHAT_PAGINATION_INDEX, range);
    }
}
