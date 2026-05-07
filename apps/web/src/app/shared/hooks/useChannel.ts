import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { ClientChannelView } from '@chatic/data';
import type { ChannelView, JoinView } from '@lemoncloud/chatic-socials-api';
import { useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';

const DEFAULT_CHANNEL_LIMIT = 100;

const toClientChannel = (channel: ChannelView, userId?: string): ClientChannelView => {
    const lastChatNo = channel.lastChat$?.chatNo ?? channel.chatNo ?? 0;
    const lastMessageIsMine = channel.lastChat$?.ownerId === userId;
    const myReadNo = lastMessageIsMine ? lastChatNo : (channel.$join?.chatNo ?? 0);
    const memberCount = channel.memberIds?.length ?? channel.$joins?.length ?? 0;

    return {
        ...channel,
        isOwner: channel.ownerId === userId,
        isSelfChat: channel.stereo === 'self',
        memberCount,
        unreadCount: channel.unreadCount ?? Math.max(0, lastChatNo - myReadNo),
    };
};

/**
 * 특정 채널의 상세 정보를 repository를 통해 조회하고, 실시간 이벤트에 반응하는 훅
 */
export const useChannel = (channelId: string | null) => {
    const { channel: channelRepository, join: joinRepository } = useRepositories();
    const profile = useDynamicProfile();
    const userId = profile?.uid;
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const requestSeqRef = useRef(0);

    const [channel, setChannel] = useState<ClientChannelView | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    const fetchChannel = useCallback(async () => {
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            setIsError(false);
            return;
        }

        const requestSeq = requestSeqRef.current + 1;
        requestSeqRef.current = requestSeq;

        setIsError(false);

        try {
            const result = await channelRepository.fetchChannel(
                { detail: true, limit: DEFAULT_CHANNEL_LIMIT },
                { cachePolicy: 'network-only' }
            );
            if (requestSeqRef.current !== requestSeq) return;

            const found = (result.list ?? []).find((ch: ChannelView) => ch.id === channelId);
            setChannel(found ? toClientChannel(found, userIdRef.current) : null);
        } catch (error) {
            if (requestSeqRef.current !== requestSeq) return;

            logger.error('DATA', `Failed to fetch channel ${channelId} from repository`, {
                error,
                data: { channelId },
            });
            setIsError(true);
            setChannel(null);
        } finally {
            if (requestSeqRef.current === requestSeq) {
                setIsLoading(false);
            }
        }
    }, [channelId, channelRepository]);

    useEffect(() => {
        setIsLoading(true);
        void fetchChannel();
    }, [fetchChannel]);

    useEffect(() => {
        if (!channelId) return;

        const unsubscribeUpdated = channelRepository.onChannelUpdated((ch: ChannelView) => {
            if (ch.id !== channelId) return;
            setChannel(toClientChannel(ch, userIdRef.current));
        });

        const unsubscribeDeleted = channelRepository.onChannelDeleted((ch: ChannelView) => {
            if (ch.id !== channelId) return;
            setChannel(null);
        });

        const unsubscribeJoinCreated = joinRepository.onJoinCreated((join: JoinView) => {
            if (join.channelId !== channelId) return;
            void fetchChannel();
        });

        const unsubscribeJoinDeleted = joinRepository.onJoinDeleted((join: JoinView) => {
            if (join.channelId !== channelId) return;
            void fetchChannel();
        });

        return () => {
            unsubscribeUpdated();
            unsubscribeDeleted();
            unsubscribeJoinCreated();
            unsubscribeJoinDeleted();
        };
    }, [channelId, channelRepository, joinRepository, fetchChannel]);

    return {
        channel,
        isLoading,
        isError,
        refresh: () => void fetchChannel(),
    };
};
