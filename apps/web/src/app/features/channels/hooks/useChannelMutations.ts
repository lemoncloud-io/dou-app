import { useCallback, useState } from 'react';

import { runtime, type DomainChannel } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import type {
    ChannelCreateInput,
    ChannelUpdateInput,
    ChannelDeleteInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';

type PendingKey = 'start' | 'update' | 'delete' | 'leave' | 'invite';
type PendingState = Record<PendingKey, boolean>;

const INITIAL_PENDING: PendingState = { start: false, update: false, delete: false, leave: false, invite: false };

export const useChannelMutations = () => {
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

    const run = useCallback(<T>(key: PendingKey, op: () => Promise<T>): Promise<T> => {
        setIsPending(prev => ({ ...prev, [key]: true }));
        return op()
            .catch((error: unknown) => {
                logger.error('CHANNEL', `channel ${key} failed`, { error });
                throw error;
            })
            .finally(() => setIsPending(prev => ({ ...prev, [key]: false })));
    }, []);

    const createChannel = useCallback(
        (payload: ChannelCreateInput): Promise<DomainChannel> =>
            run('start', () => channelRepository.createChannel(payload, selectedSiteId ?? '')),
        [channelRepository, run, selectedSiteId]
    );

    const updateChannel = useCallback(
        (payload: ChannelUpdateInput): Promise<DomainChannel> =>
            run('update', () => channelRepository.updateChannel(payload)),
        [channelRepository, run]
    );

    const deleteChannel = useCallback(
        (payload: ChannelDeleteInput): Promise<DomainChannel> =>
            run('delete', () => channelRepository.deleteChannel(payload)),
        [channelRepository, run]
    );

    const leaveChannel = useCallback(
        (payload: ChatLeaveInput): Promise<DomainChannel> =>
            run('leave', async () => {
                const domain = await channelRepository.leaveChannel(payload);
                if (payload.userId && payload.channelId) {
                    try {
                        await joinRepository.cacheWrite({
                            id: `${payload.channelId}@${payload.userId}`,
                            channelId: payload.channelId,
                            userId: payload.userId,
                            joined: 0,
                            reason: 'kicked',
                        });
                    } catch (error) {
                        logger.error('CHANNEL', 'kick succeeded but local join mark failed', {
                            error,
                            data: { channelId: payload.channelId },
                        });
                        throw error;
                    }
                }
                return domain;
            }),
        [channelRepository, joinRepository, run]
    );

    const inviteChannel = useCallback(
        (payload: ChatInviteInput): Promise<DomainChannel> =>
            run('invite', () => channelRepository.inviteChannel(payload)),
        [channelRepository, run]
    );

    return { createChannel, updateChannel, deleteChannel, leaveChannel, inviteChannel, isPending };
};
