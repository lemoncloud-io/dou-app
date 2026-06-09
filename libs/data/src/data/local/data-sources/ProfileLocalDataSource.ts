import type { WSSPayload } from '@lemoncloud/chatic-sockets-api';
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
import { toDomainProfile } from './mappers';
import { createDomainListResult, type DomainListResult, type DomainProfile } from '../../domain';
import { toDomainProfile as toDomainProfileBase } from '../../domain';

export interface IProfileLocalDataSource
    extends ICrudLocalDataSource<DomainProfile>,
        IListLocalDataSource<DomainProfile, WSSPayload | undefined>,
        IStreamLocalDataSource<DomainProfile, WSSPayload | undefined, DomainListResult<DomainProfile>> {}

type ProfileCache = CacheStorageItem<'profile'>;

/** 플레이스(사이트)별 표시 프로필 캐시 read/write를 담당합니다. */
export class ProfileLocalDataSource extends BaseLocalDataSource implements IProfileLocalDataSource {
    constructor(
        protected override readonly contextProvider: DataContextProvider,
        protected readonly cacheStorage: CacheStorage<'profile'>
    ) {
        super(contextProvider);
    }

    // =========================================================================
    // 1. 공통 CRUD 인터페이스 (ICrudLocalDataSource)
    // =========================================================================

    public async getById(
        id: string,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainProfile | null> {
        if (!id) return null;
        const item = await this.cacheStorage.load(id);
        return item ? toDomainProfile(item) : null;
    }

    public async upsert(
        profile: Partial<DomainProfile>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        const id = profile.id;
        if (!id) return;

        const context = this.getContext(contextOverride);
        const existing = await this.cacheStorage.load(id);
        const normalized = toDomainProfileBase(
            {
                ...(existing ?? {}),
                ...(profile as Record<string, unknown>),
                cid: context.cid || this.getCid(contextOverride),
            } as Partial<DomainProfile>,
            {
                cid: context.cid || this.getCid(contextOverride),
                sid: context.sid,
                uid: context.uid,
            }
        );
        const cacheItem: ProfileCache = normalized as ProfileCache;
        await this.cacheStorage.save(id, cacheItem);
        this.debouncedEmitAllStreams();
    }

    public async upsertMany(
        profiles: Array<Partial<DomainProfile>>,
        contextOverride?: LocalDataSourceContextOverride
    ): Promise<void> {
        if (profiles.length === 0) return;

        const context = this.getContext(contextOverride);
        const cid = context.cid || this.getCid(contextOverride);
        const baseScope = { cid, sid: context.sid, uid: context.uid };

        const existingItems = await Promise.all(
            profiles.map(profile => (profile.id ? this.cacheStorage.load(profile.id) : null))
        );

        const cacheItemsToSave: ProfileCache[] = [];
        profiles.forEach((profile, index) => {
            if (!profile.id) return;
            const existing = existingItems[index];
            const normalized = toDomainProfileBase(
                {
                    ...(existing ?? {}),
                    ...(profile as Record<string, unknown>),
                    cid,
                } as Partial<DomainProfile>,
                baseScope
            );
            cacheItemsToSave.push(normalized as ProfileCache);
        });

        if (cacheItemsToSave.length > 0) {
            await this.cacheStorage.saveAll(cacheItemsToSave);
            this.debouncedEmitAllStreams();
        }
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
    // 3. 공통 List/Stream 인터페이스
    // =========================================================================

    public async fetchList(
        _query: WSSPayload | undefined,
        _contextOverride?: LocalDataSourceContextOverride
    ): Promise<DomainListResult<DomainProfile> | null> {
        const profiles = await this.cacheStorage.loadAll();

        if (profiles.length === 0) {
            return createDomainListResult([], { total: 0, source: 'local' });
        }

        const domainProfiles = profiles.map(toDomainProfile);
        const sorted = domainProfiles.sort((left, right) => (left.uid || '').localeCompare(right.uid || ''));

        return createDomainListResult(sorted, {
            total: sorted.length,
            source: 'local',
        });
    }

    public subscribeList(
        query: WSSPayload | undefined,
        callback: LocalStreamCallback<DomainListResult<DomainProfile> | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.fetchList(query, contextOverride), callback);
    }

    public subscribeItem(
        id: string,
        callback: LocalStreamCallback<DomainProfile | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe {
        return this.subscribeQueryStream(() => this.getById(id, contextOverride), callback);
    }
}
