import { useCallback, useState } from 'react';

import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type {
    ChatDeleteChannelPayload,
    ChatInvitePayload,
    ChatLeavePayload,
    ChatStartPayload,
    ChatUpdateChannelPayload,
} from '@lemoncloud/chatic-sockets-api';

import { useRepositories } from '../data';

type MutationAction = 'leave' | 'delete' | 'start' | 'update' | 'invite';

/**
 * 채널 관련 쓰기/수정 명령을 repository를 통해 서버에 전달하는 훅
 */
export const useChannelMutations = () => {
    const { channel: channelRepository, chat: chatRepository } = useRepositories();

    const [pendingStates, setPendingStates] = useState<Record<MutationAction, boolean>>({
        leave: false,
        delete: false,
        start: false,
        update: false,
        invite: false,
    });

    const withPending = useCallback(<T>(action: MutationAction, fn: () => Promise<T>): Promise<T> => {
        setPendingStates(prev => ({ ...prev, [action]: true }));
        return fn().finally(() => {
            setPendingStates(prev => ({ ...prev, [action]: false }));
        });
    }, []);

    const createChannel = useCallback(
        (payload: ChatStartPayload): Promise<ChannelView> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));
            return withPending('start', () => channelRepository.createChannel(payload));
        },
        [channelRepository, withPending]
    );

    const leaveChannel = useCallback(
        (payload: ChatLeavePayload): Promise<void> => {
            const { channelId } = payload;
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            return withPending('leave', () =>
                channelRepository.leaveChannel(payload).then(() => {
                    void chatRepository.clearByChannelId(channelId);
                })
            );
        },
        [channelRepository, chatRepository, withPending]
    );

    const deleteChannel = useCallback(
        (payload: ChatDeleteChannelPayload): Promise<void> => {
            const { channelId } = payload;
            if (!channelId) return Promise.reject(new Error('channelId is required'));
            return withPending('delete', () =>
                channelRepository.deleteChannel(payload).then(() => {
                    void chatRepository.clearByChannelId(channelId);
                })
            );
        },
        [channelRepository, chatRepository, withPending]
    );

    const updateChannel = useCallback(
        (payload: ChatUpdateChannelPayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            return withPending('update', () => channelRepository.updateChannel(payload).then(() => undefined));
        },
        [channelRepository, withPending]
    );

    const inviteChannel = useCallback(
        (payload: ChatInvitePayload): Promise<void> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.userIds?.length) return Promise.reject(new Error('userIds are required'));
            return withPending('invite', () => channelRepository.inviteChannel(payload).then(() => undefined));
        },
        [channelRepository, withPending]
    );

    return {
        isPending: pendingStates,
        createChannel,
        leaveChannel,
        deleteChannel,
        updateChannel,
        inviteChannel,
    };
};
