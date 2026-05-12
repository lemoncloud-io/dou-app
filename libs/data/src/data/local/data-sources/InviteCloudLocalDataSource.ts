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

// 💡 중복된 도메인 특화 메서드를 모두 제거하고 공통 인터페이스만 확장합니다.
export interface IInviteCloudLocalDataSource
    extends ICrudLocalDataSource<CacheCloudView>,
        IListLocalDataSource<CacheCloudView, void, DomainListResult<CacheCloudView>>,
        IStreamLocalDataSource<CacheCloudView, void, DomainListResult<CacheCloudView>> {}

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
     * Storage 접근 시 강제로 GLOBAL_CID 및 GLOBAL_UID를 주입하여 실행하는 래퍼 함수
     */
    private async runWithGlobalContext<T>(
        override: LocalDataSourceContextOverride | undefined,
        run: () => Promise<T>
    ): Promise<T> {
        const original = this.contextProvider.getContext();
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

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<CacheCloudView | null> {
        if (!id) return null;
        const cached = await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.load(id));
        if (!cached) return null;
        return { ...cached };
    }

    public async upsert(
        item: Partial<CacheCloudView>,
        contextOverride?: LocalDataSourceContextOverride,
        emitStream = true
    ): Promise<void> {
        const id = item.id;
        if (!id) return;
        await this.runWithGlobalContext(contextOverride, async () => {
            const existing = await this.cacheStorage.load(id);
            // 병합 로직이 내장되어 있어 updatePartial 역할도 완벽히 수행합니다.
            const normalized = this.normalizeInviteCloud(id, { ...(existing ?? {}), ...item }, contextOverride);
            await this.cacheStorage.save(id, normalized);
        });
        if (emitStream) {
            this.debouncedEmitAllStreams();
        }
    }

    public async upsertMany(
        items: Array<Partial<CacheCloudView>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        await Promise.all(items.map(item => this.upsert(item, contextOverride, false)));
        this.debouncedEmitAllStreams();
    }

    public async remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        if (!id) return;
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.delete(id));
        this.debouncedEmitAllStreams();
    }

    public async removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        const validIds = ids.filter(Boolean);
        if (validIds.length === 0) return;
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.deleteAll(validIds));
        this.debouncedEmitAllStreams();
    }

    public async clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void> {
        await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.clearAll());
        this.debouncedEmitAllStreams();
    }

    // =========================================================================
    // 2. 공통 List 인터페이스 (IListLocalDataSource)
    // =========================================================================

    public async fetchList(
        _query: void,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<CacheCloudView> | null> {
        const cached = await this.runWithGlobalContext(contextOverride, () => this.cacheStorage.loadAll());
        const list = cached.map(item => ({ ...item }));

        // 빈 리스트일 때 null을 리턴하지 않고 빈 배열 결과를 리턴하여 무한 로딩 UI 방지
        if (list.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        return createDomainListResult(list, {
            total: list.length,
            source: 'local',
        });
    }

    // =========================================================================
    // 3. 공통 Stream 인터페이스 (IStreamLocalDataSource)
    // =========================================================================

    public subscribeList(
        _query: void,
        callback: LocalStreamCallback<DomainListResult<CacheCloudView> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(undefined, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<CacheCloudView | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
