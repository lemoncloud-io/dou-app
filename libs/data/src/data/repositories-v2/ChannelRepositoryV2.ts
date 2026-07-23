import type {
    ChannelGetSelfInput,
    ChannelUnreadsInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import type { UnreadsSummaryView } from '@lemoncloud/chatic-socials-api';
import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../domain';
import type { IChannelLocalDataSourceV2, LocalDataSourceV2ContextOverride } from '../local/data-sources-v2';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepositoryV2, type DisposableRepositoryV2 } from './types';

export interface SyncChannelsResult {
    syncedAt: number;
    removedCount: number;
}

export interface IChannelRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void,
        contextOverride?: LocalDataSourceV2ContextOverride
    ): () => void;
    observeItem(id: string, callback: (item: DomainChannel | null) => void): () => void;

    refreshList(query: DomainChannelListPayload): Promise<void>;
    // Fetch the channel list (with detail) straight from the server WITHOUT touching the cache.
    // The cache keys channels by `cid:uid:id` with no sid and channel ids collide across places, so
    // it can only hold one place's channels at a time; a flat returned list lets a caller aggregate
    // unread across every place at once (the per-place badges).
    fetchList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel>>;
    // Cloud-wide delta sync (channel.sync) — pulls channels changed since the cursor across all
    // places and advances syncedAt. Named like profile.syncProfiles for consistency.
    syncChannels(since: number): Promise<SyncChannelsResult>;
    createChannel(payload: ChannelCreateInput): Promise<DomainChannel>;
    updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel>;
    inviteChannel(payload: ChatInviteInput): Promise<DomainChannel>;
    leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel>;
    deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel>;

    getSelfChannel(payload?: ChannelGetSelfInput): Promise<DomainChannel>;
    getUnreads(payload?: ChannelUnreadsInput): Promise<UnreadsSummaryView>;

    cacheRead(id: string): Promise<DomainChannel | null>;
    cacheReadList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel> | null>;
    cacheWrite(item: Partial<DomainChannel>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainChannel>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/** Orchestrates channel list/detail caching and derived state updates for the active context. */
export class ChannelRepositoryV2 extends BaseRepositoryV2 implements IChannelRepositoryV2 {
    private readonly leftChannelIds = new Set<string>();

    constructor(
        private readonly channelRemoteDataSource: IChannelRemoteDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSourceV2,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    public observeList(
        query: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void,
        contextOverride?: LocalDataSourceV2ContextOverride
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

    public cacheWriteMany(items: Array<Partial<DomainChannel>>): Promise<void> {
        return this.channelLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.channelLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.channelLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async refreshList(query: DomainChannelListPayload): Promise<void> {
        // `channel.mine` does not filter by sid — the server returns every channel for
        // the current session's site. Two distinct concerns must NOT be conflated:
        //   1. each channel's `sid` field (used by the local sid filter) must be the
        //      viewed site → tag it via the mapping context.
        //   2. the cache write/read/delete must run under the LIVE context so the list
        //      re-emit lands on the same scope key observers subscribed with; tagging the
        //      write context with query.sid instead would silently miss those observers.
        const requestContext = this.getRequestContext();
        // The socket that answers `channel.mine` may still serve the OUTGOING cloud during a
        // switch (cache cid already flipped). Writing its list under the new cid poisons the
        // target partition, so skip when the socket's bound cloud differs from the active cid.
        const rawContext = this.getRepositoryContext();
        if (rawContext.socketCid != null && (requestContext.cid || 'default') !== rawContext.socketCid) {
            return;
        }
        const targetSid = query.sid ?? requestContext.sid;
        const mappingContext = this.getNormalizedContext({ ...requestContext, sid: targetSid });
        const remote = await this.channelRemoteDataSource.fetchChannel(
            {
                ...query,
                detail: true,
                limit: 100,
            },
            mappingContext
        );

        const domainList = (remote.list || []).filter(item => !item.id || !this.leftChannelIds.has(item.id));

        await this.channelLocalDataSource.cacheWriteMany(domainList, requestContext);

        const serverIds = new Set(domainList.map(item => item.id).filter(Boolean));
        const localResult = await this.channelLocalDataSource.cacheReadList(query, requestContext);
        const staleIds = (localResult?.list || [])
            .map(item => item.id)
            .filter((id): id is string => !!id && !serverIds.has(id));
        // Only prune when the server actually returned channels. Right after a switch the socket
        // is bound to the new cloud but its session/site may not be ready, so channel.mine returns
        // an empty list — pruning against that would wipe the real (sync-plan-populated) channels
        // and leave "No channels yet". A genuinely empty cloud settles once a real response arrives.
        if (staleIds.length > 0 && domainList.length > 0) {
            await this.channelLocalDataSource.cacheDeleteMany(staleIds, requestContext);
        }
    }

    public async fetchList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel>> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        return this.channelRemoteDataSource.fetchChannel({ ...query, detail: true }, normalizedContext);
    }

    public async syncChannels(since: number): Promise<SyncChannelsResult> {
        const requestContext = this.getRequestContext();
        const rawContext = this.getRepositoryContext();
        if (rawContext.socketCid != null && (requestContext.cid || 'default') !== rawContext.socketCid) {
            return { syncedAt: since, removedCount: 0 };
        }
        const normalizedContext = this.getNormalizedContext(requestContext);
        // Sync ingests channels across all places, so map without binding to the active sid.
        const remote = await this.channelRemoteDataSource.syncChannel({ since }, { ...normalizedContext, sid: '' });

        const domainList = (remote.list || []).filter(
            item => !!item.$?.sid && !!item.id && !this.leftChannelIds.has(item.id)
        );

        if (domainList.length > 0) {
            await this.channelLocalDataSource.cacheWriteMany(domainList, { ...requestContext, sid: '' });
        }
        let removedCount = 0;
        if (remote.ids) {
            const activeIds = new Set(remote.ids);
            const localResult = await this.channelLocalDataSource.cacheReadList({}, requestContext);
            const staleIds = (localResult?.list || [])
                .map(item => item.id)
                .filter((id): id is string => !!id && !activeIds.has(id));
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

    public async createChannel(payload: ChannelCreateInput): Promise<DomainChannel> {
        const tempId = `optimistic-channel-${Date.now()}`;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        // Optimistic rows are domain partials; cacheWrite normalizes the missing fields.
        const optimistic: Partial<DomainChannel> = {
            id: tempId,
            sid: normalizedContext.sid || '',
            name: (payload as { name?: string }).name,
            updatedAt: Date.now(),
        };
        await this.channelLocalDataSource.cacheWrite(optimistic, requestContext);

        try {
            const domain = await this.channelRemoteDataSource.createChannel(payload, normalizedContext);
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
            await this.channelLocalDataSource.cacheDelete(tempId, requestContext);
            return domain;
        } catch (error) {
            await this.channelLocalDataSource.cacheDelete(tempId, requestContext);
            throw error;
        }
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
            const domain = await this.channelRemoteDataSource.updateChannel(payload, normalizedContext);
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
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.channelRemoteDataSource.inviteChannel(payload, normalizedContext);
        await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        // A leave carrying a target userId is a kick (owner removing another member):
        // the caller stays in the room, so the channel must NOT be evicted locally.
        // Self-leave (no userId) removes the channel from my cache, as before.
        const isSelfLeave = !payload.userId;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing =
            isSelfLeave && channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        if (isSelfLeave && channelId) {
            this.leftChannelIds.add(channelId);
            await this.channelLocalDataSource.cacheDelete(channelId, requestContext);
        }

        try {
            return await this.channelRemoteDataSource.leaveChannel(payload, normalizedContext);
        } catch (error) {
            if (isSelfLeave && channelId) {
                this.leftChannelIds.delete(channelId);
                if (existing) {
                    await this.channelLocalDataSource.cacheWrite(existing, requestContext);
                }
            }
            throw error;
        }
    }

    public async deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        if (channelId) {
            await this.channelLocalDataSource.cacheDelete(channelId, requestContext);
        }

        try {
            return await this.channelRemoteDataSource.deleteChannel(payload, normalizedContext);
        } catch (error) {
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    // Fetch the "나와의 채팅" (notes-to-self) channel for the active site and cache it so it shows in
    // the channel list. Mirrors createChannel's context handling: map under the normalized context
    // (tags the active sid) and write under the live request context so list observers re-emit.
    public async getSelfChannel(payload?: ChannelGetSelfInput): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domain = await this.channelRemoteDataSource.getSelfChannel(payload ?? {}, normalizedContext);
        // Skip the cache write when the answering socket is still bound to a different cloud (the
        // switch optimistic window) so we don't poison the target partition. Mirrors refreshList.
        const rawContext = this.getRepositoryContext();
        if (rawContext.socketCid == null || (requestContext.cid || 'default') === rawContext.socketCid) {
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public getUnreads(payload?: ChannelUnreadsInput): Promise<UnreadsSummaryView> {
        return this.channelRemoteDataSource.getUnreads(payload ?? {});
    }
}
