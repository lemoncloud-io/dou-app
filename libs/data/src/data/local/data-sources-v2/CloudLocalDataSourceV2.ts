import type { CacheCloudView } from '@chatic/app-messages';
import type { DomainListResult } from '../../domain';
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

export interface ICloudLocalDataSourceV2
    extends ILocalDataSourceV2<CacheCloudView, void, DomainListResult<CacheCloudView>> {}

/** @deprecated Use {@link ICloudLocalDataSourceV2}. */
export type IInviteCloudLocalDataSourceV2 = ICloudLocalDataSourceV2;

/**
 * Keeps cloud cache entries isolated per cloud scope and re-emits affected observers.
 *
 * Backed by the 'invitecloud' cache storage slot (physical cache key kept for
 * backward-compatible IndexedDB/SQLite partitions; only the domain naming moved to Cloud).
 */
export class CloudLocalDataSourceV2 extends BaseLocalDataSourceV2 implements ICloudLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'invitecloud'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(id: string): Promise<CacheCloudView | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? { ...item } : null;
    }

    public async cacheReadList(): Promise<DomainListResult<CacheCloudView> | null> {
        const items = await this.cacheStorage.loadAll();
        return createDomainListResult(
            items.map(item => ({ ...item })),
            {
                total: items.length,
                source: 'local',
            }
        );
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceV2Callback<CacheCloudView | null>,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id), callback);
    }

    public observeList(
        _query: void,
        callback: LocalDataSourceV2Callback<DomainListResult<CacheCloudView> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.createListObserverKey(['clouds'], contextOverride),
            () => this.cacheReadList(),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);
        const normalized: CacheCloudView = {
            ...(existing ?? {}),
            ...(item as CacheCloudView),
            id,
            cid: item.cid || existing?.cid || context.cid || this.getCid(contextOverride),
            // Cache historically held invited clouds; default unclassified writes to 'invited'.
            cloudType: item.cloudType ?? existing?.cloudType ?? 'invited',
        };
        await this.cacheStorage.save(id, normalized);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|clouds`]);
    }

    public async cacheWriteMany(
        items: Array<Partial<CacheCloudView>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));
        const context = this.getContext(contextOverride);
        const normalized = validItems.map((item, index) => ({
            ...(existingItems[index] ?? {}),
            ...(item as CacheCloudView),
            id: item.id!,
            cid: item.cid || existingItems[index]?.cid || context.cid || this.getCid(contextOverride),
            cloudType: item.cloudType ?? existingItems[index]?.cloudType ?? 'invited',
        }));
        await this.cacheStorage.saveAll(normalized);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|clouds`]);
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|clouds`]);
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit([`${this.getScopeKey(contextOverride)}|clouds`]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }
}

/** @deprecated Use {@link CloudLocalDataSourceV2}. */
export const InviteCloudLocalDataSourceV2 = CloudLocalDataSourceV2;
