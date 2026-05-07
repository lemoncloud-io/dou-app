import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';
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
        IListLocalDataSource<DomainUser, ChatUsersPayload>,
        IStreamLocalDataSource<DomainUser, ChatUsersPayload, DomainListResult<DomainUser>> {
    /** 사용자 목록을 로컬 캐시에서 조회합니다. */
    fetchUsers(
        payload: ChatUsersPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainUser> | null>;

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

    /** 사용자 목록 조회 결과를 스트림으로 구독합니다. */
    subscribeUsers(
        payload: ChatUsersPayload,
        callback: LocalStreamCallback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;

    /** 단일 사용자 조회 결과를 스트림으로 구독합니다. */
    subscribeUser(
        id: string,
        callback: LocalStreamCallback<DomainUser | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
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
    ): Promise<DomainListResult<DomainUser> | null> {
        const channelId = payload.channelId;
        const users = channelId
            ? await this.getUsersByChannel(channelId, contextOverride)
            : (await this.cacheStorage.loadAll()).map(toDomainUser);

        if (users.length === 0) return null;

        return createDomainListResult(
            {
                list: users,
                total: users.length,
                page: payload.page,
                limit: payload.limit,
            },
            { source: 'local' }
        );
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
        await this.emitAllStreams();
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
        await this.emitAllStreams();
    }

    public async deleteUsers(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
        await this.emitAllStreams();
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
        await this.emitAllStreams();
    }

    /** 로컬 사용자 목록 스냅샷을 지속 구독합니다. */
    public subscribeUsers(
        payload: ChatUsersPayload,
        callback: LocalStreamCallback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchUsers(payload, contextOverride), callback);
    }

    /** 로컬 단일 사용자 스냅샷을 지속 구독합니다. */
    public subscribeUser(
        id: string,
        callback: LocalStreamCallback<DomainUser | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getUser(id, contextOverride), callback);
    }

    /** 공통 CRUD 인터페이스: 리스트 조회 */
    public fetchList(
        query: ChatUsersPayload,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainUser> | null> {
        return this.fetchUsers(query, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 조회 */
    public getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<DomainUser | null> {
        return this.getUser(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 저장 */
    public upsert(item: Partial<DomainUser>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.upsertUser(item, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 저장 */
    public upsertMany(
        items: Array<Partial<DomainUser>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        return this.upsertUsers(items, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 삭제 */
    public remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteUser(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 삭제 */
    public removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteUsers(ids, contextOverride);
    }

    /** 공통 Stream 인터페이스: 리스트 구독 */
    public subscribeList(
        query: ChatUsersPayload,
        callback: LocalStreamCallback<DomainListResult<DomainUser> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeUsers(query, callback, contextOverride);
    }

    /** 공통 Stream 인터페이스: 단건 구독 */
    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainUser | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeUser(id, callback, contextOverride);
    }
}
