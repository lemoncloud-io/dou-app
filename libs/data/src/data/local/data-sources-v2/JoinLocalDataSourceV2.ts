import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories-v2/types';
import type { CacheStorage } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

export interface IJoinLocalDataSourceV2
    extends ILocalDataSourceV2<DomainJoin, DomainJoinListPayload, DomainListResult<DomainJoin>> {}

/** Persists channel membership records and scopes observer invalidation by channel id. */
export class JoinLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IJoinLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'join'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainJoin | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadList(
        query: DomainJoinListPayload,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainJoin> | null> {
        const channelId = this.assertRequiredString(query?.channelId, 'channelId');

        const allItems = await this.cacheStorage.loadAll();
        let list = allItems.filter(item => item.channelId === channelId);

        if (query?.activeOnly) {
            list = list.filter(item => item.joined === 1 || item.joined === undefined);
        }

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<DomainJoin | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: DomainJoinListPayload,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainJoin> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[JoinLocalDataSourceV2] sid is required in context to save join.');
        }
        const id = this.assertRequiredString(this.normalizeJoinId(item.id, item.channelId, item.userId), 'id');

        const existing = await this.cacheStorage.load(id);
        const cid = context.cid || 'default';
        const merged: DomainJoin = {
            ...(existing ?? ({} as DomainJoin)),
            ...item,
            id,
            cid,
            channelId: item.channelId ?? existing?.channelId ?? '',
            userId: item.userId ?? existing?.userId ?? '',
            joined: item.joined ?? existing?.joined ?? 1,
            readNo: item.readNo ?? existing?.readNo ?? 0,
        };

        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items
            .map(item => ({
                ...item,
                id: this.normalizeJoinId(item.id, item.channelId, item.userId),
            }))
            .filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[JoinLocalDataSourceV2] sid is required in context to save joins.');
        }

        const cid = context.cid || 'default';
        const existingById = this.indexById(await this.cacheStorage.loadMany(validItems.map(item => item.id!)));

        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            return {
                ...(existing ?? ({} as DomainJoin)),
                ...item,
                id: item.id!,
                cid,
                channelId: item.channelId ?? existing?.channelId ?? '',
                userId: item.userId ?? existing?.userId ?? '',
                joined: item.joined ?? existing?.joined ?? 1,
                readNo: item.readNo ?? existing?.readNo ?? 0,
            } as DomainJoin;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.flatMap(item => [existingById.get(item.id)?.channelId, item.channelId]),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId], contextOverride);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        // 영향받은 채널 집합만 필요하므로 없는 id가 빠져도 무관합니다.
        const existingItems = await this.cacheStorage.loadMany(validIds);
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, contextOverride);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.channelId),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: DomainJoinListPayload, contextOverride?: LocalDataSourceV2ContextOverride): string {
        return this.createListObserverKey(
            ['joins', `channel:${query.channelId || '__none__'}`, `active:${query.activeOnly ? 1 : 0}`],
            contextOverride
        );
    }

    private normalizeJoinId(id?: string, channelId?: string, userId?: string): string {
        if (!id) return '';
        if (id.includes('@')) return id;
        if (channelId && userId && id === `${channelId}:${userId}`) {
            return `${channelId}@${userId}`;
        }
        return id;
    }

    private getAffectedListPrefixes(
        channelIds: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueChannels = Array.from(new Set(channelIds.map(channelId => channelId || '__none__')));
        // Re-emit ONLY the written channels. A bare `${scopeKey}|joins` prefix used to sit in front
        // of these and looked harmless, but `flush` matches with `key.startsWith(prefix)` and every
        // join observer key begins with it — so one write woke every channel's observer, and each
        // wake re-reads storage. With one observer per channel (useMyJoins) that made a single write
        // cost N round trips; measured on device it was 16.5 reads per write.
        //
        // No catch-all entry: `cacheReadList` requires channelId, so a channel-less observer cannot
        // exist. The per-channel prefix still spans that channel's query variants (activeOnly).
        // The trailing `|` pins the match to a whole key segment; without it `channel:ch-1` also
        // matches `channel:ch-10`.
        return uniqueChannels.map(channelId => `${scopeKey}|joins|channel:${channelId}|`);
    }
}
