import type { ProfileSetInput, ProfileSyncInput } from '@lemoncloud/chatic-sockets-lib';
import type { ProfileBody } from '@lemoncloud/chatic-socials-api';
import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '@chatic/data-model';
import type { IProfileLocalDataSource } from '@chatic/data-local';
import type { IProfileSocketDataSource } from '@chatic/data-api';
import type { DataContextProvider } from './types';
import { isNotFoundError } from './socketError';
import { BaseRepository, type DisposableRepository } from './types';

export interface ProfileSyncResult {
    syncedAt: number;
    updatedCount: number;
    removedCount: number;
}

export interface ProfileLoadResult {
    updatedCount: number;
    removedCount: number;
}

export interface IProfileRepository extends DisposableRepository {
    observeList(
        query: DomainProfileListPayload | undefined,
        callback: (result: DomainListResult<DomainProfile> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainProfile | null) => void): () => void;

    refreshItem(id: string): Promise<DomainProfile | null>;
    getMyProfile(): Promise<DomainProfile | null>;
    setMyProfile(body: ProfileBody, siteId: string): Promise<DomainProfile>;
    syncProfiles(since: number, siteId: string): Promise<ProfileSyncResult>;
    syncProfilesOf(userIds: string[], siteId: string): Promise<ProfileLoadResult>;

    cacheRead(id: string): Promise<DomainProfile | null>;
    cacheReadList(query?: DomainProfileListPayload): Promise<DomainListResult<DomainProfile> | null>;
    cacheWrite(item: Partial<DomainProfile>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

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

    private async setProfile(payload: ProfileSetInput): Promise<DomainProfile> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const input = payload as { siteId?: string; userId?: string; active?: boolean };
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

        const rollback = async () => {
            if (!profileId) return;
            if (existing) await this.profileLocalDataSource.cacheWrite(existing, requestContext);
            else await this.profileLocalDataSource.cacheDelete(profileId, requestContext);
        };

        const socketContext = { ...normalizedContext, sid, uid };
        const send = () =>
            this.profileSocketDataSource.set(
                {
                    ...(payload as object),
                    siteId: sid,
                    userId: uid,
                } as ProfileSetInput,
                socketContext
            );

        let domain: DomainProfile;
        try {
            domain = await send();
        } catch (error) {
            if (!isNotFoundError(error)) {
                await rollback();
                throw error;
            }
            try {
                const mine = await this.profileSocketDataSource.getMine({}, socketContext);
                const mineSid = mine?.siteId || mine?.sid;
                if (mineSid && mineSid !== sid) {
                    throw new Error(`[ProfileRepository] the session is on site ${mineSid}, not ${sid}`);
                }
                domain = await send();
            } catch (retryError) {
                await rollback();
                throw retryError;
            }
        }

        const landedSid = domain.sid || domain.siteId;
        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        if (landedSid && landedSid !== sid) {
            await rollback();
            throw new Error(`[ProfileRepository] profile.set landed on site ${landedSid}, not ${sid}`);
        }
        return domain;
    }

    public async setMyProfile(body: ProfileBody, siteId: string): Promise<DomainProfile> {
        const sid = this.assertRequiredString(siteId, 'siteId');
        return this.setProfile({ ...body, siteId: sid, active: true } as ProfileSetInput);
    }

    public async syncProfiles(since: number, siteId: string): Promise<ProfileSyncResult> {
        const { syncedAt, updatedCount, removedCount } = await this.applyProfileSync({ since }, siteId);
        return { syncedAt: syncedAt ?? since, updatedCount, removedCount };
    }

    public async syncProfilesOf(userIds: string[], siteId: string): Promise<ProfileLoadResult> {
        const ids = Array.from(new Set((userIds || []).filter(Boolean)));
        this.assertRequiredString(siteId, 'siteId');
        if (ids.length === 0) return { updatedCount: 0, removedCount: 0 };
        const { updatedCount, removedCount } = await this.applyProfileSync({ userIds: ids }, siteId);
        return { updatedCount, removedCount };
    }

    private async applyProfileSync(
        payload: ProfileSyncInput,
        siteId: string
    ): Promise<ProfileLoadResult & { syncedAt?: number }> {
        const requestContext = this.getRequestContext();
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };

        const { upserts, removals, syncedAt } = await this.profileSocketDataSource.sync(payload, normalizedContext);

        if (upserts.length > 0) {
            await this.profileLocalDataSource.cacheWriteMany(upserts, requestContext);
        }

        if (removals.length > 0) {
            await this.profileLocalDataSource.cacheDeleteMany(removals, requestContext);
        }

        return { syncedAt, updatedCount: upserts.length, removedCount: removals.length };
    }

    private makeProfileId(sid: string, uid: string): string {
        return sid && uid ? `${sid}@${uid}` : '';
    }
}
