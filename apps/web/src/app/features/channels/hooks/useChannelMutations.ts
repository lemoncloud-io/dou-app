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
    const { channel: channelRepository } = useRuntimeRepositories();
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
            run('leave', () => channelRepository.leaveChannel(payload)),
        [channelRepository, run]
    );

    const inviteChannel = useCallback(
        (payload: ChatInviteInput): Promise<DomainChannel> =>
            run('invite', () => channelRepository.inviteChannel(payload)),
        [channelRepository, run]
    );

    return { createChannel, updateChannel, deleteChannel, leaveChannel, inviteChannel, isPending };
};
