import type { ProfileSetInput } from '@lemoncloud/chatic-sockets-lib';
import type { ProfileBody, SiteProfileSyncView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../domain';
import { toDomainProfile } from '../domain';
import type { IProfileLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IProfileRemoteDataSource } from '../remote/data-sources';
import { BaseRepositoryV2, type DataContextProviderV2, type DisposableRepositoryV2 } from './types';

export interface ProfileSyncResult {
    syncedAt: number;
    updatedCount: number;
    removedCount: number;
}

export interface IProfileRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: DomainProfileListPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainProfile | null) => void): () => void;

    /** profile.get — id(`${sid}:${uid}`) 기반 단건 조회 후 local 반영. */
    refreshItem(id: string): Promise<DomainProfile | null>;
    /** profile.get-mine — 현재 세션 기반 내 프로필 조회 후 local 반영. */
    getMyProfile(): Promise<DomainProfile | null>;
    /** profile.set — 프로필 저장(optimistic). */
    setProfile(payload: ProfileSetInput): Promise<DomainProfile>;
    /** profile.set — 현재 사이트 내 프로필 저장. */
    setMyProfile(body: ProfileBody): Promise<DomainProfile>;
    /** profile.sync — 사이트 멀티프로필 delta 동기화 결과를 local에 upsert/remove. */
    syncProfiles(since: number): Promise<ProfileSyncResult>;

    cacheRead(id: string): Promise<DomainProfile | null>;
    cacheReadList(query?: DomainProfileListPayload): Promise<DomainListResult<DomainProfile> | null>;
    cacheWrite(item: Partial<DomainProfile>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Coordinates optimistic profile updates while keeping local cache keyed by normalized sid/uid pairs. */
export class ProfileRepositoryV2 extends BaseRepositoryV2 implements IProfileRepositoryV2 {
    constructor(
        private readonly profileRemoteDataSource: IProfileRemoteDataSource,
        private readonly profileLocalDataSource: IProfileLocalDataSourceV2,
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
    }

    public observeList(
        query: DomainProfileListPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void {
        return this.profileLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainProfile | null) => void): () => void {
        return this.profileLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainProfile | null> {
        return this.profileLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query?: DomainProfileListPayload): Promise<DomainListResult<DomainProfile> | null> {
        return this.profileLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainProfile>): Promise<void> {
        return this.profileLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.profileLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.profileLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshItem(id: string): Promise<DomainProfile | null> {
        const requiredId = this.assertRequiredString(id, 'id');
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();

        const remote = await this.profileRemoteDataSource.get({ id: requiredId });
        const domain = this.toDomainFromView(remote, requestScope);

        if (this.isSameContext(requestContext)) {
            await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async getMyProfile(): Promise<DomainProfile | null> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();

        const remote = await this.profileRemoteDataSource.getMine({});
        const domain = this.toDomainFromView(remote, requestScope);

        if (this.isSameContext(requestContext)) {
            await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async setProfile(payload: ProfileSetInput): Promise<DomainProfile> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const input = payload as { siteId?: string; userId?: string; active?: boolean };
        const sid = this.assertRequiredString(input.siteId || requestScope.sid, 'sid');
        const uid = this.assertRequiredString(input.userId || requestScope.uid, 'uid');
        const profileId = this.makeProfileId(sid, uid);
        const existing = profileId ? await this.profileLocalDataSource.cacheRead(profileId, requestContext) : null;

        if (profileId) {
            if (input.active === false) {
                await this.profileLocalDataSource.cacheDelete(profileId, requestContext);
            } else {
                await this.profileLocalDataSource.cacheWrite(
                    {
                        ...(existing ?? {}),
                        ...(payload as Partial<DomainProfile>),
                        id: profileId,
                        sid,
                        siteId: sid,
                        uid,
                        userId: uid,
                    },
                    requestContext
                );
            }
        }

        try {
            const remote = await this.profileRemoteDataSource.set({
                ...(payload as object),
                siteId: sid,
                userId: uid,
            } as ProfileSetInput);
            const domain = this.toDomainFromView(remote, { cid: requestScope.cid, sid, uid });

            if (this.isSameContext(requestContext)) {
                if (input.active === false || domain.active === false) {
                    await this.profileLocalDataSource.cacheDelete(domain.id, requestContext);
                } else {
                    await this.profileLocalDataSource.cacheWrite(domain, requestContext);
                }
            }
            return domain;
        } catch (error) {
            if (profileId) {
                if (existing) {
                    await this.profileLocalDataSource.cacheWrite(existing, requestContext);
                } else {
                    await this.profileLocalDataSource.cacheDelete(profileId, requestContext);
                }
            }
            throw error;
        }
    }

    public setMyProfile(body: ProfileBody): Promise<DomainProfile> {
        const sid = this.assertRequiredString(this.getDomainScope().sid, 'sid');
        return this.setProfile({ ...body, siteId: sid } as ProfileSetInput);
    }

    public async syncProfiles(since: number): Promise<ProfileSyncResult> {
        const requestContext = this.getRepositoryContext();
        const requestScope = this.getDomainScope();
        const sid = this.assertRequiredString(requestScope.sid, 'sid');

        const remote = (await this.profileRemoteDataSource.sync({ since })) as unknown as SiteProfileSyncView;

        if (!this.isSameContext(requestContext)) {
            return { syncedAt: remote?.syncedAt ?? since, updatedCount: 0, removedCount: 0 };
        }

        const profiles = (remote?.profiles || {}) as Record<string, Record<string, unknown> | null>;
        const upserts: Array<Partial<DomainProfile>> = [];
        const removals: string[] = [];

        for (const [uid, profile] of Object.entries(profiles)) {
            const id = this.makeProfileId(sid, uid);
            if (!profile) {
                removals.push(id);
                continue;
            }
            upserts.push(
                toDomainProfile(
                    {
                        ...profile,
                        id,
                        sid,
                        siteId: sid,
                        uid,
                        userId: uid,
                        cid: requestScope.cid,
                    } as Partial<DomainProfile>,
                    { cid: requestScope.cid, sid, uid }
                )
            );
        }

        if (upserts.length > 0) {
            await this.profileLocalDataSource.cacheWriteMany(upserts, requestContext);
        }
        if (removals.length > 0) {
            await this.profileLocalDataSource.cacheDeleteMany(removals, requestContext);
        }

        return { syncedAt: remote?.syncedAt ?? since, updatedCount: upserts.length, removedCount: removals.length };
    }

    private toDomainFromView(view: unknown, scope: { cid: string; sid?: string; uid?: string }): DomainProfile {
        const source = (view ?? {}) as { siteId?: string; userId?: string };
        const sid = source.siteId || scope.sid || '';
        const uid = source.userId || scope.uid || '';
        return toDomainProfile(
            {
                ...(source as Partial<DomainProfile>),
                id: this.makeProfileId(sid, uid),
                sid,
                siteId: sid,
                uid,
                userId: uid,
                cid: scope.cid,
            } as Partial<DomainProfile>,
            { cid: scope.cid, sid, uid }
        );
    }

    private makeProfileId(sid: string, uid: string): string {
        return sid && uid ? `${sid}:${uid}` : '';
    }
}
