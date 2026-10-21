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

import type { DomainChannel } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { liveSelection, switchesSettled } from './switchesSettled';

/**
 * Desktop channel-write hook. Wraps the engine's channel repository for every
 * write the desktop UI needs (create / rename / delete / leave-kick / invite).
 *
 * WHY HERE (not libs/app-runtime): the engine already exposes the channel
 * repository via runtime.data.useRuntimeRepositories(); apps/web wraps it in its own feature-level
 * useChannelMutations. We mirror that app-side convention rather than widen the
 * shared engine surface.
 *
 * A single `isMutating` flag is exposed — the desktop UI runs these one at a
 * time (dialog/confirm flows), so per-op flags would be needless complexity.
 */
export const useDesktopChannelMutations = () => {
    const { channel: channelRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    // Tags the optimistic row created below; the repository used to take it off the ambient data
    // context, which disagrees with the session during a site switch (ADR-0085).
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const [isMutating, setIsMutating] = useState(false);

    const run = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
        setIsMutating(true);
        return op().finally(() => setIsMutating(false));
    }, []);

    const queryClient = useQueryClient();
    const startRef = useRef({ cloudId: selectedCloudId, placeId: selectedSiteId });
    startRef.current = { cloudId: selectedCloudId, placeId: selectedSiteId };

    // The create names no place: the server files the channel under the place the session is in. A
    // switch shows the new place before the session has moved, so a create sent in that window went
    // into the place being left, where the list it was made from never showed it. It waits for the
    // switch to settle, then goes out only if the session landed where it was asked from.
    const createChannel = useCallback(
        (payload: ChannelCreateInput): Promise<DomainChannel> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));
            const startedAt = startRef.current;
            return run(async () => {
                await switchesSettled(queryClient);
                const now = liveSelection();
                // The selection reads a missing cloud as the default one; the live read leaves it empty.
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

    // No 1:1 is created here: the socket v2 `channel.create` contract drops
    // `userIds`, so a dm-stereo start reaches the backend as owner-only and its
    // derived channel id collides with existing channels (destroys their
    // memberIds). A 1:1 is opened by naming the peer instead — see useStartDm.

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
        }): Promise<void> => {
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            if (!userId) return Promise.reject(new Error('userId is required'));
            // ChannelUpdateJoinInput types only channelId/joinId/notify; the engine resolves
            // the join row from channelId + userId at write time, so pass userId via a cast.
            const payload = { channelId, userId, notify } as unknown as ChannelUpdateJoinInput;
            // A state write: written locally and handed to the outbox, so `run` covers only the local
            // half. The promise returned is the server half — it rejects only on a refusal, and stays
            // pending while the socket is down.
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
