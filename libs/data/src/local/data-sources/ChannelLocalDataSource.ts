import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../../domain';
import {
    ACCOUNT_CHANNEL_SID,
    createDomainListResult,
    dmPlaceOf,
    isCloudDm,
    isRelayDm,
    placeOfDmId,
} from '../../domain';
import type { DataContextProvider } from '../../repositories/types';
import type { ScopedCacheStorage } from '../ports';
import {
    BaseLocalDataSource,
    type ILocalDataSource,
    type LocalDataSourceCallback,
    type LocalDataSourceContextOverride,
    type LocalDataSourceUnsubscribe,
} from './types';

export type IChannelLocalDataSource = ILocalDataSource<
    DomainChannel,
    DomainChannelListPayload,
    DomainListResult<DomainChannel>
>;

const accountSid = (item: Partial<DomainChannel>): string | undefined =>
    item.stereo === 'self' ? ACCOUNT_CHANNEL_SID : undefined;

const cloudDmPlace = (item: Partial<DomainChannel>, existing: DomainChannel | null | undefined): string => {
    if (item.stereo) return dmPlaceOf(item) || existing?.sid || '';
    return placeOfDmId(item.id) || existing?.sid || dmPlaceOf(item);
};

const isCloudDmRow = (item: Partial<DomainChannel>, existing: DomainChannel | null | undefined, cid: string) =>
    isCloudDm({ stereo: item.stereo ?? existing?.stereo, cid });

const isRelayDmRow = (item: Partial<DomainChannel>, existing: DomainChannel | null | undefined, cid: string) =>
    isRelayDm({ stereo: item.stereo ?? existing?.stereo, cid });

export class ChannelLocalDataSource extends BaseLocalDataSource<'channel'> implements IChannelLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'channel'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(
        id: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChannel | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadList(
        query: DomainChannelListPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        const context = this.getContext(contextOverride);
        const allChannels = await this.storage(contextOverride).loadAll();
        const placeId = query.sid;
        const isDefaultCloud = context.cid === 'default';
        const scopedChannels =
            isDefaultCloud || !placeId ? allChannels : allChannels.filter(channel => channel.sid === placeId);

        if (scopedChannels.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const sorted = [...scopedChannels].sort((left, right) =>
            String(left.id ?? '').localeCompare(String(right.id ?? ''), undefined, { numeric: true })
        );

        const limit = query.limit;
        const page = query.page ?? 0;
        const start = limit ? page * limit : 0;
        const list = limit ? sorted.slice(start, start + limit) : sorted;

        return createDomainListResult(list, {
            total: sorted.length,
            limit,
            page,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainChannel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: DomainChannelListPayload,
        callback: LocalDataSourceCallback<DomainListResult<DomainChannel> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(item.id, 'id');

        const storage = this.storage(scope);
        const existing = await storage.load(id);
        const cid = scope.cid || 'default';
        const isDm = isCloudDmRow(item, existing, cid);
        const sid = isDm
            ? cloudDmPlace(item, existing)
            : ((item.sid || existing?.sid || scope.sid || accountSid(item)) ?? '');

        if (!sid && !isDm && !isRelayDmRow(item, existing, cid)) {
            throw new Error('[ChannelLocalDataSource] sid is required to sync/save channel.');
        }

        const merged: DomainChannel = {
            ...(existing ?? ({} as DomainChannel)),
            ...item,
            id,
            cid,
            sid,
            isNotificationEnabled: item.isNotificationEnabled ?? existing?.isNotificationEnabled ?? true,
        };

        await storage.save(id, merged);
        this.scheduleItemReemit([id], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid, sid], scope));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainChannel>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const cid = scope.cid || 'default';
        const storage = this.storage(scope);
        const allExisting = await storage.loadAll();
        const existingMap = new Map<string, DomainChannel>();
        for (const item of allExisting) {
            if (item.id) existingMap.set(item.id, item);
        }

        const mergedList: DomainChannel[] = [];
        const ids: string[] = [];
        const sids = new Set<string>();
        for (const item of validItems) {
            const id = item.id!;
            const existing = existingMap.get(id);
            const isDm = isCloudDmRow(item, existing, cid);
            const sid = isDm
                ? cloudDmPlace(item, existing)
                : item.sid || item.$?.sid || existing?.sid || scope.sid || accountSid(item) || '';

            if (!sid && !isDm && !isRelayDmRow(item, existing, cid)) {
                throw new Error('[ChannelLocalDataSource] sid is required to sync/save channels.');
            }

            const next: DomainChannel = {
                ...(existing ?? ({} as DomainChannel)),
                ...item,
                id,
                cid,
                sid,
                isNotificationEnabled: item.isNotificationEnabled ?? existing?.isNotificationEnabled ?? true,
            };
            mergedList.push(next);
            ids.push(id);
            if (existing?.sid) sids.add(existing.sid);
            if (sid) sids.add(sid);
        }

        await storage.saveAll(mergedList);
        this.scheduleItemReemit(ids, scope);
        this.scheduleListReemit(this.getAffectedListPrefixes(Array.from(sids), scope));
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(requiredId);
        await storage.delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing?.sid], scope));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const storage = this.storage(scope);
        const existingItems = await storage.loadMany(validIds);
        await storage.deleteAll(validIds);
        this.scheduleItemReemit(validIds, scope);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.map(item => item.sid),
                scope
            )
        );
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: DomainChannelListPayload, contextOverride?: LocalDataSourceContextOverride): string {
        const sid = query.sid ?? '__all__';
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
        contextOverride?: LocalDataSourceContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const uniqueSids = Array.from(new Set(sids.map(sid => sid || '__all__')));
        return [`${scopeKey}|channels|sid:|`, ...uniqueSids.map(sid => `${scopeKey}|channels|sid:${sid}|`)];
    }
}
