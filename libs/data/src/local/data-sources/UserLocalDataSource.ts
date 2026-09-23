import type { ChatUsersInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainUser } from '../../domain';
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

export interface IUserLocalDataSource
    extends ILocalDataSource<DomainUser, ChatUsersInput, DomainListResult<DomainUser>> {
    cacheReadMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]>;
}

/** Caches channel user snapshots locally and reuses scoped keys for list observation. */
export class UserLocalDataSource extends BaseLocalDataSource<'user'> implements IUserLocalDataSource {
    constructor(contextProvider: DataContextProvider, storages: ScopedCacheStorage<'user'>) {
        super(contextProvider, storages);
    }

    public async cacheRead(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.storage(contextOverride).load(requiredId);
    }

    public async cacheReadMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]> {
        if (ids.length === 0) return [];
        // `loadMany` already drops absent ids, so no extra filter is needed. The returned order is
        // unrelated to `ids` — callers (looking up chat authors in useChats, for instance) find by id
        // and do not use the order.
        return this.storage(contextOverride).loadMany(ids);
    }

    public async cacheReadList(
        query: ChatUsersInput,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainUser> | null> {
        const allUsers = await this.storage(contextOverride).loadAll();
        let users = allUsers;

        if (query.channelId) {
            // Domain users carry their channel membership in `channelIds` (mapped upstream).
            users = users.filter(user => (user.channelIds || []).includes(query.channelId!));
        }

        return createDomainListResult(users, {
            total: users.length,
            page: query.page,
            limit: query.limit,
            source: 'local',
        });
    }

    public observeItem(
        id: string,
        callback: LocalDataSourceCallback<DomainUser | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback, contextOverride);
    }

    public observeList(
        query: ChatUsersInput,
        callback: LocalDataSourceCallback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalDataSourceUnsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainUser>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const id = this.assertRequiredString(item.id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(id);

        // Channel membership is preserved by unioning the mapped `channelIds`.
        const channelIds = Array.from(new Set([...(existing?.channelIds || []), ...(item.channelIds || [])]));

        const merged: DomainUser = {
            ...(existing ?? ({} as DomainUser)),
            ...item,
            id,
            cid: item.cid || existing?.cid || scope.cid || 'default',
            channelIds,
        };

        await storage.save(id, merged);
        this.scheduleItemReemit([id], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing, merged], scope));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const storage = this.storage(scope);
        const existingItems = await storage.loadMany(validItems.map(item => item.id!));
        const existingById = this.indexById(existingItems);

        const mergedList = validItems.map(item => {
            const existing = existingById.get(item.id!);
            const channelIds = Array.from(new Set([...(existing?.channelIds || []), ...(item.channelIds || [])]));

            return {
                ...(existing ?? ({} as DomainUser)),
                ...item,
                id: item.id!,
                cid: item.cid || existing?.cid || scope.cid || 'default',
                channelIds,
            } as DomainUser;
        });

        await storage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean), scope);
        this.scheduleListReemit(this.getAffectedListPrefixes([...existingItems, ...mergedList], scope));
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const scope = this.resolveContext(contextOverride);
        const requiredId = this.assertRequiredString(id, 'id');
        const storage = this.storage(scope);
        const existing = await storage.load(requiredId);
        await storage.delete(requiredId);
        this.scheduleItemReemit([requiredId], scope);
        this.scheduleListReemit(this.getAffectedListPrefixes(existing ? [existing] : [], scope));
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
        this.scheduleListReemit(this.getAffectedListPrefixes(existingItems, scope));
    }

    public async cacheClear(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.storage(contextOverride).clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: ChatUsersInput, contextOverride?: LocalDataSourceContextOverride): string {
        return this.createListObserverKey(
            [
                'users',
                `channel:${query.channelId || '__all__'}`,
                `page:${query.page ?? 0}`,
                `limit:${query.limit ?? 'all'}`,
            ],
            contextOverride
        );
    }

    private getAffectedListPrefixes(
        users: Array<Partial<DomainUser> | null | undefined>,
        contextOverride?: LocalDataSourceContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const channelIds = new Set<string>();
        for (const user of users) {
            for (const channelId of user?.channelIds || []) {
                if (channelId) channelIds.add(channelId);
            }
        }

        return [
            `${scopeKey}|users`,
            `${scopeKey}|users|channel:__all__`,
            ...Array.from(channelIds).map(channelId => `${scopeKey}|users|channel:${channelId}`),
        ];
    }
}
