import { useCallback, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
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
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const [isPending, setIsPending] = useState<PendingState>(INITIAL_PENDING);

    // Toggle one action's pending flag around its promise, and log the failure on the way out.
    //
    // Logging belongs on this shared runner rather than in each action: every channel write already
    // funnels through it, so a new action cannot forget the entry. These are socket-path writes, so
    // the "HTTP failures are logged by the transport alone" rule does not apply — nothing else
    // records them today, which is why a failed leave left no trace at all.
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
                    try {
                        await joinRepository.cacheWrite({
                            id: `${payload.channelId}@${payload.userId}`,
                            channelId: payload.channelId,
                            userId: payload.userId,
                            joined: 0,
                            reason: 'kicked',
                        });
                    } catch (error) {
                        // Distinct from a failed leave: the server DID remove them, but the local
                        // mark that stops the member list rendering them did not land — which is
                        // exactly the "removed member still listed" report. The runner's generic
                        // entry cannot tell the two apart, so name this one before rethrowing.
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
