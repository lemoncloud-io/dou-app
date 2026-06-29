import type { ChatUsersInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainUser } from '../../domain';
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

export interface IUserLocalDataSourceV2
    extends ILocalDataSourceV2<DomainUser, ChatUsersInput, DomainListResult<DomainUser>> {
    cacheReadMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<DomainUser[]>;
}

/** Caches channel user snapshots locally and reuses scoped keys for list observation. */
export class UserLocalDataSourceV2 extends BaseLocalDataSourceV2 implements IUserLocalDataSourceV2 {
    constructor(
        contextProvider: DataContextProvider,
        private readonly cacheStorage: CacheStorage<'user'>
    ) {
        super(contextProvider);
    }

    public async cacheRead(
        id: string,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainUser | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        return this.cacheStorage.load(requiredId);
    }

    public async cacheReadMany(
        ids: string[],
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainUser[]> {
        if (ids.length === 0) return [];
        const items = await Promise.all(ids.map(id => this.cacheStorage.load(id)));
        return items.filter((item): item is DomainUser => !!item);
    }

    public async cacheReadList(
        query: ChatUsersInput,
        _contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainUser> | null> {
        const allUsers = await this.cacheStorage.loadAll();
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
        callback: LocalDataSourceV2Callback<DomainUser | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeItemQuery(id, () => this.cacheRead(id, contextOverride), callback);
    }

    public observeList(
        query: ChatUsersInput,
        callback: LocalDataSourceV2Callback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): LocalDataSourceV2Unsubscribe {
        return this.observeListQuery(
            this.getListKey(query, contextOverride),
            () => this.cacheReadList(query, contextOverride),
            callback
        );
    }

    public async cacheWrite(
        item: Partial<DomainUser>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const id = this.assertRequiredString(item.id, 'id');
        const existing = await this.cacheStorage.load(id);
        const context = this.getContext(contextOverride);

        // Channel membership is preserved by unioning the mapped `channelIds`.
        const channelIds = Array.from(new Set([...(existing?.channelIds || []), ...(item.channelIds || [])]));

        const merged: DomainUser = {
            ...(existing ?? ({} as DomainUser)),
            ...item,
            id,
            cid: item.cid || existing?.cid || context.cid || 'default',
            channelIds,
        };

        await this.cacheStorage.save(id, merged);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(this.getAffectedListPrefixes([existing, merged], contextOverride));
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));

        const mergedList = validItems.map((item, index) => {
            const existing = existingItems[index];
            const channelIds = Array.from(new Set([...(existing?.channelIds || []), ...(item.channelIds || [])]));

            return {
                ...(existing ?? ({} as DomainUser)),
                ...item,
                id: item.id!,
                cid: item.cid || existing?.cid || context.cid || 'default',
                channelIds,
            } as DomainUser;
        });

        await this.cacheStorage.saveAll(mergedList);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit(this.getAffectedListPrefixes([...existingItems, ...mergedList], contextOverride));
    }

    public async cacheDelete(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const requiredId = this.assertRequiredString(id, 'id');
        const existing = await this.cacheStorage.load(requiredId);
        await this.cacheStorage.delete(requiredId);
        this.scheduleItemReemit([requiredId]);
        this.scheduleListReemit(this.getAffectedListPrefixes(existing ? [existing] : [], contextOverride));
    }

    public async cacheDeleteMany(ids: string[], contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        const existingItems = await Promise.all(validIds.map(id => this.cacheStorage.load(id)));
        await this.cacheStorage.deleteAll(validIds);
        this.scheduleItemReemit(validIds);
        this.scheduleListReemit(this.getAffectedListPrefixes(existingItems, contextOverride));
    }

    public async cacheClear(_contextOverride?: LocalDataSourceV2ContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.scheduleFullReemit();
    }

    private getListKey(query: ChatUsersInput, contextOverride?: LocalDataSourceV2ContextOverride): string {
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
        contextOverride?: LocalDataSourceV2ContextOverride
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
