import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../../domain';
import { createDomainListResult, toDomainChannel } from '../../domain';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

type ChannelCache = CacheStorageItem<'channel'>;

const getChannelSortTime = (channel: Partial<DomainChannel> | ChannelCache): number => {
    const lastChatCreatedAt = (channel as { lastChat$?: { createdAt?: string | number } }).lastChat$?.createdAt;
    const updatedAt = (channel as { updatedAt?: string | number }).updatedAt;
    const value = lastChatCreatedAt ?? updatedAt ?? 0;
    return typeof value === 'number' ? value : new Date(value).getTime();
};

export interface IChannelLocalDataSourceV2
    extends ILocalDataSourceV2<DomainChannel, DomainChannelListPayload, DomainListResult<DomainChannel>> {}

/** Persists channels locally and fans out observer updates by scoped channel list keys. */
export class ChannelLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IChannelLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'channel'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainChannel | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? toDomainChannel(item, this.getReadScope(item, contextOverride)) : null;
    }

    public async cacheReadList(
        query: DomainChannelListPayload,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        const context = this.getContext(contextOverride);
        const allChannels = await this.cacheStorage.loadAll();
        const placeId = query.sid ?? context.sid;
        const isDefaultCloud = context.cid === 'default';
        const scopedChannels =
            isDefaultCloud || !placeId ? allChannels : allChannels.filter(channel => channel.sid === placeId);

        if (scopedChannels.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const sorted = [...scopedChannels]
            .sort((left, right) => getChannelSortTime(right) - getChannelSortTime(left))
            .map(channel => toDomainChannel(channel, this.getReadScope(channel, contextOverride)));

        const limit = query.limit;
        const page = query.page ?? 0;
        const start = limit ? page * limit : 0;
        const list = limit ? sorted.slice(start, start + limit) : sorted;

        return createDomainListResult(list, {
            total: scopedChannels.length,
            limit,
            page,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<DomainChannel | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: DomainChannelListPayload,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const sid = (item as { $?: { sid?: string } }).$?.sid || item.sid || existing?.sid || context.sid || 'default';
        const cid = context.cid || this.getCid(contextOverride);

        const normalized = toDomainChannel(
            {
                ...(existing ?? {}),
                ...(item as Record<string, unknown>),
                sid,
                cid,
            } as Partial<DomainChannel>,
            { cid, sid, uid: context.uid }
        );

        await this.cacheStorage.save(id, normalized as ChannelCache);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid, sid], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const allExisting = await this.cacheStorage.loadAll();
        const existingMap = new Map<string, ChannelCache>();
        for (const item of allExisting) {
            const id = (item as { id?: string }).id;
            if (id) existingMap.set(id, item);
        }

        const normalized: ChannelCache[] = [];
        const ids: string[] = [];
        const sids = new Set<string>();
        for (const item of validItems) {
            const id = item.id!;
            const existing = existingMap.get(id);
            const sid =
                (item as { $?: { sid?: string } }).$?.sid || item.sid || existing?.sid || context.sid || 'default';
            const next = toDomainChannel(
                {
                    ...(existing ?? {}),
                    ...(item as Record<string, unknown>),
                    sid,
                    cid,
                } as Partial<DomainChannel>,
                { cid, sid, uid: context.uid }
            );
            normalized.push(next as ChannelCache);
            ids.push(id);
            if (existing?.sid) sids.add(existing.sid);
            if (sid) sids.add(sid);
        }

        await this.cacheStorage.saveAll(normalized);
        this.scheduleItemReemit(ids);
        this.scheduleListReemit(this.getAffectedListPrefixes(Array.from(sids), contextOverride));
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const existingItems = await Promise.all(validIds.map(id => this.cacheStorage.load(id)));
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item?.sid),
                contextOverride
            )
        );
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: DomainChannelListPayload, contextOverride?: LocalDataSourceV2ContextOverride): string {
        const sid = query.sid ?? this.getSid(contextOverride) ?? '__all__';
        return this.createListObserverKey(
            [
                'channels',
                `sid:${sid}`,
                `page:${query.page ?? 0}`,
                `limit:${query.limit ?? 'all'}`,
                `detail:${query.detail ? 1 : 0}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        sids: Array<string | undefined>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueSids = Array.from(new Set(sids.map(sid => sid || '__all__')));
        return [`${scopeKey}|channels`, ...uniqueSids.map(sid => `${scopeKey}|channels|sid:${sid}`)];
    }

    private getReadScope(
        item: Partial<DomainChannel> | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): { cid: string; sid?: string; uid?: string } {
        return {
            cid: (item as { cid?: string })?.cid || this.getCid(contextOverride),
            sid: (item as { sid?: string })?.sid || this.getSid(contextOverride),
            uid: this.getUid(contextOverride),
        };
    }
}
