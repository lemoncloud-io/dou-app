import type { ChannelGetSelfInput, ChatInviteInput, ChatLeaveInput } from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelStartDmInput,
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import { logger } from '@chatic/bridges';
import {
    dmPlaceOf,
    isCloudDm,
    type DomainChannel,
    type DomainChannelListPayload,
    type DomainListResult,
} from '../domain';
import type {
    IChannelLocalDataSource,
    IChatLocalDataSource,
    LocalDataSourceContextOverride,
} from '../local/data-sources';
import type { IChannelSocketDataSource } from '../remote/socket-data-sources';
import { forgetChannelCoverage } from './feedCoverage';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

/** Merge id lists without duplicates, preserving the existing order. */
const unionIds = (base: string[] | undefined, added: string[]): string[] =>
    Array.from(new Set([...(base ?? []), ...added]));

export interface SyncChannelsResult {
    syncedAt: number;
    removedCount: number;
}

export interface IChannelRepository extends DisposableRepository {
    observeList(
        query: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void,
        contextOverride?: LocalDataSourceContextOverride
    ): () => void;
    observeItem(id: string, callback: (item: DomainChannel | null) => void): () => void;

    /**
     * `channel.mine` — refreshes ONE site's list. `query.sid` is required: the answer describes
     * whichever site the socket session is on, so the caller's belief about that site is what tags
     * the rows and gates the prune below.
     */
    refreshList(query: DomainChannelListPayload & { sid: string }): Promise<void>;
    // Fetch the channel list (with detail) straight from the server WITHOUT touching the cache.
    // The cache keys channels by `cid:uid:id` with no sid and channel ids collide across places, so
    // it can only hold one place's channels at a time; a flat returned list lets a caller aggregate
    // unread across every place at once (the per-place badges).
    fetchList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel>>;
    // Cloud-wide delta sync (channel.sync) — pulls channels changed since the cursor across all
    // places and advances syncedAt. Named like profile.syncProfiles for consistency.
    syncChannels(since: number): Promise<SyncChannelsResult>;
    /** `channel.create` — `siteId` is the site the optimistic row is tagged with. */
    createChannel(payload: ChannelCreateInput, siteId: string): Promise<DomainChannel>;
    /**
     * Opens the 1:1 with one peer. Takes NO site: the server files the room under the place the
     * session is on when it answers, and the answer names it.
     */
    startDm(payload: ChannelStartDmInput): Promise<DomainChannel>;
    updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel>;
    inviteChannel(payload: ChatInviteInput): Promise<DomainChannel>;
    leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel>;
    deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel>;

    /**
     * Clears channels the server has already taken me out of — `place.leave` answers with them. Each
     * one gets what a confirmed self-leave of that channel gets: its row goes, the leave guard keeps a
     * late snapshot from putting it back, and its messages are purged. `requestContext` is the scope
     * the leave was asked in, so a cloud change while it ran cannot aim the clean-up at another cloud.
     */
    evictLeftChannels(channelIds: string[], requestContext: DataContext): Promise<void>;
    /**
     * Takes `userId` out of the cached `memberIds` of channels the server has already removed them
     * from — the cache side of a kick, for several channels at once. A channel this device has no row
     * for is skipped: there is nothing of it to correct.
     */
    dropMemberFromChannels(channelIds: string[], userId: string, requestContext: DataContext): Promise<void>;

    /** `channel.get-self` — `siteId` tags the returned row; the response carries no site. */
    getSelfChannel(payload: ChannelGetSelfInput | undefined, siteId: string): Promise<DomainChannel>;

    /**
     * `channel.get` — refreshes ONE channel's cached row. `siteId` tags the returned row; the
     * response carries no site. A push names its channel, so this is what a push-driven
     * badge refresh pulls instead of the whole `channel.mine` list.
     */
    refreshOne(channelId: string, siteId: string): Promise<DomainChannel>;

    /**
     * `refreshOne` for a channel whose place the caller does not know (a socket frame names only
     * the channel). The cached row's own sid tags the answer; `fallbackSiteId` covers a channel
     * never listed yet, whose row the next sync re-tags correctly.
     */
    refreshOneInCloud(channelId: string, fallbackSiteId: string): Promise<DomainChannel>;

    /** The cached row for `id` in the active cloud, or `null` — a one-shot read, no observer. */
    cacheRead(id: string): Promise<DomainChannel | null>;
    cacheReadList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel> | null>;
    cacheWrite(item: Partial<DomainChannel>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/**
 * How long a just-left channel stays barred from re-entering the cache.
 *
 * The guard exists for ONE race: a `refreshList`/`syncChannels` request issued before a leave or a
 * delete answers after it, and its snapshot still contains the channel I just removed. That window is the
 * lifetime of one in-flight request, so the guard is bounded by it.
 *
 * It must NOT outlive that. Held forever (as it was), the id also blocks the channel from coming
 * BACK — being re-invited leaves the room invisible until the next reload, because both ingestion
 * paths filter against this set and the repository instance lives for the whole session
 * (`DataManager` builds it once and only swaps context). ADR-0067.
 */
const LEFT_CHANNEL_GUARD_MS = 10_000;

/**
 * The same race the other way round: a list asked for just before I create or open a room answers
 * after it, and does not have the room yet. Its prune would delete the row the create just wrote, and
 * the room stays off the list until the next reload. The new id is spared from the prune for as long
 * as the leave guard bars a left one, and for the same reason no longer: a room removed on the server
 * meanwhile goes on the next sync after the window.
 */
const NEW_CHANNEL_GUARD_MS = LEFT_CHANNEL_GUARD_MS;

/** Whether `id`'s guard in `guards` is still standing; a lapsed entry is dropped on the way. */
const isGuarded = (guards: Map<string, number>, id: string): boolean => {
    const until = guards.get(id);
    if (until === undefined) return false;
    if (Date.now() < until) return true;
    guards.delete(id);
    return false;
};

/** Orchestrates channel list/detail caching and derived state updates for the active context. */
export class ChannelRepository extends BaseRepository implements IChannelRepository {
    /** channelId → the moment its leave guard lapses (see {@link LEFT_CHANNEL_GUARD_MS}). */
    private readonly leftChannelGuards = new Map<string, number>();
    /** channelId → the moment its new-room guard lapses (see {@link NEW_CHANNEL_GUARD_MS}). */
    private readonly newChannelGuards = new Map<string, number>();

    constructor(
        private readonly channelSocketDataSource: IChannelSocketDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSource,
        // Leaving a room has to clear that room's messages too, and they live in the chat cache —
        // the same cross-domain wiring UserRepository uses for join/place (ADR-0067).
        private readonly chatLocalDataSource: IChatLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    /**
     * Drop the channel's cached messages once I am confirmed out of it.
     *
     * Called only AFTER the remote leave succeeds, never optimistically: the channel row is cheap to
     * restore on failure (the server re-serves it) but messages are not — the feed is windowed by
     * `joinedNo`, so history dropped in error is gone for good. ADR-0067.
     *
     * A failure here does not fail the leave. The leave already happened; the worst case is cache
     * rows that outlive their room, and `isInJoinWindow` keeps those off every screen that could
     * show them. Reporting a completed leave as failed would be the bigger lie.
     */
    private async purgeChatHistory(channelId: string, requestContext: DataContext): Promise<void> {
        // This bypasses ChatRepository, so it forgets what feed pages answered for itself.
        forgetChannelCoverage(channelId, this.getNormalizedContext(requestContext));
        try {
            await this.chatLocalDataSource.cacheClearByChannelId(channelId, requestContext);
        } catch (error) {
            logger.warn('CACHE', '[ChannelRepository] leaving a channel could not clear its chat cache', {
                error,
                data: { channelId },
            });
        }
    }

    /**
     * The local half of being out of a channel: guard it against a late snapshot, then drop its row.
     * A self-leave runs it before the round trip (optimistic) and `evictLeftChannels` after one.
     */
    private async markChannelLeft(channelId: string, requestContext: DataContext): Promise<void> {
        this.leftChannelGuards.set(channelId, Date.now() + LEFT_CHANNEL_GUARD_MS);
        await this.channelLocalDataSource.cacheDelete(channelId, requestContext);
    }

    /** `memberIds` with `userId` taken out — the cache side of a kick. */
    private static withoutMember(memberIds: string[] | undefined, userId: string): string[] {
        return (memberIds ?? []).filter(id => id !== userId);
    }

    /** Whether the leave guard on this channel is still standing; lapsed entries are dropped here. */
    private isGuardedAfterLeave(channelId: string): boolean {
        return isGuarded(this.leftChannelGuards, channelId);
    }

    /** Marks a room this device just created or opened, so a list older than it does not prune it. */
    private markChannelNew(channelId: string): void {
        this.newChannelGuards.set(channelId, Date.now() + NEW_CHANNEL_GUARD_MS);
    }

    /** The ids of `cached` a server list without them may delete: absent from it and not just made. */
    private staleIdsOf(cached: DomainChannel[] | undefined, serverIds: Set<string>): string[] {
        return (cached || [])
            .map(item => item.id)
            .filter((id): id is string => !!id && !serverIds.has(id) && !isGuarded(this.newChannelGuards, id));
    }

    public observeList(
        query: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void,
        contextOverride?: LocalDataSourceContextOverride
    ): () => void {
        // A caller-supplied override pins the observer scope to a known {cid, uid} (see
        // useActiveCloudChannels); otherwise fall back to the live repository context.
        return this.channelLocalDataSource.observeList(query, callback, contextOverride ?? this.getRepositoryContext());
    }

    public observeItem(id: string, callback: (item: DomainChannel | null) => void): () => void {
        return this.channelLocalDataSource.observeItem(id, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainChannel | null> {
        return this.channelLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel> | null> {
        return this.channelLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainChannel>): Promise<void> {
        return this.channelLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.channelLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.channelLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshList(query: DomainChannelListPayload & { sid: string }): Promise<void> {
        // `channel.mine` does not filter by sid — the server returns every channel for
        // the current session's site. Two distinct concerns must NOT be conflated:
        //   1. each channel's `sid` field (used by the local sid filter) must be the
        //      viewed site → tag it via the mapping context.
        //   2. the cache write/read/delete must run under the captured request context (its
        //      cid/uid), so the rows land in the partition this request was for and the list
        //      re-emit reaches the observers subscribed there; tagging the write context with
        //      query.sid instead would silently miss those observers.
        const requestContext = this.getRequestContext();
        // The socket that answers `channel.mine` may still serve the OUTGOING cloud during a
        // switch (cache cid already flipped). Nothing is owed to the caller, so don't even ask.
        if (!this.acceptsAnswer(requestContext, 'channel-refresh')) return;
        // Named by the caller, never read off the ambient context: `targetSid` does not only tag the
        // mapped rows, it opens the prune gate below. An absent one makes `answersForTarget` true
        // unconditionally, which lets a response about another site delete this site's channels.
        const targetSid = this.assertRequiredString(query.sid, 'query.sid');
        const mappingContext = this.getNormalizedContext({ ...requestContext, sid: targetSid });
        const remote = await this.channelSocketDataSource.fetchChannel(
            {
                ...query,
                detail: true,
                limit: 100,
            },
            mappingContext
        );

        // An id-less row cannot be keyed, so it is dropped here rather than passed on for
        // `cacheWriteMany` to filter: it would otherwise still count toward `domainList.length` below
        // and let a response carrying nothing usable authorize the prune.
        const domainList = (remote.list || []).filter(item => !!item.id && !this.isGuardedAfterLeave(item.id));

        // Nothing usable came back — leave the cache entirely alone. Right after a switch the socket
        // is bound to the new cloud but its session/site may not be ready, so `channel.mine` answers
        // with an empty list; writing or pruning against that would wipe the real (sync-plan-populated)
        // channels and leave "No channels yet". A genuinely empty cloud settles on a later response.
        if (domainList.length === 0) return;

        await this.channelLocalDataSource.cacheWriteMany(domainList, requestContext);

        const serverIds = new Set(domainList.map(item => item.id));
        const localResult = await this.channelLocalDataSource.cacheReadList(query, requestContext);
        const staleIds = this.staleIdsOf(localResult?.list, serverIds);
        // The answer describes ONE site — whichever the socket session is on: `channel.mine`
        // ignores the payload's sid. Asking for another site's list therefore returns a set that
        // shares no ids with it, and pruning against that would delete every cached channel of the
        // site we asked about. Prune only when the response is actually about `targetSid`;
        // otherwise the read told us nothing and the cache must stand.
        const answersForTarget = !targetSid || domainList.some(item => item.sid === targetSid);
        if (staleIds.length > 0 && answersForTarget) {
            await this.channelLocalDataSource.cacheDeleteMany(staleIds, requestContext);
        }
    }

    public async fetchList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel>> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        return this.channelSocketDataSource.fetchChannel({ ...query, detail: true }, normalizedContext);
    }

    public async syncChannels(since: number): Promise<SyncChannelsResult> {
        const requestContext = this.getRequestContext();
        // The cursor comes back unchanged, so the caller re-asks from the same point next time.
        if (!this.acceptsAnswer(requestContext, 'channel-sync')) return { syncedAt: since, removedCount: 0 };
        const normalizedContext = this.getNormalizedContext(requestContext);
        // Sync ingests channels across all places, so map without binding to the active sid.
        const remote = await this.channelSocketDataSource.syncChannel({ since }, { ...normalizedContext, sid: '' });

        // A row with no place is dropped, with two exceptions. The Self Channel belongs to the account,
        // not to a place, and the relay sends it with an empty `$`; dropping it left a new user's Home
        // with no channel at all. A cloud 1:1 keeps the place its id names, or none: the cache never
        // fills its place from the reader's, and a desktop cloud with no place lists the ones no place
        // holds.
        const domainList = (remote.list || []).filter(
            item =>
                (!!item.$?.sid || item.stereo === 'self' || isCloudDm(item)) &&
                !!item.id &&
                !this.isGuardedAfterLeave(item.id)
        );

        if (domainList.length > 0) {
            await this.channelLocalDataSource.cacheWriteMany(domainList, { ...requestContext, sid: '' });
        }
        let removedCount = 0;
        if (remote.ids) {
            const activeIds = new Set(remote.ids);
            const localResult = await this.channelLocalDataSource.cacheReadList({}, requestContext);
            const staleIds = this.staleIdsOf(localResult?.list, activeIds);
            if (staleIds.length > 0) {
                await this.channelLocalDataSource.cacheDeleteMany(staleIds, requestContext);
                removedCount = staleIds.length;
            }
        }

        return {
            syncedAt: remote.syncedAt,
            removedCount,
        };
    }

    public async createChannel(payload: ChannelCreateInput, siteId: string): Promise<DomainChannel> {
        const tempId = `optimistic-channel-${Date.now()}`;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        // The optimistic row needs a site of its own: it is what routes the row to the site-filtered
        // list observers, and `cacheWrite` refuses a channel whose sid cannot be resolved. The caller
        // names it — the server creates the channel in its session's site, and the ambient sid used
        // to stand in for that.
        const sid = this.assertRequiredString(siteId, 'siteId');
        // Optimistic rows are domain partials; cacheWrite normalizes the missing fields.
        const optimistic: Partial<DomainChannel> = {
            id: tempId,
            sid,
            name: (payload as { name?: string }).name,
            updatedAt: Date.now(),
        };
        await this.channelLocalDataSource.cacheWrite(optimistic, requestContext);

        try {
            // Mapped under the caller's site: the create response carries none, and the optimistic
            // row above lives under a temp id, so this write has no cached sid to inherit either.
            const domain = await this.channelSocketDataSource.createChannel(payload, {
                ...normalizedContext,
                sid,
            });
            if (domain.id) this.markChannelNew(domain.id);
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
            await this.channelLocalDataSource.cacheDelete(tempId, requestContext);
            return domain;
        } catch (error) {
            await this.channelLocalDataSource.cacheDelete(tempId, requestContext);
            throw error;
        }
    }

    /**
     * Opens (or re-opens) the 1:1 with one peer.
     *
     * No optimistic row and no `siteId`, and the two go together. `createChannel` needs both
     * because the caller already knows where the room will live and can draw it before the server
     * answers; here the server decides which room this is — the same pair in the same place always
     * resolves to one — so there is nothing to draw until it does, and nowhere to draw it.
     *
     * The room's place is the one the server stamped on it, never the reader's. The answer is mapped
     * without the ambient place, then takes the place its id names or, failing that, the server's
     * field (`dmPlaceOf`). The ambient place is wrong exactly when it matters: during a place switch
     * the context already names the next place, while the server filed the room under the place the
     * session was in when it asked — and a 1:1 is listed in that one place only.
     */
    public async startDm(payload: ChannelStartDmInput): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const answer = await this.channelSocketDataSource.startDm(payload, { ...normalizedContext, sid: undefined });
        // The call only ever yields a 1:1, so a missing stereo is filled in for the cache's sake: the
        // write keys a cloud 1:1's place differently from a group's.
        const domain: DomainChannel = { ...answer, stereo: answer.stereo || 'dm', sid: dmPlaceOf(answer) };
        // The caller is owed the room either way; only the cache write depends on which cloud
        // answered, and on the room naming a place. A room that names none — neither field nor a
        // place-keyed id — is left to the next channel sync, which brings it with its place.
        if (domain.sid && this.acceptsAnswer(requestContext, 'channel-start-dm')) {
            if (domain.id) {
                // Re-opening a 1:1 left moments ago brings it back, so its leave guard stands down.
                this.leftChannelGuards.delete(domain.id);
                this.markChannelNew(domain.id);
            }
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel> {
        const channelId =
            (payload as { channelId?: string; id?: string }).channelId || (payload as { id?: string }).id || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        if (channelId) {
            await this.channelLocalDataSource.cacheWrite(
                { id: channelId, ...(payload as Partial<DomainChannel>) },
                requestContext
            );
        }

        try {
            const domain = await this.channelSocketDataSource.updateChannel(payload, normalizedContext);
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
            return domain;
        } catch (error) {
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public async inviteChannel(payload: ChatInviteInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const invitedIds = payload.userIds ?? [];
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        // Optimistic membership: the invited ids land in memberIds before the round trip,
        // and the pre-invite record is restored on failure (mirrors updateChannel). Gated on
        // an existing row — cacheWrite rejects a partial with no resolvable sid.
        if (channelId && existing) {
            await this.channelLocalDataSource.cacheWrite(
                { id: channelId, memberIds: unionIds(existing.memberIds, invitedIds) },
                requestContext
            );
        }

        try {
            const domain = await this.channelSocketDataSource.inviteChannel(payload, normalizedContext);
            // The server response may omit a fresh member list — don't rely on that
            // undocumented contract to carry the ids we just invited (same as leaveChannel).
            const memberIds = unionIds(domain.memberIds ?? existing?.memberIds, invitedIds);
            await this.channelLocalDataSource.cacheWrite({ ...domain, memberIds }, requestContext);
            return { ...domain, memberIds };
        } catch (error) {
            if (channelId && existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        // A leave carrying a target userId is a kick (owner removing another member):
        // the caller stays in the room, so the channel must NOT be evicted locally.
        // Self-leave (no userId) removes the channel from my cache, as before.
        const isSelfLeave = !payload.userId;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        if (isSelfLeave && channelId) {
            await this.markChannelLeft(channelId, requestContext);
        }

        try {
            const domain = await this.channelSocketDataSource.leaveChannel(payload, normalizedContext);
            if (!isSelfLeave && channelId) {
                // The kicked member must drop out of memberIds even if the server response
                // omits a fresh list — don't rely on that undocumented contract.
                const memberIds = ChannelRepository.withoutMember(
                    domain.memberIds ?? existing?.memberIds,
                    payload.userId as string
                );
                await this.channelLocalDataSource.cacheWrite({ ...domain, memberIds }, requestContext);
            }
            if (isSelfLeave && channelId) await this.purgeChatHistory(channelId, requestContext);
            return domain;
        } catch (error) {
            if (isSelfLeave && channelId) {
                this.leftChannelGuards.delete(channelId);
                if (existing) {
                    await this.channelLocalDataSource.cacheWrite(existing, requestContext);
                }
            }
            throw error;
        }
    }

    // Both run after the server has already acted, so a channel whose cache write fails is logged and
    // skipped rather than failing the call: the departure happened, and reporting it as failed would
    // be the bigger lie (see purgeChatHistory). The next channel is still cleared.
    public async evictLeftChannels(channelIds: string[], requestContext: DataContext): Promise<void> {
        for (const channelId of new Set(channelIds.filter(Boolean))) {
            try {
                await this.markChannelLeft(channelId, requestContext);
            } catch (error) {
                logger.warn('CACHE', '[ChannelRepository] a left channel could not be removed from the cache', {
                    error,
                    data: { channelId },
                });
            }
            await this.purgeChatHistory(channelId, requestContext);
        }
    }

    public async dropMemberFromChannels(
        channelIds: string[],
        userId: string,
        requestContext: DataContext
    ): Promise<void> {
        for (const channelId of new Set(channelIds.filter(Boolean))) {
            try {
                const existing = await this.channelLocalDataSource.cacheRead(channelId, requestContext);
                // No row, nothing to correct — and cacheWrite rejects a partial it cannot place.
                if (!existing) continue;
                const memberIds = ChannelRepository.withoutMember(existing.memberIds, userId);
                await this.channelLocalDataSource.cacheWrite({ id: channelId, memberIds }, requestContext);
            } catch (error) {
                logger.warn('CACHE', '[ChannelRepository] a removed member could not be dropped from a roster', {
                    error,
                    data: { channelId, userId },
                });
            }
        }
    }

    public async deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        // A deleted room is barred like a left one: a list asked for before the delete still has it.
        if (channelId) {
            await this.markChannelLeft(channelId, requestContext);
        }

        try {
            return await this.channelSocketDataSource.deleteChannel(payload, normalizedContext);
        } catch (error) {
            if (channelId) this.leftChannelGuards.delete(channelId);
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    // Fetch the "notes-to-self" (notes-to-self) channel for the active site and cache it so it shows in
    // the channel list. Mirrors createChannel's context handling: map under the normalized context
    // (tags the caller's sid) and write under the captured request context — the partition this
    // request was for, whose list observers are the ones that re-emit.
    public async getSelfChannel(payload: ChannelGetSelfInput | undefined, siteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        // `channel.get-self` answers with no site on the row (measured), and this is the FIRST write
        // of that row, so there is no cached sid to fall back to either. The caller's site is the
        // only thing that can tag it.
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };
        const domain = await this.channelSocketDataSource.getSelfChannel(payload ?? {}, normalizedContext);
        if (this.acceptsAnswer(requestContext, 'channel-self')) {
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    // Refreshes one channel's cached row from its authoritative snapshot. Same context split as
    // getSelfChannel: the response carries no site, so the caller's site tags the mapping and the
    // captured request context owns the write.
    public async refreshOne(channelId: string, siteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const id = this.assertRequiredString(channelId, 'channelId');
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };
        const domain = await this.channelSocketDataSource.getChannel({ id }, normalizedContext);
        // A just-left channel re-entering through a stale push must not come back — the same guard
        // refreshList and syncChannels filter against.
        if (this.isGuardedAfterLeave(id)) return domain;
        if (this.acceptsAnswer(requestContext, 'channel-one')) {
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    // Refreshes one channel without knowing its place first. Tagging the answer with the wrong
    // site would move the row to another place's list (and strand its own badge), so the sid is
    // read off the cached row rather than borrowed from the caller — the same reason every other
    // method here takes it as an argument instead of the ambient context.
    public async refreshOneInCloud(channelId: string, fallbackSiteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const id = this.assertRequiredString(channelId, 'channelId');
        const cached = await this.channelLocalDataSource.cacheRead(id, requestContext).catch(() => null);
        const sid = cached?.sid || this.assertRequiredString(fallbackSiteId, 'siteId');
        return this.refreshOne(id, sid);
    }
}
