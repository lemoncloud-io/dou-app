import type { ChatUsersInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainListResult, DomainUser } from '../../domain';
import { createDomainListResult, toDomainUser } from '../../domain';
import type { DataContextProvider } from '../../repositories';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSourceV2,
    type ILocalDataSourceV2,
    type LocalDataSourceV2Callback,
    type LocalDataSourceV2ContextOverride,
    type LocalDataSourceV2Unsubscribe,
} from './types';

type UserCache = CacheStorageItem<'user'>;

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

    public async cacheRead(id: string, contextOverride?: LocalDataSourceV2ContextOverride): Promise<DomainUser | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const item = await this.cacheStorage.load(requiredId);
        return item ? toDomainUser(item, this.getReadScope(item, contextOverride)) : null;
    }

    public async cacheReadMany(
        ids: string[],
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainUser[]> {
        if (ids.length === 0) return [];
        const items = await Promise.all(ids.map(id => this.cacheStorage.load(id)));
        return items
            .filter((item): item is UserCache => !!item)
            .map(item => toDomainUser(item, this.getReadScope(item, contextOverride)));
    }

    public async cacheReadList(
        query: ChatUsersInput,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<DomainListResult<DomainUser> | null> {
        const allUsers = await this.cacheStorage.loadAll();
        let users = allUsers.map(item => toDomainUser(item, this.getReadScope(item, contextOverride)));

        if (query.channelId) {
            users = users.filter(user => {
                const joinChannelId = (user as { $join?: { channelId?: string } }).$join?.channelId;
                const directChannelId = (user as { channelId?: string }).channelId;
                return joinChannelId === query.channelId || directChannelId === query.channelId;
            });
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
        const cid = context.cid || this.getCid(contextOverride);
        const normalized = toDomainUser(
            {
                ...(existing ?? {}),
                ...(item as Record<string, unknown>),
                cid,
            } as Partial<DomainUser>,
            {
                cid,
                sid: context.sid,
                uid: context.uid,
            }
        );
        await this.cacheStorage.save(id, normalized as UserCache);
        this.scheduleItemReemit([id]);
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                [existing, normalized].filter(isUserLike) as Array<UserCache | Partial<DomainUser>>,
                contextOverride
            )
        );
    }

    public async cacheWriteMany(
        items: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): Promise<void> {
        const validItems = items.filter(item => !!item.id);
        if (validItems.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const existingItems = await Promise.all(validItems.map(item => this.cacheStorage.load(item.id!)));
        const normalized = validItems.map(
            (item, index) =>
                toDomainUser(
                    {
                        ...(existingItems[index] ?? {}),
                        ...(item as Record<string, unknown>),
                        cid,
                    } as Partial<DomainUser>,
                    {
                        cid,
                        sid: context.sid,
                        uid: context.uid,
                    }
                ) as UserCache
        );
        await this.cacheStorage.saveAll(normalized);
        this.scheduleItemReemit(validItems.map(item => item.id!).filter(Boolean));
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                [...existingItems, ...normalized].filter(isUserLike) as Array<UserCache | Partial<DomainUser>>,
                contextOverride
            )
        );
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
        this.scheduleListReemit(
            this.getAffectedListPrefixes(
                existingItems.filter(isUserLike) as Array<UserCache | Partial<DomainUser>>,
                contextOverride
            )
        );
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
        users: Array<Partial<DomainUser> | UserCache>,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): string[] {
        const scopeKey = this.getScopeKey(contextOverride);
        const channelIds = new Set<string>();
        for (const user of users) {
            const directChannelId = (user as { channelId?: string }).channelId;
            const joinChannelId = (user as { $join?: { channelId?: string } }).$join?.channelId;
            if (directChannelId) channelIds.add(directChannelId);
            if (joinChannelId) channelIds.add(joinChannelId);
        }

        return [
            `${scopeKey}|users`,
            `${scopeKey}|users|channel:__all__`,
            ...Array.from(channelIds).map(channelId => `${scopeKey}|users|channel:${channelId}`),
        ];
    }

    private getReadScope(
        item: Partial<DomainUser> | undefined,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): { cid: string; sid?: string; uid?: string } {
        return {
            cid: (item as { cid?: string })?.cid || this.getCid(contextOverride),
            sid: this.getSid(contextOverride),
            uid: this.getUid(contextOverride),
        };
    }
}

const isUserLike = (value: UserCache | Partial<DomainUser> | null): value is UserCache | Partial<DomainUser> => {
    return !!value;
};
