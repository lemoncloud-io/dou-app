import { useCallback, useEffect, useState } from 'react';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2 } from '@chatic/socket';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelRepository } from '../repository';
import type { ClientChannelView } from '../types';
import { useDynamicProfile } from '@chatic/web-core';

/**
 * 특정 채널의 상세 정보를 로컬 DB에서만 단방향으로 조회하는 훅.
 * 서버에 명시적으로 페칭(네트워크 요청)을 보내지 않으며, 로컬 DB 변경 이벤트만 구독합니다.
 */
export const useChannel = (channelId: string | null) => {
    const { cloudId } = useWebSocketV2();
    const repository = useChannelRepository(cloudId);
    const profile = useDynamicProfile();

    const [channel, setChannel] = useState<ClientChannelView | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);

    /**
     * 로컬 DB에서 단일 채널 정보 읽어오기
     */
    const requestFromLocal = useCallback(async () => {
        if (!channelId) {
            setChannel(null);
            setIsLoading(false);
            return;
        }

        try {
            setIsError(false);
            const channelData: CacheChannelView | null = await repository.getChannel(channelId);

            if (channelData) {
                const { sid, ...rest } = channelData as any;
                const baseChannel = rest as ChannelView;

                // ClientChannelView 규격에 맞게 파생 속성 매핑
                const clientChannel: ClientChannelView = {
                    ...baseChannel,
                    isOwner: baseChannel.ownerId === profile?.uid,
                    isSelfChat: baseChannel.stereo === 'self',
                    memberCount: baseChannel.memberNo || 0,
                };

                setChannel(clientChannel);
            } else {
                setChannel(null);
            }
        } catch (error) {
            console.error(`Failed to load channel ${channelId} from DB:`, error);
            setIsError(true);
            setChannel(null);
        } finally {
            setIsLoading(false);
        }
    }, [channelId, repository]);

    // 초기 마운트 및 channelId 변경 시 로컬 DB 조회
    useEffect(() => {
        setIsLoading(true);
        void requestFromLocal();
    }, [channelId, requestFromLocal]);

    // 전역 이벤트 버스 구독
    useEffect(() => {
        if (!repository.cloudId || !channelId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            if (detail.domain === 'channel' && detail.targetId === channelId && detail.cid === repository.cloudId) {
                void requestFromLocal();
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [repository.cloudId, channelId, requestFromLocal]);

    return {
        channel,
        isLoading,
        isError,
        refresh: () => void requestFromLocal(),
    };
};
