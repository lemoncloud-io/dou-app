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
        // 소켓으로 수신한 프로필 변경(본인 응답/타인 브로드캐스트)을 즉시 Display
        // 캐시에 반영합니다 — 적용 없이는 subscribeList 스트림이 갱신되지 않아
        // 새로고침 전까지 옛 프로필이 보입니다. syncProfiles delta와 idempotent.
        this.onDomainEvent('profile:update', detail => {
            void this.applyProfileView(detail.data as ProfileView).catch(() => {
                // fail-soft: 적용 실패 시 다음 syncProfiles가 따라잡습니다.
            });
        });
        // 타인의 프로필 변경 브로드캐스트(channel.sync-site-profile → profile:sync)를
        // 즉시 캐시에 반영합니다. 이 리스너가 없으면 서버가 보내는 delta가 그대로
        // 버려져, 다른 사용자가 프로필을 바꿔도 새로고침(커서 pull) 전까지 반영되지
        // 않습니다. syncProfiles의 pull과 동일한 idempotent apply를 재사용합니다.
        this.onDomainEvent('profile:sync', detail => {
            void this.applySyncDelta(detail.data as SiteProfileSyncView).catch(() => {
                // fail-soft: 적용 실패 시 다음 syncProfiles가 따라잡습니다.
            });
        });
    }
    sync(_id?: string, _meta?: Record<string, unknown>): Promise<void> {
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
        const result = await this.requestRemote<SiteProfileSyncView>(
            ref => this.profileRemoteDataSource.syncProfiles(since, ref),
            options
        );

        await this.applySyncDelta(result);
        return result;
    }

    /**
     * SiteProfileSyncView delta를 현재 스코프의 Display 캐시에 idempotent하게 적용합니다.
     * null = 제거, 그 외 = upsert. (cursor pull과 실시간 profile:sync 브로드캐스트 공용)
     */
    private async applySyncDelta(view: SiteProfileSyncView): Promise<void> {
        const domainScope = this.getDomainScope();
        const repositoryContext = this.getRepositoryContext();
        const entries = Object.entries(view?.profiles ?? {});
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
    }

    public clearAll(): Promise<void> {
        return this.profileLocalDataSource.clearAll(this.getRepositoryContext());
    }

    /** profile:update 이벤트 한 건을 로컬 Display 캐시에 적용합니다. */
    private async applyProfileView(view: ProfileView | undefined): Promise<void> {
        const uid = view?.userId;
        if (!uid) return;
        const domainScope = this.getDomainScope();
        // 다른 플레이스의 이벤트가 현재 플레이스 캐시를 오염시키지 않게 가드합니다.
        if (view.siteId && domainScope.sid && view.siteId !== domainScope.sid) return;
        const sid = view.siteId ?? domainScope.sid;
        const id = buildProfileId(sid, uid);
        const repositoryContext = this.getRepositoryContext();
        if (view.active === false) {
            await this.profileLocalDataSource.remove(id, repositoryContext);
            return;
        }
        await this.profileLocalDataSource.upsert(
            {
                id,
                cid: domainScope.cid,
                sid,
                uid,
                nick: view.nick,
                thumbnail: view.thumbnail,
                updatedAt: view.updatedAt ?? Date.now(),
            },
            repositoryContext
        );
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
                    this.profileLocalDataSource.upsert({ id: item.id, ...item.patch }, this.getRepositoryContext())
                )
        );
    }
}
