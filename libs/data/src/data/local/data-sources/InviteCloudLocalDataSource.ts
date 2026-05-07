import type { CacheCloudView } from '@chatic/app-messages';
import type { CacheStorage } from '../storages';
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
import { createDomainListResult, type DomainListResult } from '../../domain';

export interface IInviteCloudLocalDataSource
    extends ICrudLocalDataSource<CacheCloudView>,
        IListLocalDataSource<CacheCloudView, void, DomainListResult<CacheCloudView>>,
        IStreamLocalDataSource<CacheCloudView, void, DomainListResult<CacheCloudView>> {
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

    /** 초대 cloud 전체 목록을 스트림으로 구독합니다. */
    subscribeInviteClouds(
        callback: LocalStreamCallback<CacheCloudView[]>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;

    /** 단일 초대 cloud 조회 결과를 스트림으로 구독합니다. */
    subscribeInviteCloud(
        id: string,
        callback: LocalStreamCallback<CacheCloudView | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
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
        const context = this.getContext(contextOverride);
        return {
            ...(invite as CacheCloudView),
            id,
            cid: invite.cid || context.cid || this.getCid(contextOverride),
        };
    }

    /**
     * * Storage 접근 시 강제로 GLOBAL_CID 및 GLOBAL_UID를 주입하여 실행하는 래퍼 함수
     */
    private async runWithGlobalContext<T>(
        override: LocalDataSourceContextOverride | undefined,
        run: () => Promise<T>
    ): Promise<T> {
        const original = this.contextProvider.getContext();
        // 무조건 uid를 GLOBAL_UID로 덮어씌움
        const mergedOverride = {
            ...(override || {}),
            cid: InviteCloudLocalDataSource.GLOBAL_CID,
            uid: InviteCloudLocalDataSource.GLOBAL_UID,
        };

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
        await this.runWithGlobalContext(contextOverride, async () => {
            const existing = await this.cacheStorage.load(id);
            const normalized = this.normalizeInviteCloud(id, { ...(existing ?? {}), ...invite }, contextOverride);
            await this.cacheStorage.save(id, normalized);
        });
        await this.emitAllStreams();
    }

    public async getInviteCloud(
        id: string,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<CacheCloudView | null> {
        if (!id) return null;
        const cached = await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.load(id));
        if (!cached) return null;
        return { ...cached };
    }

    public async getInviteClouds(contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView[]> {
        const cached = await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.loadAll());
        return cached.map(item => ({ ...item }));
    }

    public async deleteInviteCloud(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.delete(id));
        await this.emitAllStreams();
    }

    public async deleteInviteClouds(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.deleteAll(validIds));
        await this.emitAllStreams();
    }

    public async updateInviteCloudPartial(
        id: string,
        patch: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (!id) return;
        await this.runWithGlobalContext(contextOverride, async () => {
            const existing = await this.cacheStorage.load(id);
            if (!existing) return;
            const normalized = this.normalizeInviteCloud(id, { ...existing, ...patch }, contextOverride);
            await this.cacheStorage.save(id, normalized);
        });
        await this.emitAllStreams();
    }

    public async clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.clearAll());
        await this.emitAllStreams();
    }

    /** 로컬 초대 cloud 목록 스냅샷을 지속 구독합니다. */
    public subscribeInviteClouds(
        callback: LocalStreamCallback<CacheCloudView[]>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getInviteClouds(contextOverride), callback);
    }

    /** 로컬 단일 초대 cloud 스냅샷을 지속 구독합니다. */
    public subscribeInviteCloud(
        id: string,
        callback: LocalStreamCallback<CacheCloudView | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getInviteCloud(id, contextOverride), callback);
    }

    /** 공통 CRUD 인터페이스: 리스트 조회 */
    public async fetchList(
        _query: void,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<CacheCloudView> | null> {
        const list = await this.getInviteClouds(contextOverride);
        return createDomainListResult({ list, total: list.length }, { source: 'local' });
    }

    /** 공통 CRUD 인터페이스: 단건 조회 */
    public getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView | null> {
        return this.getInviteCloud(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 단건 저장 */
    public upsert(item: Partial<CacheCloudView>, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const id = item.id || '';
        return this.saveInviteCloud(id, item, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 저장 */
    public async upsertMany(
        items: Array<Partial<CacheCloudView>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(
            items.filter(item => !!item.id).map(item => this.saveInviteCloud(item.id || '', item, contextOverride))
        );
    }

    /** 공통 CRUD 인터페이스: 단건 삭제 */
    public remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteInviteCloud(id, contextOverride);
    }

    /** 공통 CRUD 인터페이스: 다건 삭제 */
    public removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        return this.deleteInviteClouds(ids, contextOverride);
    }

    /** 공통 Stream 인터페이스: 리스트 구독 */
    public subscribeList(
        _query: void,
        callback: LocalStreamCallback<DomainListResult<CacheCloudView> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(undefined, contextOverride), callback);
    }

    /** 공통 Stream 인터페이스: 단건 구독 */
    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<CacheCloudView | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeInviteCloud(id, callback, contextOverride);
    }
}
