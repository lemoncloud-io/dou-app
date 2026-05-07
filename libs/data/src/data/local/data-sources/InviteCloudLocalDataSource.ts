import type { CacheCloudView } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

export interface IInviteCloudLocalDataSource {
    /** 초대 cloud 정보를 저장합니다. */
    saveInviteCloud(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInviteCloud(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView | null>;

    /** 저장된 초대 cloud 전체를 조회합니다. */
    getInviteClouds(contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView[]>;

    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInviteCloud(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 다중 초대 cloud 정보를 삭제합니다. */
    deleteInviteClouds(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;

    /** 초대 cloud 일부 필드만 병합 업데이트합니다. */
    updateInviteCloudPartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;

    /** 초대 cloud 캐시를 초기화합니다. */
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** 초대 cloud 캐시의 local-only CRUD를 담당합니다. */
export class InviteCloudLocalDataSource extends BaseLocalDataSource implements IInviteCloudLocalDataSource {
    private static readonly GLOBAL_UID = 'global';

    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'invitecloud'>
    ) {
        super(contextProvider);
    }

    private normalizeInviteCloud(
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

    /**
     * * Storage 접근 시 강제로 GLOBAL_UID를 주입하여 실행하는 래퍼 함수
     */
    private async runWithGlobalUid<T>(
        override: LocalDataSourceContextOverride | undefined,
        run: () => Promise<T>
    ): Promise<T> {
        const original = this.contextProvider.getContext();
        // 무조건 uid를 GLOBAL_UID로 덮어씌움
        const mergedOverride = { ...(override || {}), uid: InviteCloudLocalDataSource.GLOBAL_UID };

        this.contextProvider.setContext({ ...original, ...mergedOverride });
        try {
            return await run();
        } finally {
            this.contextProvider.setContext(original);
        }
    }

    public async saveInviteCloud(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        await this.runWithGlobalUid(contextOverride, async () => {
            const existing = await this.cacheStorage.load(id);
            const normalized = this.normalizeInviteCloud(id, { ...(existing ?? {}), ...invite }, contextOverride);
            await this.cacheStorage.save(id, normalized);
        });
    }

    public async getInviteCloud(
        id: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView | null> {
        if (!id) return null;
        const cached = await this.runWithGlobalUid(contextOverride, () => this.cacheStorage.load(id));
        if (!cached) return null;
        return { ...cached };
    }

    public async getInviteClouds(contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView[]> {
        const cached = await this.runWithGlobalUid(contextOverride, () => this.cacheStorage.loadAll());
        return cached.map(item => ({ ...item }));
    }

    public async deleteInviteCloud(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.runWithGlobalUid(contextOverride, () => this.cacheStorage.delete(id));
    }

    public async deleteInviteClouds(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.runWithGlobalUid(contextOverride, () => this.cacheStorage.deleteAll(validIds));
    }

    public async updateInviteCloudPartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        await this.runWithGlobalUid(contextOverride, async () => {
            const existing = await this.cacheStorage.load(id);
            if (!existing) return;
            const normalized = this.normalizeInviteCloud(id, { ...existing, ...patch }, contextOverride);
            await this.cacheStorage.save(id, normalized);
        });
    }

    public async clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.runWithGlobalUid(contextOverride, () => this.cacheStorage.clearAll());
    }
}
