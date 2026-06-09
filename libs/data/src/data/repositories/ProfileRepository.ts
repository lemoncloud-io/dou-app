import type { ProfileBody, ProfileView, SiteProfileSyncView } from '@lemoncloud/chatic-socials-api';
import type { WSSPayload } from '@lemoncloud/chatic-sockets-api';
import type { IProfileLocalDataSource } from '../local/data-sources';
import type { DomainEventMap } from '../events/types';
import type { IProfileRemoteDataSource } from '../remote/data-sources';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DataContextProvider, ILocalCacheMutationRepository, LocalCacheBulkPatch } from './types';
import type ISyncRepository from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { IEventBus } from '../events/eventBus';
import type { DomainListResult, DomainProfile } from '../domain';

/** `${sid}@${uid}` 형태의 캐시 키를 생성합니다. */
const buildProfileId = (sid: string | undefined, uid: string): string => `${sid ?? ''}@${uid}`;

/** 플레이스(사이트)별 표시 프로필 도메인의 Repository 공개 계약입니다. */
export interface IProfileRepository extends ILocalCacheMutationRepository<DomainProfile> {
    /** 본인 플레이스 프로필(폼 값)을 조회합니다. Display 캐시로 기록하지 않습니다. */
    getMyProfile(options?: RepositoryRequestOptions): Promise<ProfileView>;

    /** 본인 플레이스 프로필을 저장합니다. (optimistic) */
    setMyProfile(body: ProfileBody, options?: RepositoryRequestOptions): Promise<ProfileView>;

    /** 도달 가능한 사용자들의 표시 프로필을 동기화하고 캐시를 idempotent하게 갱신합니다. */
    syncProfiles(since: number, options?: RepositoryRequestOptions): Promise<SiteProfileSyncView>;

    /** 현재 스코프의 profile 로컬 캐시를 초기화합니다. */
    clearAll(): Promise<void>;

    /** 본인/타인 플레이스 프로필 변경(profile:update) 이벤트를 수신하는 리스너를 등록합니다. */
    onProfileUpdated(callback: (profile: ProfileView) => void): () => void;

    // --- 통합 스트림 인터페이스 ---
    /** 로컬 캐시 기준 표시 프로필 목록을 스트림으로 구독합니다. */
    subscribeList(
        payload: WSSPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void;

    /** 로컬 캐시 기준 단일 표시 프로필을 스트림으로 구독합니다. */
    subscribeItem(id: string, callback: (profile: DomainProfile | null) => void): () => void;
}

/** Remote profile API와 local profile cache를 중재합니다. */
export class ProfileRepository extends BaseRepository implements IProfileRepository, ISyncRepository {
    constructor(
        private readonly profileRemoteDataSource: IProfileRemoteDataSource,
        private readonly profileLocalDataSource: IProfileLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
    }
    sync(id?: string, meta?: Record<string, unknown>): Promise<void> {
        throw new Error('Method not implemented.');
    }

    public async getMyProfile(options?: RepositoryRequestOptions): Promise<ProfileView> {
        return this.requestRemote<ProfileView>(ref => this.profileRemoteDataSource.getMyProfile(ref), options);
    }

    public async setMyProfile(body: ProfileBody, options?: RepositoryRequestOptions): Promise<ProfileView> {
        const repositoryContext = this.getRepositoryContext();
        const domainScope = this.getDomainScope();
        const uid = domainScope.uid ?? '';
        const id = buildProfileId(domainScope.sid, uid);

        // optimistic 적용 전, 롤백을 위해 직전 캐시 값을 캡처합니다.
        const prior = uid ? await this.profileLocalDataSource.getById(id, repositoryContext) : null;

        if (uid) {
            if (body.active === false) {
                await this.profileLocalDataSource.remove(id, repositoryContext);
            } else {
                await this.profileLocalDataSource.upsert(
                    {
                        id,
                        cid: domainScope.cid,
                        sid: domainScope.sid,
                        uid,
                        nick: body.nick,
                        thumbnail: body.thumbnail,
                        updatedAt: Date.now(),
                    },
                    repositoryContext
                );
            }
        }

        try {
            const view = await this.requestRemote<ProfileView>(
                ref => this.profileRemoteDataSource.setMyProfile(body, ref),
                options
            );
            // The optimistic write keys by the local account uid, but my own
            // messages (and the sync delta) are keyed by the server's canonical
            // userId — which can differ. Mirror the write under that canonical id
            // (from the response) so every surface, not just the self avatar,
            // reflects the change. Sync keeps it fresh thereafter.
            const canonicalUid = view?.userId;
            if (canonicalUid && canonicalUid !== uid) {
                const canonicalId = buildProfileId(domainScope.sid, canonicalUid);
                if (body.active === false) {
                    await this.profileLocalDataSource.remove(canonicalId, repositoryContext);
                } else {
                    await this.profileLocalDataSource.upsert(
                        {
                            id: canonicalId,
                            cid: domainScope.cid,
                            sid: domainScope.sid,
                            uid: canonicalUid,
                            nick: body.nick,
                            thumbnail: body.thumbnail,
                            updatedAt: Date.now(),
                        },
                        repositoryContext
                    );
                }
            }
            return view;
        } catch (error) {
            // 실패 시 직전 값으로 롤백 — 이전에 값이 있었으면 복원, 없었으면 제거합니다.
            if (uid) {
                if (prior) {
                    await this.profileLocalDataSource.upsert(prior, repositoryContext);
                } else {
                    await this.profileLocalDataSource.remove(id, repositoryContext);
                }
            }
            throw error;
        }
    }

    public async syncProfiles(since: number, options?: RepositoryRequestOptions): Promise<SiteProfileSyncView> {
        const repositoryContext = this.getRepositoryContext();
        const domainScope = this.getDomainScope();

        const result = await this.requestRemote<SiteProfileSyncView>(
            ref => this.profileRemoteDataSource.syncProfiles(since, ref),
            options
        );

        // idempotent apply: null = 제거, 그 외 = upsert. key 부재는 변경 없음(여기 도착하지 않음).
        // requestRemote rejects on error, so `result` is always present here; the
        // guard belongs on `profiles` only if the server omits it (no changes).
        const entries = Object.entries(result.profiles ?? {});
        await Promise.all(
            entries.map(([uid, value]) => {
                const id = buildProfileId(domainScope.sid, uid);
                if (value === null) {
                    return this.profileLocalDataSource.remove(id, repositoryContext);
                }
                return this.profileLocalDataSource.upsert(
                    {
                        id,
                        cid: domainScope.cid,
                        sid: domainScope.sid,
                        uid,
                        nick: value.nick,
                        thumbnail: value.thumbnail,
                        updatedAt: value.updatedAt,
                    },
                    repositoryContext
                );
            })
        );

        return result;
    }

    public clearAll(): Promise<void> {
        return this.profileLocalDataSource.clearAll(this.getRepositoryContext());
    }

    public onProfileUpdated(callback: (profile: ProfileView) => void): () => void {
        return this.onDomainEvent('profile:update', detail => {
            callback(detail.data as ProfileView);
        });
    }

    // --- 스트림 인터페이스 통합 ---
    public subscribeList(
        payload: WSSPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void {
        return this.profileLocalDataSource.subscribeList(payload, callback, this.getRepositoryContext());
    }

    public subscribeItem(id: string, callback: (profile: DomainProfile | null) => void): () => void {
        return this.profileLocalDataSource.subscribeItem(id, callback, this.getRepositoryContext());
    }

    // --- Cache Mutations (통합) ---
    public cacheCreate(item: Partial<DomainProfile>): Promise<void> {
        return this.profileLocalDataSource.upsert(item, this.getRepositoryContext());
    }

    public cacheUpdate(id: string, patch: Partial<DomainProfile>): Promise<void> {
        return this.profileLocalDataSource.upsert({ id, ...patch }, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.profileLocalDataSource.remove(id, this.getRepositoryContext());
    }

    public cacheBulkCreate(items: Array<Partial<DomainProfile>>): Promise<void> {
        return this.profileLocalDataSource.upsertMany(items, this.getRepositoryContext());
    }

    public async cacheBulkUpdate(items: Array<LocalCacheBulkPatch<DomainProfile>>): Promise<void> {
        await Promise.all(
            items
                .filter(item => !!item.id)
                .map(item =>
                    this.profileLocalDataSource.upsert(
                        { id: item.id, ...item.patch },
                        this.getRepositoryContext()
                    )
                )
        );
    }
}
