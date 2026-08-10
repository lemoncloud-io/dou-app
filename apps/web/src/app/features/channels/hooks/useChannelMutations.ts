import { useCallback, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';
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

/**
 * Channel write operations backed by the engine's channel repository. Each
 * action tracks its own pending flag so independent buttons (create/update/
 * delete/leave/invite) reflect only their own in-flight state.
 */
export const useChannelMutations = () => {
    const { channel: channelRepository, join: joinRepository } = useRuntimeRepositories();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

    // Toggle one action's pending flag around its promise.
    const run = useCallback(<T>(key: PendingKey, op: () => Promise<T>): Promise<T> => {
        setIsPending(prev => ({ ...prev, [key]: true }));
        return op().finally(() => setIsPending(prev => ({ ...prev, [key]: false })));
    }, []);

    const createChannel = useCallback(
        (payload: ChannelCreateInput): Promise<DomainChannel> =>
            run('start', () => channelRepository.createChannel(payload)),
        [channelRepository, run]
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
                // A kick (userId set) removes someone ELSE — nothing server-side ever pushes a
                // join-cache update for the target, so their row would otherwise sit at its old
                // `joined` value forever and useChannelMembers keeps rendering them. Mark it left
                // here, in the same local join cache the member list observes.
                if (payload.userId && payload.channelId) {
                    await joinRepository.cacheWrite({
                        id: `${payload.channelId}@${payload.userId}`,
                        channelId: payload.channelId,
                        userId: payload.userId,
                        joined: 0,
                        reason: 'kicked',
                    });
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
