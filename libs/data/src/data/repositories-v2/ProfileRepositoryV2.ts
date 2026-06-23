import type { ProfileSetInput } from '@lemoncloud/chatic-sockets-lib';
import type { ProfileBody } from '@lemoncloud/chatic-socials-api';
import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../domain';
import type { IProfileLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IProfileRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from '../repositories';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

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
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
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
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        const domain = await this.profileRemoteDataSource.get({ id: requiredId }, normalizedContext);

        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async getMyProfile(): Promise<DomainProfile | null> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        const domain = await this.profileRemoteDataSource.getMine({}, normalizedContext);

        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async setProfile(payload: ProfileSetInput): Promise<DomainProfile> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const input = payload as { siteId?: string; userId?: string; active?: boolean };
        const sid = this.assertRequiredString(input.siteId || normalizedContext.sid, 'sid');
        const uid = this.assertRequiredString(input.userId || normalizedContext.uid, 'uid');
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
            const domain = await this.profileRemoteDataSource.set(
                {
                    ...(payload as object),
                    siteId: sid,
                    userId: uid,
                } as ProfileSetInput,
                { ...normalizedContext, sid, uid }
            );

            if (input.active === false || domain.active === false) {
                await this.profileLocalDataSource.cacheDelete(domain.id, requestContext);
            } else {
                await this.profileLocalDataSource.cacheWrite(domain, requestContext);
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
        const normalizedContext = this.getNormalizedContext();
        const sid = this.assertRequiredString(normalizedContext.sid, 'sid');
        return this.setProfile({ ...body, siteId: sid } as ProfileSetInput);
    }

    public async syncProfiles(since: number): Promise<ProfileSyncResult> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        // Sync is scoped to the active site; fail fast if it is missing.
        this.assertRequiredString(normalizedContext.sid, 'sid');

        const { upserts, removals, syncedAt } = await this.profileRemoteDataSource.sync({ since }, normalizedContext);

        if (upserts.length > 0) {
            await this.profileLocalDataSource.cacheWriteMany(upserts, requestContext);
        }
        if (removals.length > 0) {
            await this.profileLocalDataSource.cacheDeleteMany(removals, requestContext);
        }

        return { syncedAt: syncedAt ?? since, updatedCount: upserts.length, removedCount: removals.length };
    }

    private makeProfileId(sid: string, uid: string): string {
        return sid && uid ? `${sid}:${uid}` : '';
    }
}
