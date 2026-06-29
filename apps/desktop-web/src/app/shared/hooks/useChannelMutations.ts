import { useCallback, useState } from 'react';

import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelUpdateInput,
    ChannelUpdateJoinInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';
import type { JoinNotify } from '@lemoncloud/chatic-socials-api';

import type { DomainChannel, DomainJoin } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Desktop channel-write hook. Wraps the engine's channel repository for every
 * write the desktop UI needs (create / rename / delete / leave-kick / invite).
 *
 * WHY HERE (not libs/app-runtime): the engine already exposes the channel
 * repository via useRuntimeRepositories(); apps/web wraps it in its own feature-level
 * useChannelMutations. We mirror that app-side convention rather than widen the
 * shared engine surface.
 *
 * A single `isMutating` flag is exposed — the desktop UI runs these one at a
 * time (dialog/confirm flows), so per-op flags would be needless complexity.
 */
export const useDesktopChannelMutations = () => {
    const { channel: channelRepository, join: joinRepository } = useRuntimeRepositories();
    const [isMutating, setIsMutating] = useState(false);

    const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
        setIsMutating(true);
        return op().finally(() => setIsMutating(false));
    }, []);

    const createChannel = useCallback(
        (payload: ChannelCreateInput): Promise<DomainChannel> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));
            return run(() => channelRepository.createChannel(payload));
        },
        [channelRepository, run]
    );

    const updateChannel = useCallback(
        ({ channelId, name, desc }: { channelId: string; name?: string; desc?: string }): Promise<DomainChannel> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            if (name === undefined && desc === undefined) {
                return Promise.reject(new Error('name or desc is required'));
            }
            const payload: ChannelUpdateInput = { channelId, name, desc };
            return run(() => channelRepository.updateChannel(payload));
        },
        [channelRepository, run]
    );

    const deleteChannel = useCallback(
        ({ channelId }: { channelId: string }): Promise<DomainChannel> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            const payload: ChannelDeleteInput = { channelId };
            return run(() => channelRepository.deleteChannel(payload));
        },
        [channelRepository, run]
    );

    const leaveChannel = useCallback(
        ({ channelId, userId }: { channelId: string; userId?: string }): Promise<DomainChannel> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            // userId omitted = self-leave; userId set = kick (server enforces owner-only).
            const payload: ChatLeaveInput = { channelId, userId };
            return run(() => channelRepository.leaveChannel(payload));
        },
        [channelRepository, run]
    );

    const inviteChannel = useCallback(
        ({ channelId, userIds }: { channelId: string; userIds: string[] }): Promise<DomainChannel> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            if (!userIds?.length) return Promise.reject(new Error('userIds is required'));
            const payload: ChatInviteInput = { channelId, userIds };
            return run(() => channelRepository.inviteChannel(payload));
        },
        [channelRepository, run]
    );

    // DM creation was removed: the socket v2 `channel.create` contract drops
    // `userIds`, so a dm-stereo start reaches the backend as owner-only and its
    // derived channel id collides with existing channels (destroys their
    // memberIds). Re-add only after the server accepts members at creation.

    const setChannelNotify = useCallback(
        ({
            channelId,
            userId,
            notify,
        }: {
            channelId: string;
            /** My cloud user id in this channel (channel.$join.userId). */
            userId: string;
            notify: JoinNotify;
        }): Promise<DomainJoin> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            if (!userId) return Promise.reject(new Error('userId is required'));
            // ChannelUpdateJoinInput types only channelId/joinId/notify; the engine resolves
            // the join row from channelId + userId at write time, so pass userId via a cast.
            const payload = { channelId, userId, notify } as unknown as ChannelUpdateJoinInput;
            return run(() => joinRepository.updateJoin(payload));
        },
        [joinRepository, run]
    );

    return {
        createChannel,
        updateChannel,
        deleteChannel,
        leaveChannel,
        inviteChannel,
        setChannelNotify,
        isMutating,
    };
};
