import type { ChannelGetSelfInput, ChatInviteInput, ChatLeaveInput } from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelStartDmInput,
    ChannelUpdateInput,
} from '@lemoncloud/chatic-sockets-api/dist/lib/channel/types';
import { logger } from '@chatic/logger';
import {
    dmPlaceOf,
    isCloudDm,
    isRelayDm,
    type DomainChannel,
    type DomainChannelListPayload,
    type DomainListResult,
} from '@chatic/data-model';
import type { IChannelLocalDataSource, IChatLocalDataSource, LocalDataSourceContextOverride } from '@chatic/data-local';
import type { IChannelSocketDataSource } from '@chatic/data-api';
import { forgetChannelCoverage } from './feedCoverage';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

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

    refreshList(query: DomainChannelListPayload & { sid: string }): Promise<void>;
    fetchList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel>>;
    syncChannels(since: number): Promise<SyncChannelsResult>;
    createChannel(payload: ChannelCreateInput, siteId: string): Promise<DomainChannel>;
    startDm(payload: ChannelStartDmInput): Promise<DomainChannel>;
    updateChannel(payload: ChannelUpdateInput): Promise<DomainChannel>;
    inviteChannel(payload: ChatInviteInput): Promise<DomainChannel>;
    leaveChannel(payload: ChatLeaveInput): Promise<DomainChannel>;
    deleteChannel(payload: ChannelDeleteInput): Promise<DomainChannel>;

    evictLeftChannels(channelIds: string[], requestContext: DataContext): Promise<void>;
    dropMemberFromChannels(channelIds: string[], userId: string, requestContext: DataContext): Promise<void>;

    getSelfChannel(payload: ChannelGetSelfInput | undefined, siteId: string): Promise<DomainChannel>;

    refreshOne(channelId: string, siteId: string): Promise<DomainChannel>;

    refreshOneInCloud(channelId: string, fallbackSiteId: string): Promise<DomainChannel>;

    cacheRead(id: string): Promise<DomainChannel | null>;
    cacheReadList(query: DomainChannelListPayload): Promise<DomainListResult<DomainChannel> | null>;
    cacheWrite(item: Partial<DomainChannel>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

const LEFT_CHANNEL_GUARD_MS = 10_000;

const NEW_CHANNEL_GUARD_MS = LEFT_CHANNEL_GUARD_MS;

const isGuarded = (guards: Map<string, number>, id: string): boolean => {
    const until = guards.get(id);
    if (until === undefined) return false;
    if (Date.now() < until) return true;
    guards.delete(id);
    return false;
};

export class ChannelRepository extends BaseRepository implements IChannelRepository {
    private readonly leftChannelGuards = new Map<string, number>();
    private readonly newChannelGuards = new Map<string, number>();

    constructor(
        private readonly channelSocketDataSource: IChannelSocketDataSource,
        private readonly channelLocalDataSource: IChannelLocalDataSource,
        private readonly chatLocalDataSource: IChatLocalDataSource,
        contextProvider: DataContextProvider
    ) {
        super(contextProvider);
    }

    private async purgeChatHistory(channelId: string, requestContext: DataContext): Promise<void> {
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

    private async markChannelLeft(channelId: string, requestContext: DataContext): Promise<void> {
        this.leftChannelGuards.set(channelId, Date.now() + LEFT_CHANNEL_GUARD_MS);
        await this.channelLocalDataSource.cacheDelete(channelId, requestContext);
    }

    private static withoutMember(memberIds: string[] | undefined, userId: string): string[] {
        return (memberIds ?? []).filter(id => id !== userId);
    }

    private isGuardedAfterLeave(channelId: string): boolean {
        return isGuarded(this.leftChannelGuards, channelId);
    }

    private markChannelNew(channelId: string): void {
        this.newChannelGuards.set(channelId, Date.now() + NEW_CHANNEL_GUARD_MS);
    }

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
        const requestContext = this.getRequestContext();
        if (!this.acceptsAnswer(requestContext, 'channel-refresh')) return;
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

        const domainList = (remote.list || []).filter(item => !!item.id && !this.isGuardedAfterLeave(item.id));

        if (domainList.length === 0) return;

        await this.channelLocalDataSource.cacheWriteMany(domainList, requestContext);

        const serverIds = new Set(domainList.map(item => item.id));
        const localResult = await this.channelLocalDataSource.cacheReadList(query, requestContext);
        const staleIds = this.staleIdsOf(localResult?.list, serverIds);
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
        if (!this.acceptsAnswer(requestContext, 'channel-sync')) return { syncedAt: since, removedCount: 0 };
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.channelSocketDataSource.syncChannel({ since }, { ...normalizedContext, sid: '' });

        const domainList = (remote.list || []).filter(
            item =>
                (!!item.$?.sid || item.stereo === 'self' || isCloudDm(item) || isRelayDm(item)) &&
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
        const sid = this.assertRequiredString(siteId, 'siteId');
        const optimistic: Partial<DomainChannel> = {
            id: tempId,
            sid,
            name: (payload as { name?: string }).name,
            updatedAt: Date.now(),
        };
        await this.channelLocalDataSource.cacheWrite(optimistic, requestContext);

        try {
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

    public async startDm(payload: ChannelStartDmInput): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const answer = await this.channelSocketDataSource.startDm(payload, { ...normalizedContext, sid: undefined });
        const domain: DomainChannel = { ...answer, stereo: answer.stereo || 'dm', sid: dmPlaceOf(answer) };
        if (domain.sid && this.acceptsAnswer(requestContext, 'channel-start-dm')) {
            if (domain.id) {
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
        if (channelId && existing) {
            await this.channelLocalDataSource.cacheWrite(
                { id: channelId, memberIds: unionIds(existing.memberIds, invitedIds) },
                requestContext
            );
        }

        try {
            const domain = await this.channelSocketDataSource.inviteChannel(payload, normalizedContext);
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

    public async getSelfChannel(payload: ChannelGetSelfInput | undefined, siteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };
        const domain = await this.channelSocketDataSource.getSelfChannel(payload ?? {}, normalizedContext);
        if (this.acceptsAnswer(requestContext, 'channel-self')) {
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async refreshOne(channelId: string, siteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const id = this.assertRequiredString(channelId, 'channelId');
        const sid = this.assertRequiredString(siteId, 'siteId');
        const normalizedContext = { ...this.getNormalizedContext(requestContext), sid };
        const domain = await this.channelSocketDataSource.getChannel({ id }, normalizedContext);
        if (this.isGuardedAfterLeave(id)) return domain;
        if (this.acceptsAnswer(requestContext, 'channel-one')) {
            await this.channelLocalDataSource.cacheWrite(domain, requestContext);
        }
        return domain;
    }

    public async refreshOneInCloud(channelId: string, fallbackSiteId: string): Promise<DomainChannel> {
        const requestContext = this.getRequestContext();
        const id = this.assertRequiredString(channelId, 'channelId');
        const cached = await this.channelLocalDataSource.cacheRead(id, requestContext).catch(() => null);
        const sid = cached?.sid || this.assertRequiredString(fallbackSiteId, 'siteId');
        return this.refreshOne(id, sid);
    }
}
