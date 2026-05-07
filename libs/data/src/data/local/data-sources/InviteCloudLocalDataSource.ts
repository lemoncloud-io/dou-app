import type { CacheCloudView } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

export interface IInviteCloudLocalDataSource {
    /** 초대 cloud 정보를 저장합니다. */
    saveInvite(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
    /** 단일 초대 cloud 정보를 조회합니다. */
    getInvite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView | null>;
    /** 저장된 초대 cloud 전체를 조회합니다. */
    getInvites(contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView[]>;
    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInvite(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 다중 초대 cloud 정보를 삭제합니다. */
    deleteInvites(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    /** 초대 cloud 일부 필드만 병합 업데이트합니다. */
    updateInvitePartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;
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

    private normalizeInvite(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): CacheCloudView {
        const context = this.getContext(contextOverride);
        return {
            ...(invite as CacheCloudView),
            id,
            cid: invite.cid || context.cid || this.getCid(contextOverride),
        };
    }

    public async saveInvite(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        const normalized = this.normalizeInvite(id, { ...(existing ?? {}), ...invite }, contextOverride);
        await this.cacheStorage.save(id, normalized);
    }

    public async getInvite(
        id: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView | null> {
        if (!id) return null;
        const cached = await this.cacheStorage.load(id);
        if (!cached) return null;
        return { ...cached };
    }

    public async getInvites(_contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView[]> {
        const cached = await this.cacheStorage.loadAll();
        return cached.map(item => ({ ...item }));
    }

    public async deleteInvite(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async deleteInvites(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
    }

    public async updateInvitePartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.saveInvite(id, { ...existing, ...patch, id }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }
}
