import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import { useChannelRepository } from '../repository';
import type { ClientChatMinePayload, ClientChannelView } from '../types';

/**
 * 특정 워크스페이스(Place)의 채널 목록을 로컬 DB에서 즉시 조회
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 Query 훅
 */
export const useChannels = (initialParams: ClientChatMinePayload) => {
    const targetPlaceId = initialParams.placeId;
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const repository = useChannelRepository(cloudId);

    // 현재 접속 중인 내 프로필 정보
    const profile = useDynamicProfile();
    const [channels, setChannels] = useState<ClientChannelView[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const currentParamsRef = useRef<ClientChatMinePayload>(initialParams);
    /**
     * 로컬 DB에서 채널 목록 읽어오기 및 정렬
     */
    const requestFromLocal = useCallback(
        async (params?: ClientChatMinePayload) => {
            try {
                setIsError(false);
                if (params) {
                    currentParamsRef.current = { ...currentParamsRef.current, ...params };
                }
                const activeParams = currentParamsRef.current;
                const placeId = activeParams.placeId;

                if (!placeId) {
                    setChannels([]);
                    setIsLoading(false);
                    return;
                }

                const channelsData: CacheChannelView[] = await repository.getChannelsByPlace(placeId);

                const sortedChannels = channelsData.sort((a, b) => {
                    const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
                    const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
                    return timeB - timeA;
                });

                let resultChannels: ClientChannelView[] = sortedChannels.map(({ sid, ...rest }) => {
                    const baseChannel = rest as ChannelView;
                    return {
                        ...baseChannel,
                        isOwner: baseChannel.ownerId === profile?.uid,
                        isSelfChat: baseChannel.stereo === 'self',
                        memberCount: baseChannel.memberNo || 0,
                    };
                });

                if (activeParams.limit) {
                    const limit = activeParams.limit;
                    const page = activeParams.page ?? 0;
                    const startIndex = page * limit;
                    resultChannels = resultChannels.slice(startIndex, startIndex + limit);
                }

                setChannels(resultChannels);
            } catch (error) {
                console.error('Failed to load channels from DB:', error);
                setIsError(true);
            } finally {
                setIsLoading(false);
            }
        },
        [repository, profile?.uid]
    );

    /**
     * 서버에 최신 채널 목록 동기화 요청
     */
    const requestFromNetwork = useCallback(
        (params?: ClientChatMinePayload) => {
            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;
            const placeId = activeParams.placeId;

            if (!placeId) return;

            setIsSyncing(true);
            emitAuthenticated({
                type: 'chat',
                action: 'mine',
                payload: activeParams,
            });

            setTimeout(() => setIsSyncing(false), 5000);
        },
        [emitAuthenticated]
    );

    useEffect(() => {
        currentParamsRef.current = initialParams;

        setIsLoading(true);
        void requestFromLocal(initialParams);
        requestFromNetwork(initialParams);
    }, [targetPlaceId, requestFromLocal, requestFromNetwork]);

    useEffect(() => {
        if (!repository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            if ((detail.domain === 'channel' || detail.domain === 'chat') && detail.cid === repository.cloudId) {
                void requestFromLocal();
                setIsSyncing(false);
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [repository.cloudId, requestFromLocal]);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ClientChatMinePayload) => {
            void requestFromLocal(options);
            requestFromNetwork(options);
        },
        sync: (options?: ClientChatMinePayload) => requestFromNetwork(options),
    };
};
