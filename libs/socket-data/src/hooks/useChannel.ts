import { useCallback, useEffect, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelRepository, useJoinRepository } from '../repository';
import type { ClientChannelView } from '../types';
import type { CacheChannelView } from '@chatic/app-messages';
import { useDynamicProfile } from '@chatic/web-core';

/**
 * 특정 채널의 상세 정보를 로컬 DB에서만 단방향으로 조회하는 훅.
 * 서버에 명시적으로 페칭(네트워크 요청)을 보내지 않으며, 로컬 DB 변경 이벤트만 구독합니다.
 */

/**
 * 단일 채널을 로컬 DB에서 즉시 조회하고,
 * 서버 동기화 이벤트 수신 시 자동으로 갱신하는 Query 훅
 * - `$join` 을 attach 하여 unread 유도 계산에 사용하도록 한다
 */
export const useChannel = (channelId: string | undefined) => {
    const { cloudId } = useWebSocketV2();
    const repository = useChannelRepository(cloudId);
    const joinRepo = useJoinRepository(cloudId);
    const profile = useDynamicProfile();
    const [channel, setChannel] = useState<ClientChannelView | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    /**
     * 로컬 DB에서 단일 채널 정보 읽어오기
     */
    const myUserId = profile?.uid ?? '';
    const loadFromLocal = useCallback(async () => {
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }

        try {
            setIsError(false);
            // const [channelData, joins] = await Promise.all([
            //     repository.getChannel(channelId),
            //     profile?.uid ? joinRepo.getJoinsByChannel(channelId) : Promise.resolve([]),
            // ]);

            // if (channelData) {
            //     const { sid, ...rest } = channelData as any;
            //     const baseChannel = rest as ChannelView;
            //     const myJoin = (joins as JoinView[]).find(j => j.userId === profile?.uid);

            //     const lastChatNo = baseChannel.lastChat$?.chatNo || 0;
            //     const myReadNo = myJoin?.chatNo || 0;
            //     const unreadCount = Math.max(0, lastChatNo - myReadNo);

            //     const clientChannel: ClientChannelView = {
            //         ...baseChannel,
            //         isOwner: baseChannel.ownerId === profile?.uid,
            //         isSelfChat: baseChannel.stereo === 'self',
            //         memberCount: baseChannel.memberNo || 0,
            //         unreadCount,
            //     };
            //     setChannel(clientChannel);
            const data: CacheChannelView | null = await repository.getChannel(channelId);
            if (data) {
                const { sid, ...rest } = data;
                const $join = myUserId ? await joinRepo.getJoin(`${channelId}@${myUserId}`) : null;
                setChannel({ ...(rest as ClientChannelView), $join: $join ?? undefined });
            } else {
                setChannel(null);
            }
        } catch (error) {
            console.error('Failed to load channel from DB:', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [channelId, repository, joinRepo, myUserId]);

    useEffect(() => {
        setIsLoading(true);
        void loadFromLocal();
    }, [loadFromLocal]);

    useEffect(() => {
        if (!repository.cloudId || !channelId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            if (
                (detail.domain === 'channel' || detail.domain === 'chat' || detail.domain === 'join') &&
                detail.cid === repository.cloudId
            ) {
                void loadFromLocal();
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [repository.cloudId, channelId, loadFromLocal]);

    return {
        channel,
        isLoading,
        isError,
        refresh: () => void loadFromLocal(),
    };
};
