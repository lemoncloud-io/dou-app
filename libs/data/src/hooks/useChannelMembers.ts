import { useCallback, useEffect, useState, useRef } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useDynamicProfile } from '@chatic/web-core';
import { useUserRepository } from '../repository';
import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';

/**
 * 특정 채널의 멤버 목록을 로컬 DB에서 즉시 조회 및
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 훅
 * detail true 설정 시, 참여정보 노출
 */
export const useChannelMembers = (initialParams: ChatUsersPayload) => {
    const targetChannelId = initialParams.channelId;

    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const dynamicProfile = useDynamicProfile();
    const userRepository = useUserRepository(cloudId, dynamicProfile?.uid);

    const [members, setMembers] = useState<UserView[]>([]);
    const [total, setTotal] = useState<number>(0);

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const currentParamsRef = useRef<ChatUsersPayload>(initialParams);

    /**
     * 로컬 DB에서 멤버 목록 읽어오기
     */
    const loadFromDb = useCallback(
        async (params?: ChatUsersPayload) => {
            try {
                setIsError(false);

                if (params) {
                    currentParamsRef.current = { ...currentParamsRef.current, ...params };
                }
                const activeParams = currentParamsRef.current;
                const channelId = activeParams.channelId ?? targetChannelId;

                if (!channelId) {
                    setMembers([]);
                    setTotal(0);
                    setIsLoading(false);
                    return;
                }

                const data = await userRepository.getUsersByChannel(channelId);

                setMembers(data);
                setTotal(data.length);
            } catch (error) {
                console.error('Failed to load members from DB:', error);
                setIsError(true);
            } finally {
                setIsLoading(false);
            }
        },
        [userRepository, targetChannelId]
    );

    /**
     * 서버에 최신 데이터 동기화 요청 (chat:users)
     */
    const requestSync = useCallback(
        (params?: ChatUsersPayload) => {
            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;
            const finalChannelId = activeParams.channelId ?? targetChannelId;

            if (!finalChannelId || finalChannelId === 'default') return;

            setIsSyncing(true);

            emitAuthenticated({
                type: 'chat',
                action: 'users',
                payload: {
                    ...activeParams,
                    channelId: finalChannelId,
                },
            });

            setTimeout(() => setIsSyncing(false), 5000);
        },
        [targetChannelId, emitAuthenticated]
    );

    useEffect(() => {
        currentParamsRef.current = initialParams;

        setIsLoading(true);
        void loadFromDb(initialParams);
        requestSync(initialParams);
    }, [targetChannelId, loadFromDb, requestSync]);

    useEffect(() => {
        if (!userRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (
                detail.domain === 'user' &&
                detail.cid === userRepository.cloudId &&
                detail.targetId === targetChannelId
            ) {
                void loadFromDb();
                setIsSyncing(false);
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [targetChannelId, userRepository.cloudId, loadFromDb]);

    return {
        members,
        total,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ChatUsersPayload) => {
            void loadFromDb(options);
            requestSync(options);
        },
        sync: (options?: ChatUsersPayload) => requestSync(options),
    };
};
