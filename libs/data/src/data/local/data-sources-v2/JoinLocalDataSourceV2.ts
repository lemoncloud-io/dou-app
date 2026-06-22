import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainJoin } from '../../domain';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

type JoinCache = CacheStorageItem<'join'>;

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

    public async cacheRead(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<DomainJoin | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? toDomainJoin(item, this.getReadScope(item, contextOverride)) : null;
    }

    public async cacheReadList(
        query: DomainJoinListPayload,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainJoin> | null> {
        const channelId = query?.channelId;

        const allItems = await this.cacheStorage.loadAll();
        let list = allItems.map(item => toDomainJoin(item, this.getReadScope(item, contextOverride)));

        if (channelId) {
            list = list.filter(item => item.channelId === channelId);
        }

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
        const existing = await this.cacheStorage.load(id);
        const cid = context.cid || this.getCid(contextOverride);
        const normalized = toDomainJoin(
            {
                ...(existing ?? {}),
                ...(item as Record<string, unknown>),
                cid,
            } as Partial<DomainJoin>,
            {
                cid,
                sid: context.sid,
                uid: context.uid,
            }
        );

        await this.cacheStorage.save(id, normalized as JoinCache);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(
            this.getAffectedListPrefixes([existing?.channelId, normalized.channelId], contextOverride)
        );
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainJoin>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));

        const normalized = validItems.map(
            (item, index) =>
                toDomainJoin(
                    {
                        ...(existingItems[index] ?? {}),
                        ...(item as Record<string, unknown>),
                        cid,
                    } as Partial<DomainJoin>,
                    {
                        cid,
                        sid: context.sid,
                        uid: context.uid,
                    }
                ) as JoinCache
        );

        await this.cacheStorage.saveAll(normalized);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                normalized.flatMap((item, index) => [existingItems[index]?.channelId, item.channelId]),
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

    private getReadScope(
        item: Partial<DomainJoin> | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): { cid: string; sid?: string; uid?: string } {
        return {
            cid: (item as { cid?: string })?.cid || this.getCid(contextOverride),
            sid: this.getSid(contextOverride),
            uid: this.getUid(contextOverride),
        };
    }
}
