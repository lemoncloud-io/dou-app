import type { ProfileSetInput } from '@lemoncloud/chatic-sockets-lib';
import type { ProfileBody } from '@lemoncloud/chatic-socials-api';
import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../domain';
import type { IProfileLocalDataSource } from '../local/data-sources';
import type { IProfileSocketDataSource } from '../remote/socket-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ProfileSyncResult {
    syncedAt: number;
    updatedCount: number;
    removedCount: number;
}

export interface IProfileRepository extends DisposableRepository {
    observeList(
        query: DomainProfileListPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainProfile | null) => void): () => void;

    /** profile.get — reads a single profile by id (`${sid}@${uid}`) and writes it to local. */
    refreshItem(id: string): Promise<DomainProfile | null>;
    /** profile.get-mine — reads my profile for the current session and writes it to local. */
    getMyProfile(): Promise<DomainProfile | null>;
    /** profile.set — saves a profile (optimistically). `payload.siteId` says which site. */
    setProfile(payload: ProfileSetInput): Promise<DomainProfile>;
    /** profile.set — saves my profile on `siteId`. The caller names the site; see ADR-0085. */
    setMyProfile(body: ProfileBody, siteId: string): Promise<DomainProfile>;
    /** profile.sync — upserts/removes the multi-profile delta sync result for `siteId` into local. */
    syncProfiles(since: number, siteId: string): Promise<ProfileSyncResult>;

    cacheRead(id: string): Promise<DomainProfile | null>;
    cacheReadList(query?: DomainProfileListPayload): Promise<DomainListResult<DomainProfile> | null>;
    cacheWrite(item: Partial<DomainProfile>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Coordinates optimistic profile updates while keeping local cache keyed by normalized sid/uid pairs. */
export class ProfileRepository extends BaseRepository implements IProfileRepository {
    constructor(
        private readonly profileSocketDataSource: IProfileSocketDataSource,
        private readonly profileLocalDataSource: IProfileLocalDataSource,
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

        const domain = await this.profileSocketDataSource.get({ id: requiredId }, normalizedContext);

        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async getMyProfile(): Promise<DomainProfile | null> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        const domain = await this.profileSocketDataSource.getMine({}, normalizedContext);

        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async setProfile(payload: ProfileSetInput): Promise<DomainProfile> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const input = payload as { siteId?: string; userId?: string; active?: boolean };
        // The payload names the site. It used to fall back to the ambient sid, which races a site
        // switch: `switchSite` pre-applies the sid before the token commits, so a write landing in
        // that window was tagged for one site and sent under another's session (ADR-0085).
        const sid = this.assertRequiredString(input.siteId, 'siteId');
        const uid = this.assertRequiredString(input.userId || normalizedContext.uid, 'uid');
        const profileId = this.makeProfileId(sid, uid);
        const existing = profileId ? await this.profileLocalDataSource.cacheRead(profileId, requestContext) : null;

        if (profileId) {
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

        try {
            const domain = await this.profileSocketDataSource.set(
                {
                    ...(payload as object),
                    siteId: sid,
                    userId: uid,
                } as ProfileSetInput,
                { ...normalizedContext, sid, uid }
            );

            await this.profileLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (profileId) {
                if (existing) {
                    await this.profileLocalDataSource.cacheWrite(existing, requestContext);
                }
            }
            throw error;
        }
    }

    // `async` so a missing siteId REJECTS rather than throwing synchronously out of a method that
    // declares `Promise` — a caller using `.catch()` instead of `await` would never see it otherwise.
    public async setMyProfile(body: ProfileBody, siteId: string): Promise<DomainProfile> {
        const sid = this.assertRequiredString(siteId, 'siteId');
        return this.setProfile({ ...body, siteId: sid, active: true } as ProfileSetInput);
    }

    public async syncProfiles(since: number, siteId: string): Promise<ProfileSyncResult> {
        const requestContext = this.getRequestContext();
        // Sync is scoped to ONE site and the response rows do not name it, so the caller's site id
        // is what the mapper stamps on them (ADR-0085). Fail fast rather than write unattributed rows.
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };

        const { upserts, removals, syncedAt } = await this.profileSocketDataSource.sync({ since }, normalizedContext);

        if (upserts.length > 0) {
            await this.profileLocalDataSource.cacheWriteMany(upserts, requestContext);
        }

        // Null deltas are resets: drop the corresponding cache entries under the live context.
        if (removals.length > 0) {
            await this.profileLocalDataSource.cacheDeleteMany(removals, requestContext);
        }

        return { syncedAt: syncedAt ?? since, updatedCount: upserts.length, removedCount: removals.length };
    }

    private makeProfileId(sid: string, uid: string): string {
        return sid && uid ? `${sid}@${uid}` : '';
    }
}
