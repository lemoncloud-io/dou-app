import type { ChatUsersInput } from '@lemoncloud/chatic-sockets-api';
import type { CacheStorage, CacheStorageItem } from '../storages';
import {
    BaseLocalDataSource,
    type ICrudLocalDataSource,
    type IListLocalDataSource,
    type IStreamLocalDataSource,
    type LocalDataSourceContextOverride,
    type LocalStreamCallback,
    type LocalStreamUnsubscribe,
} from './types';
import type { DataContextProvider } from '../../repositories';
import { toDomainUser } from './mappers';
import { createDomainListResult, type DomainListResult, type DomainUser } from '../../domain';
import { toDomainUser as toDomainUserBase } from '../../domain';

export interface IUserLocalDataSource
    extends ICrudLocalDataSource<DomainUser>,
        IListLocalDataSource<DomainUser, ChatUsersInput>,
        IStreamLocalDataSource<DomainUser, ChatUsersInput, DomainListResult<DomainUser>> {
    /** 다수 사용자 id로 사용자 목록을 조회합니다. (User 도메인 특화 로직) */
    getUsers(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]>;
}

/** 사용자 캐시 read/write와 채널 멤버 조회 결과 가공을 담당합니다. */
export class UserLocalDataSource extends BaseLocalDataSource implements IUserLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'user'>
    ) {
        super(contextProvider);
    }

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser | null> {
        const user = await this.cacheStorage.load(id);
        return user ? toDomainUser(user) : null;
    }

    public async upsert(
        user: Partial<DomainUser>,
        contextOverride?: LocalDataSourceContextOverride,
        emitStream = true
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
        if (emitStream) {
            this.debouncedEmitAllStreams();
        }
    }

    public async upsertMany(
        users: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(users.map(user => this.upsert(user, contextOverride, false)));
        this.debouncedEmitAllStreams();
    }

    public async remove(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
        this.debouncedEmitAllStreams();
    }

    public async removeMany(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        this.debouncedEmitAllStreams();
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
        this.debouncedEmitAllStreams();
    }

    // =========================================================================
    // 2. 특수 도메인 로직
    // =========================================================================

    public async getUsers(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser[]> {
        if (ids.length === 0) return [];
        const users = await Promise.all(ids.map(id => this.cacheStorage.load(id)));
        return users.filter((user): user is CacheStorageItem<'user'> => !!user).map(toDomainUser);
    }

    // =========================================================================
    // 3. 공통 List/Stream 인터페이스
    // =========================================================================

    public async fetchList(
        payload: ChatUsersInput,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainUser> | null> {
        const channelId = payload.channelId;
        const allUsers = await this.cacheStorage.loadAll();
        let users = allUsers.map(toDomainUser);

        // 기존 getUsersByChannel 로직을 fetchList 내부로 통합
        if (channelId) {
            users = users.filter(user => {
                const joinChannelId = (user as { $join?: { channelId?: string } }).$join?.channelId;
                const directChannelId = (user as { channelId?: string }).channelId;
                return joinChannelId === channelId || directChannelId === channelId;
            });
        }

        if (users.length === 0) {
            return createDomainListResult([], {
                total: 0,
                page: payload.page,
                limit: payload.limit,
                source: 'local',
            });
        }

        return createDomainListResult(users, {
            total: users.length,
            page: payload.page,
            limit: payload.limit,
            source: 'local',
        });
    }

    public subscribeList(
        query: ChatUsersInput,
        callback: LocalStreamCallback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(query, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainUser | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
