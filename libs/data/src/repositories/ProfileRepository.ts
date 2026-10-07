import type { ProfileSetInput } from '@lemoncloud/chatic-sockets-lib';
import type { ProfileBody } from '@lemoncloud/chatic-socials-api';
import type { DomainListResult, DomainProfile, DomainProfileListPayload } from '../domain';
import type { IProfileLocalDataSource } from '../local/data-sources';
import type { IProfileSocketDataSource } from '../remote/socket-data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

/**
 * Did a socket request fail with 404? The `:error` frame carries `errorCode`, but the socket library
 * rejects with an Error holding only the server's message, which by convention starts with the
 * status (`404 NOT FOUND - …`). Read the property when present, otherwise the prefix.
 *
 * The same leading-status reading as `getSocketErrorCode` in `@chatic/app-runtime` (and its copy in
 * apps/web), repeated here because this lib cannot depend on the runtime. A change to one belongs in
 * the others.
 */
const isNotFoundError = (error: unknown): boolean => {
    if ((error as { errorCode?: unknown } | null)?.errorCode === 404) return true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /^\s*404\b/.test(message);
};

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
    /**
     * profile.set — saves my profile. The server stores it on the site the session is on, whatever
     * the request names; `siteId` tags the optimistic row and is checked against the answer (a write
     * that landed on another site rejects). A 404 — no row on that site yet — is recovered once by
     * creating the row with `profile.get-mine`.
     */
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

    /** profile.set, optimistic — the body behind `setMyProfile`, its only caller. */
    private async setProfile(payload: ProfileSetInput): Promise<DomainProfile> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const input = payload as { siteId?: string; userId?: string; active?: boolean };
        // The caller names the site rather than this reading an ambient sid, which a site switch
        // pre-applies before the token commits. It tags the optimistic row and is what the answer is
        // checked against below; it does not decide where the server writes.
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

        // Undo the optimistic row. With no previous snapshot the row did not exist before this call,
        // so it is removed rather than left behind as a profile the server never stored.
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
            // `profile.set` only UPDATES (the server routes it to `updateSiteProfile`), so the first
            // write on a place where I have no row yet — a place I just created or just entered —
            // answers 404. `profile.get-mine` is a get-or-create: it makes the row (inactive, no
            // nick), after which the same write succeeds. Measured end to end against the server:
            // 404, then get-mine, then the identical set returned ok. One retry only; a second 404
            // is a real failure.
            try {
                // get-mine answers for the session's site. If that is not the site named, the retry
                // would create a row there and write this nick into it — stop before that happens.
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

        // `profile.set` writes to the site the socket SESSION is on and ignores the payload's
        // `siteId` (measured against the server: a write naming a new site updated the previous
        // site's profile). So the payload cannot steer the write — the response is the only place
        // the truth shows. When it names another site the write already happened there: cache that
        // row as the server now holds it, undo the optimistic one, and fail so the caller does not
        // report a profile saved on the place the user was looking at.
        const landedSid = domain.sid || domain.siteId;
        await this.profileLocalDataSource.cacheWrite(domain, requestContext);
        if (landedSid && landedSid !== sid) {
            await rollback();
            throw new Error(`[ProfileRepository] profile.set landed on site ${landedSid}, not ${sid}`);
        }
        return domain;
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

        // Null deltas are resets: drop the corresponding cache entries in the partition this sync was for.
        if (removals.length > 0) {
            await this.profileLocalDataSource.cacheDeleteMany(removals, requestContext);
        }

        return { syncedAt: syncedAt ?? since, updatedCount: upserts.length, removedCount: removals.length };
    }

    private makeProfileId(sid: string, uid: string): string {
        return sid && uid ? `${sid}@${uid}` : '';
    }
}
