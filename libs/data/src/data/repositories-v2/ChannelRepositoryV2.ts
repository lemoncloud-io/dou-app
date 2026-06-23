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
import type { ChannelSyncView, ChannelView, UnreadsSummaryView } from '@lemoncloud/chatic-socials-api';
import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../domain';
import { toDomainChannel } from '../domain';
import type { IChannelLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from '../repositories';
import { BaseRepositoryV2, type DisposableRepositoryV2, type RepositoryRefreshResult } from './types';

export interface RefreshChannelsSinceResult extends RepositoryRefreshResult {
    syncedAt: number;
    removedCount: number;
}

export interface IChannelRepositoryV2 extends DisposableRepositoryV2 {
    observeList(
        query: DomainChannelListPayload,
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void;
    observeItem(id: string, callback: (item: DomainChannel | null) => void): () => void;

    refreshList(query: DomainChannelListPayload): Promise<RepositoryRefreshResult>;
    refreshListSince(since: number): Promise<RefreshChannelsSinceResult>;

    createChannel(payload: ChannelCreateInput): Promise<DomainChannel>;
    updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel>;
    inviteChannel(payload: ChatInviteInput): Promise<DomainChannel>;
    leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel>;
    deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel>;

    getSelfChannel(payload?: ChannelGetSelfInput): Promise<ChannelView>;
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
        callback: (result: DomainListResult<DomainChannel> | null) => void
    ): () => void {
        return this.channelLocalDataSource.observeList(query, callback, this.getRepositoryContext());
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

    public async refreshList(query: DomainChannelListPayload): Promise<RepositoryRefreshResult> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.channelRemoteDataSource.fetchChannel(query);

        const domainList = (remote.list || [])
            .map(item => ({
                ...toDomainChannel(item, normalizedContext),
                cid: normalizedContext.cid,
            }))
            .filter(item => !item.id || !this.leftChannelIds.has(item.id));

        await this.channelLocalDataSource.cacheWriteMany(domainList, requestContext);

        const serverIds = new Set(domainList.map(item => item.id).filter(Boolean));
        const localResult = await this.channelLocalDataSource.cacheReadList(query, requestContext);
        const staleIds = (localResult?.list || [])
            .map(item => item.id)
            .filter((id): id is string => !!id && !serverIds.has(id));
        if (staleIds.length > 0) {
            await this.channelLocalDataSource.cacheDeleteMany(staleIds, requestContext);
        }

        return { wroteCount: domainList.length };
    }

    public async refreshListSince(since: number): Promise<RefreshChannelsSinceResult> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = (await this.channelRemoteDataSource.syncChannel({ since })) as ChannelSyncView;

        const normalizedSyncContext = { ...normalizedContext, sid: '' };
        const domainList = (remote.list || [])
            .map(item => ({
                ...toDomainChannel(item, normalizedSyncContext),
                cid: normalizedContext.cid,
            }))
            .filter(item => !!item.sid && !!item.id && !this.leftChannelIds.has(item.id));

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
            wroteCount: domainList.length,
            removedCount,
        };
    }

    public async createChannel(payload: ChannelCreateInput): Promise<DomainChannel> {
        const tempId = `optimistic-channel-${Date.now()}`;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const optimistic = toDomainChannel(
            {
                id: tempId,
                cid: normalizedContext.cid,
                sid: normalizedContext.sid || '',
                name: (payload as { name?: string }).name,
                updatedAt: Date.now(),
            } as Partial<DomainChannel>,
            normalizedContext
        );
        await this.channelLocalDataSource.cacheWrite(optimistic, requestContext);

        try {
            const remote = (await this.channelRemoteDataSource.createChannel(payload)) as ChannelView;
            const domain = toDomainChannel(remote, normalizedContext);
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
            const remote = (await this.channelRemoteDataSource.updateChannel(payload)) as ChannelView;
            const domain = toDomainChannel(remote, normalizedContext);
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
        const remote = (await this.channelRemoteDataSource.inviteChannel(payload)) as ChannelView;
        const domain = toDomainChannel(remote, normalizedContext);
        await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        return domain;
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, requestContext) : null;
        if (channelId) {
            this.leftChannelIds.add(channelId);
            await this.channelLocalDataSource.cacheDelete(channelId, requestContext);
        }

        try {
            const remote = (await this.channelRemoteDataSource.leaveChannel(payload)) as ChannelView;
            return toDomainChannel(remote, normalizedContext);
        } catch (error) {
            this.leftChannelIds.delete(channelId);
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
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
            const remote = (await this.channelRemoteDataSource.deleteChannel(payload)) as ChannelView;
            return toDomainChannel(remote, normalizedContext);
        } catch (error) {
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    public getSelfChannel(payload?: ChannelGetSelfInput): Promise<ChannelView> {
        return this.channelRemoteDataSource.getSelfChannel(payload ?? {});
    }

    public getUnreads(payload?: ChannelUnreadsInput): Promise<UnreadsSummaryView> {
        return this.channelRemoteDataSource.getUnreads(payload ?? {});
    }
}
