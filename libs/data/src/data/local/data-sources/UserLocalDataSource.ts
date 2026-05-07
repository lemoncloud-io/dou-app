import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';
import type { ListResult } from '../../events/types';
import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainUser } from './mappers';
import type { DomainUser } from '../../domain';
import { toDomainUser as toDomainUserBase } from '../../domain';

export interface IUserLocalDataSource {
    /** 사용자 목록을 로컬 캐시에서 조회합니다. */
    fetchUsers(
        payload: ChatUsersPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<DomainUser> | null>;
    /** 단일 사용자를 id로 조회합니다. */
    getUser(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser | null>;
    /** 다수 사용자 id로 사용자 목록을 조회합니다. */
    getUsers(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]>;
    /** 채널 기준으로 사용자 목록을 조회합니다. */
    getUsersByChannel(channelId: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]>;
    /** 단일 사용자 정보를 저장/병합합니다. */
    upsertUser(user: Partial<DomainUser>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다수 사용자 정보를 저장/병합합니다. */
    upsertUsers(users: Array<Partial<DomainUser>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 사용자 정보를 삭제합니다. */
    deleteUser(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다중 사용자 정보를 삭제합니다. */
    deleteUsers(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 사용자 일부 필드만 병합 업데이트합니다. */
    updateUserPartial(
        id: string,
        patch: Partial<DomainUser>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
    /** 현재 스코프 사용자 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** 사용자 캐시 read/write와 채널 멤버 조회 결과 가공을 담당합니다. */
export class UserLocalDataSource extends BaseLocalDataSource implements IUserLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'user'>
    ) {
        super(contextProvider);
    }

    public async fetchUsers(
        payload: ChatUsersPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<ListResult<DomainUser> | null> {
        // channelId 우선, 없으면 userIds, 둘 다 없으면 전체 캐시를 조회합니다.
        const channelId = payload.channelId;
        const userIds = this.getPayloadUserIds(payload);
        const users = channelId
            ? await this.getUsersByChannel(channelId, contextOverride)
            : userIds.length > 0
              ? await this.getUsers(userIds, contextOverride)
              : (await this.cacheStorage.loadAll()).map(toDomainUser);

        if (users.length === 0) return null;

        return {
            list: users,
            total: users.length,
            limit: (payload as { limit?: number }).limit,
            page: (payload as { page?: number }).page,
        };
    }

    public async getUser(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser | null> {
        const user = await this.cacheStorage.load(id);
        return user ? toDomainUser(user) : null;
    }

    public async getUsers(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]> {
        if (ids.length === 0) return [];
        const users = await Promise.all(ids.map(id => this.cacheStorage.load(id)));
        return users.filter((user): user is CacheStorageItem<'user'> => !!user).map(toDomainUser);
    }

    public async getUsersByChannel(
        channelId: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainUser[]> {
        if (!channelId) return [];
        const users = (await this.cacheStorage.loadAll()).map(toDomainUser);
        return users.filter(user => {
            const joinChannelId = (user as { $join?: { channelId?: string } }).$join?.channelId;
            const directChannelId = (user as { channelId?: string }).channelId;
            return joinChannelId === channelId || directChannelId === channelId;
        });
    }

    public async upsertUser(
        user: Partial<DomainUser>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = user.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const normalized = toDomainUserBase(
            {
                ...(existing ?? {}),
                ...(user as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainUser>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );

        const cacheItem: CacheStorageItem<'user'> = normalized as CacheStorageItem<'user'>;
        await this.cacheStorage.save(id, cacheItem);
    }

    public async upsertUsers(
        users: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(users.map(user => this.upsertUser(user, contextOverride)));
    }

    public async deleteUser(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async deleteUsers(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
    }

    public async updateUserPartial(
        id: string,
        patch: Partial<DomainUser>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.upsertUser({ ...existing, ...patch }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }

    private getPayloadUserIds(payload: ChatUsersPayload): string[] {
        const maybePayload = payload as { userIds?: string[]; ids?: string[] };
        return maybePayload.userIds ?? maybePayload.ids ?? [];
    }
}
