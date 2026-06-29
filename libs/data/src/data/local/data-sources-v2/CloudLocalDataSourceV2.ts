import type { DomainCloud, DomainListResult } from '../../domain';
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

export interface ICloudLocalDataSourceV2 extends ILocalDataSourceV2<DomainCloud, void, DomainListResult<DomainCloud>> {}

/**
 * Clouds are stored in a single global partition (cid/uid='global'), so their list
 * observer key is fixed too — switching the active cid must not split cloud observers.
 */
const CLOUD_LIST_KEY = 'global|clouds';

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

    public async cacheRead(id: string): Promise<DomainCloud | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? { ...item } : null;
    }

    public async cacheReadList(): Promise<DomainListResult<DomainCloud> | null> {
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
        callback: LocalDataSourceV2Callback<DomainCloud | null>,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id), callback);
    }

    public observeList(
        _query: void,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainCloud> | null>,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(CLOUD_LIST_KEY, () => this.cacheReadList(), callback);
    }

    public async cacheWrite(
        item: Partial<DomainCloud>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);
        const merged: DomainCloud = {
            ...(existing ?? ({} as DomainCloud)),
            ...item,
            id,
            cid: item.cid || existing?.cid || context.cid || this.getCid(contextOverride),
            cloudType: item.cloudType ?? existing?.cloudType ?? 'invited',
        };
        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainCloud>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));
        const context = this.getContext(contextOverride);
        const mergedList = validItems.map((item, index) => {
            const existing = existingItems[index];
            return {
                ...(existing ?? ({} as DomainCloud)),
                ...item,
                id: item.id!,
                cid: item.cid || existing?.cid || context.cid || 'default',
                cloudType: item.cloudType ?? existing?.cloudType ?? 'invited',
            } as DomainCloud;
        });
        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheDelete(id: string, _contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheDeleteMany(ids: string[], _contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }
}
