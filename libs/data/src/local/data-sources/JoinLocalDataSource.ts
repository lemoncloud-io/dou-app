import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories/types';
import type { ScopedCacheStorage } from '../ports';
import {
    BaseLocalDataSource,
    type ILocalDataSource,
    type LocalDataSourceCallback,
    type LocalDataSourceContextOverride,
    type LocalDataSourceUnsubscribe,
} from './types';

export interface IJoinLocalDataSource
    extends ILocalDataSource<DomainJoin, DomainJoinListPayload, DomainListResult<DomainJoin>> {}

/** Persists channel membership records and scopes observer invalidation by channel id. */
export class JoinLocalDataSource extends BaseLocalDataSource<'join'> implements IJoinLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'join'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainJoin | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadList(
        query: DomainJoinListPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainJoin> | null> {
        const channelId = this.assertRequiredString(query?.channelId, 'channelId');

        const allItems = await this.storage(contextOverride).loadAll();
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
        callback: LocalDataSourceCallback<DomainJoin | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: DomainJoinListPayload,
        callback: LocalDataSourceCallback<DomainListResult<DomainJoin> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainJoin>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(this.normalizeJoinId(item.id, item.channelId, item.userId), 'id');

        const storage = this.storage(scope);
        const existing = await storage.load(id);
        const cid = scope.cid || 'default';
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

        await storage.save(id, merged);
        this.scheduleItemReemit([id], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], scope));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validItems = items
            .map(item => ({
                ...item,
                id: this.normalizeJoinId(item.id, item.channelId, item.userId),
            }))
            .filter(item => !!item.id);
        if (validItems.length === 0) return;

        const cid = scope.cid || 'default';
        const storage = this.storage(scope);
        const existingById = this.indexById(await storage.loadMany(validItems.map(item => item.id!)));

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

        await storage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.flatMap(item => [existingById.get(item.id)?.channelId, item.channelId]),
                scope
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(requiredId);
        await storage.delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], scope));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        // Only the affected channel set is needed, so ids omitted because they are absent do not matter.
        const storage = this.storage(scope);
        const existingItems = await storage.loadMany(validIds);
        await storage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.channelId),
                scope
            )
        );
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: DomainJoinListPayload, contextOverride?: LocalDataSourceContextOverride): string {
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
        contextOverride?: LocalDataSourceContextOverride
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
