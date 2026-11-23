import type { DomainCloud, DomainListResult } from '../../domain';
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

export interface ICloudLocalDataSource extends ILocalDataSource<DomainCloud, void, DomainListResult<DomainCloud>> {}

const CLOUD_LIST_KEY = 'global|clouds';

export class CloudLocalDataSource extends BaseLocalDataSource<'invitecloud'> implements ICloudLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'invitecloud'>) {
        super(contextProvider, storages);
    }

    protected override getScopeKey(): string {
        return 'global';
    }

    public async cacheRead(id: string): Promise<DomainCloud | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.storage().load(requiredId);
        return item ? { ...item } : null;
    }

    public async cacheReadList(): Promise<DomainListResult<DomainCloud> | null> {
        const items = await this.storage().loadAll();
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
        callback: LocalDataSourceCallback<DomainCloud | null>,
        _contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id), callback);
    }

    public observeList(
        _query: void,
        callback: LocalDataSourceCallback<DomainListResult<DomainCloud> | null>,
        _contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(CLOUD_LIST_KEY, () => this.cacheReadList(), callback);
    }

    public async cacheWrite(
        item: Partial<DomainCloud>,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const cid = this.assertRequiredString(item.cid, 'cid');
        const storage = this.storage();
        const existing = await storage.load(id);
        const merged: DomainCloud = {
            ...(existing ?? ({} as DomainCloud)),
            ...item,
            id,
            cid,
            cloudType: item.cloudType ?? existing?.cloudType ?? 'invited',
        };
        await storage.save(id, merged);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainCloud>>,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;
        const storage = this.storage();
        const existingById = this.indexById(await storage.loadMany(validItems.map(item => item.id!)));
        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            const id = this.assertRequiredString(item.id, 'id');
            const cid = this.assertRequiredString(item.cid, 'cid');
            return {
                ...(existing ?? ({} as DomainCloud)),
                ...item,
                id,
                cid,
                cloudType: item.cloudType ?? existing?.cloudType ?? 'invited',
            } as DomainCloud;
        });
        await storage.saveAll(mergedList);
        this.scheduleItemReemit(mergedList.map(item => item.id));
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheDelete(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        await this.storage().delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheDeleteMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.storage().deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit([CLOUD_LIST_KEY]);
    }

    public async cacheClear(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage().clearAll();
        this.scheduleFullReemit();
    }
}
