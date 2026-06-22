import type { DomainSyncPlan, DomainSyncContext, SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { DataRepositoriesV2, DomainChannel, IChatRepositoryV2 } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { ChannelChatSyncTarget, ChannelChatSyncSnapshot, SyncChannelSnapshot } from './types';

export class ChannelChatSyncPlan implements DomainSyncPlan<ChannelChatSyncTarget> {
    readonly domain = 'channel-chat';

    constructor(
        private readonly deps: {
            getRepositories(): DataRepositoriesV2;
            onConnected?: () => void;
            onSyncStart?: () => void;
            onSyncSuccess?: (syncedAt: number, isFullSync: boolean) => void;
            onSyncFinished?: () => void;
        }
    ) {}

    public supports(target: SyncTargetDescriptor): target is ChannelChatSyncTarget {
        return target.type === 'channel-chat';
    }

    public getKey(target: ChannelChatSyncTarget): string {
        return target.id ? `channel-chat:${target.id}` : 'channel-chat';
    }

    public onConnected(target: ChannelChatSyncTarget, ctx: DomainSyncContext): void {
        ctx.writeSnapshot(target, { lastSyncedAt: 0 });
        this.deps.onConnected?.();
    }

    public async run(target: ChannelChatSyncTarget, ctx: DomainSyncContext): Promise<void> {
        this.deps.onSyncStart?.();
        try {
            const snapshot = ctx.readSnapshot<ChannelChatSyncSnapshot>(target);
            const since = snapshot ? snapshot.lastSyncedAt : 0;
            const isFullSync = since === 0;

            const repositories = this.deps.getRepositories();
            const channelResult = await repositories.channel.refreshListSince(since);

            const channels = await this.loadChannelSnapshots(repositories);
            await this.catchUpChats(channels, repositories.chat);

            ctx.writeSnapshot(target, { lastSyncedAt: channelResult.syncedAt });
            this.deps.onSyncSuccess?.(channelResult.syncedAt, isFullSync);
        } catch (error) {
            logger.error('SYNC', '[ChannelChatSyncController] sync run failed', {
                error,
                data: {
                    target,
                },
            });
        } finally {
            this.deps.onSyncFinished?.();
        }
    }

    private async loadChannelSnapshots(repositories: DataRepositoriesV2): Promise<SyncChannelSnapshot[]> {
        const result = await repositories.channel.cacheReadList({});
        return (result?.list || [])
            .filter(
                (channel): channel is DomainChannel & { id: string } => typeof channel.id === 'string' && !!channel.id
            )
            .map(channel => ({
                id: channel.id,
                chatNo: channel.chatNo ?? 0,
            }));
    }

    private async catchUpChats(channels: SyncChannelSnapshot[], chatRepository: IChatRepositoryV2): Promise<void> {
        for (const channel of channels) {
            const localLatestChatNo = await this.getLocalLatestChatNo(channel.id, chatRepository);
            const serverChatNo = channel.chatNo ?? 0;

            if (serverChatNo <= localLatestChatNo) {
                continue;
            }

            await chatRepository.refreshList({ channelId: channel.id, limit: 50 });
        }
    }

    private async getLocalLatestChatNo(channelId: string, chatRepository: IChatRepositoryV2): Promise<number> {
        const result = await chatRepository.cacheReadList({ channelId, limit: 1 });
        return result?.list?.[0]?.chatNo ?? 0;
    }
}
