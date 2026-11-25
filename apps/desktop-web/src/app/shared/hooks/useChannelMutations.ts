import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type {
    ChannelCreateInput,
    ChannelDeleteInput,
    ChannelUpdateInput,
    ChannelUpdateJoinInput,
    ChatInviteInput,
    ChatLeaveInput,
} from '@lemoncloud/chatic-sockets-api';
import type { JoinNotify } from '@lemoncloud/chatic-socials-api';

import type { DomainChannel } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

import { liveSelection, switchesSettled } from './switchesSettled';

export const useDesktopChannelMutations = () => {
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const [isMutating, setIsMutating] = useState(false);

    const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
        setIsMutating(true);
        return op().finally(() => setIsMutating(false));
    }, []);

    const queryClient = useQueryClient();
    const startRef = useRef({ cloudId: selectedCloudId, placeId: selectedSiteId });
    startRef.current = { cloudId: selectedCloudId, placeId: selectedSiteId };

    const createChannel = useCallback(
        (payload: ChannelCreateInput): Promise<DomainChannel> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));
            const startedAt = startRef.current;
            return run(async () => {
                await switchesSettled(queryClient);
                const now = liveSelection();
                if ((now.cloudId ?? 'default') !== startedAt.cloudId || now.placeId !== startedAt.placeId) {
                    throw new Error('[createChannel] the place changed before the channel was created');
                }
                return channelRepository.createChannel(payload, startedAt.placeId ?? '');
            });
        },
        [channelRepository, run, queryClient]
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

    const setChannelNotify = useCallback(
        ({ channelId, userId, notify }: { channelId: string; userId: string; notify: JoinNotify }): Promise<void> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            if (!userId) return Promise.reject(new Error('userId is required'));
            const payload = { channelId, userId, notify } as unknown as ChannelUpdateJoinInput;
            return run(() => joinRepository.updateJoin(payload)).then(receipt => receipt.delivered);
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
