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
import type {
    ChannelSyncView,
    ChannelView,
    ChatView,
    JoinView,
    UnreadsSummaryView,
} from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/domain';
import type { DomainChannel, DomainChannelListPayload, DomainListResult } from '../domain';
import { toDomainChannel } from '../domain';
import type { IChannelLocalDataSourceV2 } from '../local/data-sources-v2';
import type { IChannelRemoteDataSource } from '../remote/data-sources';
import {
    BaseRepositoryV2,
    type DataContextProviderV2,
    type DisposableRepositoryV2,
    type RepositoryRefreshResult,
} from './types';

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

/** Orchestrates channel list/detail caching and derived state updates for the active scope. */
export class ChannelRepositoryV2 extends BaseRepositoryV2 implements IChannelRepositoryV2 {
    private readonly leftChannelIds = new Set<string>();

    constructor(
        private readonly channelRemoteDataSource: IChannelRemoteDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSourceV2,
        contextProvider: DataContextProviderV2,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(contextProvider, domainEventBus);
        this.initializeInternalListeners();
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
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();
        const remote = await this.channelRemoteDataSource.fetchChannel(query);

        const domainList = (remote.list || [])
            .map(item => ({
                ...toDomainChannel(item, requestScope),
                cid: requestScope.cid,
            }))
            .filter(item => !item.id || !this.leftChannelIds.has(item.id));

        if (!this.isSameContext(requestContext)) {
            return { wroteCount: 0 };
        }

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
        const requestScope = this.getDomainScope();
        const requestContext = this.getRepositoryContext();
        const remote = (await this.channelRemoteDataSource.syncChannel({ since })) as ChannelSyncView;

        if (!this.isSameContext(requestContext)) {
            return { syncedAt: remote.syncedAt, wroteCount: 0, removedCount: 0 };
        }

        const syncScope = { ...requestScope, sid: '' };
        const domainList = (remote.list || [])
            .map(item => ({
                ...toDomainChannel(item, syncScope),
                cid: requestScope.cid,
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
        const context = this.getRepositoryContext();
        const scope = this.getDomainScope();
        const optimistic = toDomainChannel(
            {
                id: tempId,
                cid: scope.cid,
                sid: scope.sid || '',
                name: (payload as { name?: string }).name,
                updatedAt: Date.now(),
            } as Partial<DomainChannel>,
            scope
        );
        await this.channelLocalDataSource.cacheWrite(optimistic, context);

        try {
            const remote = (await this.channelRemoteDataSource.createChannel(payload)) as ChannelView;
            const domain = toDomainChannel(remote, scope);
            await this.channelLocalDataSource.cacheWrite(domain, context);
            await this.channelLocalDataSource.cacheDelete(tempId, context);
            return domain;
        } catch (error) {
            await this.channelLocalDataSource.cacheDelete(tempId, context);
            throw error;
        }
    }

    public async updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel> {
        const channelId =
            (payload as { channelId?: string; id?: string }).channelId || (payload as { id?: string }).id || '';
        const context = this.getRepositoryContext();
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, context) : null;
        if (channelId) {
            await this.channelLocalDataSource.cacheWrite(
                { id: channelId, ...(payload as Partial<DomainChannel>) },
                context
            );
        }

        try {
            const remote = (await this.channelRemoteDataSource.updateChannel(payload)) as ChannelView;
            const domain = toDomainChannel(remote, this.getDomainScope());
            await this.channelLocalDataSource.cacheWrite(domain, context);
            return domain;
        } catch (error) {
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    public async inviteChannel(payload: ChatInviteInput): Promise<DomainChannel> {
        const remote = (await this.channelRemoteDataSource.inviteChannel(payload)) as ChannelView;
        const domain = toDomainChannel(remote, this.getDomainScope());
        await this.channelLocalDataSource.cacheWrite(domain, this.getRepositoryContext());
        return domain;
    }

    public async leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const context = this.getRepositoryContext();
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, context) : null;
        if (channelId) {
            this.leftChannelIds.add(channelId);
            await this.channelLocalDataSource.cacheDelete(channelId, context);
        }

        try {
            const remote = (await this.channelRemoteDataSource.leaveChannel(payload)) as ChannelView;
            return toDomainChannel(remote, this.getDomainScope());
        } catch (error) {
            this.leftChannelIds.delete(channelId);
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, context);
            }
            throw error;
        }
    }

    public async deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel> {
        const channelId = payload.channelId || '';
        const context = this.getRepositoryContext();
        const existing = channelId ? await this.channelLocalDataSource.cacheRead(channelId, context) : null;
        if (channelId) {
            await this.channelLocalDataSource.cacheDelete(channelId, context);
        }

        try {
            const remote = (await this.channelRemoteDataSource.deleteChannel(payload)) as ChannelView;
            return toDomainChannel(remote, this.getDomainScope());
        } catch (error) {
            if (existing) {
                await this.channelLocalDataSource.cacheWrite(existing, context);
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

    private initializeInternalListeners(): void {
        this.onDomainEvent('channel:create', detail => {
            const createdId = detail.data.id || '';
            if (createdId) this.leftChannelIds.delete(createdId);
            const context = this.getRepositoryContextSnapshot();
            this.runInBackground(() => this.channelLocalDataSource.cacheWrite(detail.data, context), 'channel:create');
        });
        this.onDomainEvent('channel:update', detail => {
            const channelId = detail.data.id || '';
            if (channelId && this.leftChannelIds.has(channelId)) return;
            const context = this.getRepositoryContextSnapshot();
            this.runInBackgroundSerial(
                `channel:${channelId || detail.data.id || 'unknown'}`,
                () => this.channelLocalDataSource.cacheWrite(detail.data, context),
                'channel:update'
            );
        });
        this.onDomainEvent('channel:delete', detail => {
            const channelId = detail.data.id || '';
            const context = this.getRepositoryContextSnapshot();
            this.runInBackgroundSerial(
                `channel:${channelId || 'unknown'}`,
                () => this.channelLocalDataSource.cacheDelete(channelId, context),
                'channel:delete'
            );
        });
        this.onDomainEvent('chat:create', detail => {
            const chat = detail.data as ChatView;
            const channelId = chat.channelId;
            if (!channelId) return;
            const context = this.getRepositoryContextSnapshot();
            this.runInBackgroundSerial(
                `channel:${channelId}`,
                async () => {
                    const existing = await this.channelLocalDataSource.cacheRead(channelId, context);
                    if (!existing) return;
                    const isOwnMessage = !!context.uid && chat.ownerId === context.uid;
                    const prevUnread = existing.unreadCount ?? 0;
                    await this.channelLocalDataSource.cacheWrite(
                        {
                            id: channelId,
                            lastChat$: chat,
                            chatNo: chat.chatNo,
                            unreadCount: isOwnMessage ? prevUnread : prevUnread + 1,
                        } as Partial<DomainChannel>,
                        context
                    );
                },
                'chat:create->channel:update'
            );
        });
        this.onDomainEvent('join:update', detail => {
            const join = detail.data as JoinView;
            const channelId = (join as { channelId?: string }).channelId;
            if (!channelId) return;
            const context = this.getRepositoryContextSnapshot();
            const isMyJoin = !!context.uid && (join as { userId?: string }).userId === context.uid;
            if (!isMyJoin) return;

            this.runInBackgroundSerial(
                `channel:${channelId}`,
                async () => {
                    const existing = await this.channelLocalDataSource.cacheRead(channelId, context);
                    if (!existing) return;
                    const lastChatNo =
                        (existing.lastChat$ as { chatNo?: number } | undefined)?.chatNo ?? existing.chatNo ?? 0;
                    const myReadNo = (join as { chatNo?: number }).chatNo ?? 0;
                    const unreadCount = Math.max(0, lastChatNo - myReadNo);
                    await this.channelLocalDataSource.cacheWrite(
                        { id: channelId, $join: join, unreadCount } as Partial<DomainChannel>,
                        context
                    );
                },
                'join:update->channel:read'
            );
        });
    }
}
