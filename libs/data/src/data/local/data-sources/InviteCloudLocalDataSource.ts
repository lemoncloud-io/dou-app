import type { CacheStorage, CacheStorageItem } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

type InviteCloudCache = CacheStorageItem<'invitecloud'>;

export interface IInviteCloudLocalDataSource {
    /** 초대 cloud 정보를 저장합니다. */
    saveInvite(id: string, invite: InviteCloudCache, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 단일 초대 cloud 정보를 조회합니다. */
    getInvite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<InviteCloudCache | null>;
    /** 저장된 초대 cloud 전체를 조회합니다. */
    getInvites(contextOverride?: LocalDataSourceContextOverride): Promise<InviteCloudCache[]>;
    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInvite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 초대 cloud 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** 초대 cloud 캐시의 local-only CRUD를 담당합니다. */
export class InviteCloudLocalDataSource extends BaseLocalDataSource implements IInviteCloudLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'invitecloud'>
    ) {
        super(contextProvider);
    }

    public async saveInvite(
        id: string,
        invite: InviteCloudCache,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        await this.cacheStorage.save(id, {
            ...invite,
            id,
            cid: invite.cid || this.getCid(contextOverride),
        });
    }

    public async getInvite(
        id: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<InviteCloudCache | null> {
        if (!id) return null;
        return this.cacheStorage.load(id);
    }

    public async getInvites(_contextOverride?: LocalDataSourceContextOverride): Promise<InviteCloudCache[]> {
        return this.cacheStorage.loadAll();
    }

    public async deleteInvite(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }
}
