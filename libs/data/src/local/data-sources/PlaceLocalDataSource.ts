import type { UserMySiteInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainPlace } from '../../domain';
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

export interface IPlaceLocalDataSource
    extends ILocalDataSource<DomainPlace, UserMySiteInput | undefined, DomainListResult<DomainPlace>> {}

const RELAY_HOME_PLACE_ID = '0000';

const isMistaggedHomePlace = (item: Pick<DomainPlace, 'id' | 'cid'>): boolean =>
    item.id === RELAY_HOME_PLACE_ID && item.cid !== 'default';

export class PlaceLocalDataSource extends BaseLocalDataSource<'site'> implements IPlaceLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'site'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainPlace | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.storage(contextOverride).load(requiredId);
        return item && isMistaggedHomePlace(item) ? null : item;
    }

    public async cacheReadList(
        _query: UserMySiteInput | undefined,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainPlace> | null> {
        const items = (await this.storage(contextOverride).loadAll()).filter(item => !isMistaggedHomePlace(item));
        const list = [...items].sort((left, right) =>
            String(left.id ?? '').localeCompare(String(right.id ?? ''), undefined, { numeric: true })
        );

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainPlace | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: UserMySiteInput | undefined,
        callback: LocalDataSourceCallback<DomainListResult<DomainPlace> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.createListObserverKey(['places'], contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainPlace>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(item.id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(id);
        const cid = scope.cid || 'default';
        const merged: DomainPlace = {
            ...(existing ?? ({} as DomainPlace)),
            ...item,
            id,
            cid,
            order: item.order ?? existing?.order ?? Number.MAX_SAFE_INTEGER,
        };
        await storage.save(id, merged);
        this.scheduleItemReemit([id], scope);
        this.scheduleListReemit([`${this.getScopeKey(scope)}|places`]);
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainPlace>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const cid = scope.cid || 'default';
        const storage = this.storage(scope);
        const existingById = this.indexById(await storage.loadMany(validItems.map(item => item.id!)));
        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            return {
                ...(existing ?? ({} as DomainPlace)),
                ...item,
                id: item.id!,
                cid,
                order: item.order ?? existing?.order ?? Number.MAX_SAFE_INTEGER,
            } as DomainPlace;
        });

        await storage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), scope);
        this.scheduleListReemit([`${this.getScopeKey(scope)}|places`]);
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        await this.storage(scope).delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit([`${this.getScopeKey(scope)}|places`]);
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.storage(scope).deleteAll(validIds);
        this.scheduleItemReemit(validIds, scope);
        this.scheduleListReemit([`${this.getScopeKey(scope)}|places`]);
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }
}
