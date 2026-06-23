import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../../domain';
import { createDomainListResult } from '../../domain';
import type { DataContextProvider } from '../../repositories';
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
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
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
        const id = this.assertRequiredString(item.id, 'id');

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[JoinLocalDataSourceV2] sid is required in context to save join.');
        }

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
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId, merged.channelId], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        if (!context.sid) {
            throw new Error('[JoinLocalDataSourceV2] sid is required in context to save joins.');
        }

        const cid = context.cid || 'default';
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));

        const mergedList = validItems.map((item, index) => {
            const existing = existingItems[index];
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
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                mergedList.flatMap((item, index) => [existingItems[index]?.channelId, item.channelId]),
                contextOverride
            )
        );
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.channelId], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const existingItems = await Promise.all(validIds.map(id => this.cacheStorage.load(id)));
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item?.channelId),
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

    private getAffectedListPrefixes(
        channelIds: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueChannels = Array.from(new Set(channelIds.map(channelId => channelId || '__none__')));
        return [`${scopeKey}|joins`, ...uniqueChannels.map(channelId => `${scopeKey}|joins|channel:${channelId}`)];
    }
}
