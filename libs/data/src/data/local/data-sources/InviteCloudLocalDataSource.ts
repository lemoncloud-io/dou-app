import type { CacheCloudView } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
import { BaseLocalDataSource, type LocalDataSourceContextOverride } from './types';
import type { DataContextProvider } from '../../repositories';

export interface InviteCloudLoadQueryOptions {
    ignoreCid?: boolean;
    ignoreUid?: boolean;
    ignoreCidAndUid?: boolean;
}

export interface IInviteCloudLocalDataSource {
    /** 초대 cloud 정보를 저장합니다. */
    saveInviteCloud(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void>;

    /** 단일 초대 cloud 정보를 조회합니다. */
    getInviteCloud(
        id: string,
        options?: InviteCloudLoadQueryOptions,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView | null>;

    /** 저장된 초대 cloud 전체를 조회합니다. */
    getInviteClouds(
        options?: InviteCloudLoadQueryOptions,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView[]>;
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
    private static readonly GLOBAL_CID = 'global';
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
        const context = this.getContext({
            ...contextOverride,
            // invitecloud는 사용자별 분리가 아닌 글로벌 스코프로 관리합니다.
            uid: InviteCloudLocalDataSource.GLOBAL_UID,
        });
        return {
            ...(invite as CacheCloudView),
            id,
            cid: invite.cid || context.cid || this.getCid(contextOverride),
        };
    }

    public async saveInviteCloud(
        id: string,
        invite: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        const normalized = this.normalizeInviteCloud(id, { ...(existing ?? {}), ...invite }, contextOverride);
        await this.cacheStorage.save(id, normalized);
    }

    public async getInviteCloud(
        id: string,
        optionsOrContext?: InviteCloudLoadQueryOptions | LocalDataSourceContextOverride,
        contextOverrideArg?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView | null> {
        if (!id) return null;
        const { options, contextOverride } = this.resolveLoadArgs(optionsOrContext, contextOverrideArg);
        const scopedOverride = this.resolveScopedOverride(contextOverride, options);
        const cached = await this.runWithContextOverride(scopedOverride, () => this.cacheStorage.load(id));
        if (!cached) return null;
        return { ...cached };
    }

    public async getInviteClouds(
        optionsOrContext?: InviteCloudLoadQueryOptions | LocalDataSourceContextOverride,
        contextOverrideArg?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView[]> {
        const { options, contextOverride } = this.resolveLoadArgs(optionsOrContext, contextOverrideArg);
        const scopedOverride = this.resolveScopedOverride(contextOverride, options);
        const cached = await this.runWithContextOverride(scopedOverride, () => this.cacheStorage.loadAll());
        return cached.map(item => ({ ...item }));
    }

    public async deleteInviteCloud(id: string, _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.cacheStorage.delete(id);
    }

    public async deleteInviteClouds(ids: string[], _contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.cacheStorage.deleteAll(validIds);
    }

    public async updateInviteCloudPartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        const existing = await this.cacheStorage.load(id);
        if (!existing) return;
        await this.saveInviteCloud(id, { ...existing, ...patch, id }, contextOverride);
    }

    public async clearAll(_contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.cacheStorage.clearAll();
    }

    private resolveLoadArgs(
        optionsOrContext?: InviteCloudLoadQueryOptions | LocalDataSourceContextOverride,
        contextOverrideArg?: LocalDataSourceContextOverride
    ): { options?: InviteCloudLoadQueryOptions; contextOverride?: LocalDataSourceContextOverride } {
        if (
            optionsOrContext &&
            ('ignoreCid' in optionsOrContext ||
                'ignoreUid' in optionsOrContext ||
                'ignoreCidAndUid' in optionsOrContext)
        ) {
            return {
                options: optionsOrContext as InviteCloudLoadQueryOptions,
                contextOverride: contextOverrideArg,
            };
        }
        return {
            options: undefined,
            contextOverride: optionsOrContext as LocalDataSourceContextOverride | undefined,
        };
    }

    private resolveScopedOverride(
        contextOverride?: LocalDataSourceContextOverride,
        options?: InviteCloudLoadQueryOptions
    ): LocalDataSourceContextOverride | undefined {
        if (!options) return contextOverride;
        const ignoreCid = !!options.ignoreCid || !!options.ignoreCidAndUid;
        const ignoreUid = !!options.ignoreUid || !!options.ignoreCidAndUid;
        return {
            ...(contextOverride || {}),
            ...(ignoreCid ? { cid: InviteCloudLocalDataSource.GLOBAL_CID } : {}),
            ...(ignoreUid ? { uid: InviteCloudLocalDataSource.GLOBAL_UID } : {}),
        };
    }

    private async runWithContextOverride<T>(
        override: LocalDataSourceContextOverride | undefined,
        run: () => Promise<T>
    ): Promise<T> {
        if (!override) return run();
        const original = this.contextProvider.getContext();
        this.contextProvider.setContext({ ...original, ...override });
        try {
            return await run();
        } finally {
            this.contextProvider.setContext(original);
        }
    }
}
