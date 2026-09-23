import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../../domain';
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

export type IChannelLocalDataSource = ILocalDataSource<
    DomainChannel,
    DomainChannelListPayload,
    DomainListResult<DomainChannel>
>;

/** Persists channels locally and fans out observer updates by scoped channel list keys. */
export class ChannelLocalDataSource extends BaseLocalDataSource<'channel'> implements IChannelLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'channel'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(
        id: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainChannel | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        // Cache already holds normalized domain rows; return as-is without re-mapping.
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadList(
        query: DomainChannelListPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainChannel> | null> {
        const context = this.getContext(contextOverride);
        const allChannels = await this.storage(contextOverride).loadAll();
        // No `sid` in the query means EVERY site of this cloud. It used to fall back to the ambient
        // sid, which made the same call answer differently depending on which site happened to be
        // selected — while the observer key could not see that difference (ADR-0085).
        const placeId = query.sid;
        const isDefaultCloud = context.cid === 'default';
        const scopedChannels =
            isDefaultCloud || !placeId ? allChannels : allChannels.filter(channel => channel.sid === placeId);

        if (scopedChannels.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        // Default ordering is by id (ascending, numeric-aware) so list output stays stable and
        // predictable across reads, independent of activity timestamps.
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

    /**
     * Writes one channel, resolving its place from the row, the cached row, then the context.
     *
     * That fallback chain is load-bearing: it keeps a place-scoped row from silently losing the
     * list it belongs to, and the throw catches a caller that forgot to name a site.
     *
     * **A 1:1 does not need an exception here, and briefly had one.** The idea was that a cloud 1:1
     * belongs to no place, so it should be written with the field blank. The server assigns the
     * room a place regardless and returns it on every read, so the blank was refilled by the next
     * sync — and meanwhile an empty sid meant both "no place" and "place unknown", which is exactly
     * what this chain exists to resolve. The field is now stored as the server sent it, and which
     * rooms a place list may show is decided when reading instead (`isInPlaceList`).
     */
    public async cacheWrite(
        item: Partial<DomainChannel>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(item.id, 'id');

        const storage = this.storage(scope);
        const existing = await storage.load(id);
        const sid = (item.sid || existing?.sid || scope.sid) ?? '';
        const cid = scope.cid || 'default';

        if (!sid) {
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
            const sid = item.sid || item.$?.sid || existing?.sid || scope.sid;

            if (!sid) {
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
        // All that is needed is which sids' lists to re-read, so ids omitted because they are absent
        // do not matter (`loadMany` guarantees neither result length nor order).
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
        // Written sids, plus cloud-wide observers (`sid: ''`) which must hear about every sid — see
        // the sid-independent routing test.
        //
        // Two traps, both from `flush` matching with `key.startsWith(prefix)`:
        //  - A bare `${scopeKey}|channels` prefix matches EVERY channel observer, so one write woke
        //    them all and each wake re-reads storage.
        //  - Without the trailing `|`, `sid:site-1` also matches `sid:site-10`, and `sid:` matches
        //    everything. The delimiter pins the match to a whole key segment.
        return [`${scopeKey}|channels|sid:|`, ...uniqueSids.map(sid => `${scopeKey}|channels|sid:${sid}|`)];
    }
}
