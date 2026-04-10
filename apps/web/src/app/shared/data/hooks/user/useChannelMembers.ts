import { useCallback, useEffect, useState, useRef } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useUserRepository } from '../../repository';
import type { UserView } from '@lemoncloud/chatic-socials-api';
import type { ChatUsersPayload } from '@lemoncloud/chatic-sockets-api';
import type { AppSyncDetail } from '../../sync';
import { APP_SYNC_EVENT_NAME } from '../../sync';

/**
 * 특정 채널의 멤버 목록을 로컬 DB에서 즉시 조회 및
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 훅
 */
export const useChannelMembers = (initialParams: ChatUsersPayload) => {
    const targetChannelId = initialParams.channelId ?? 'default';

    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const userRepository = useUserRepository(cloudId);

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
                const cid = activeParams.channelId ?? targetChannelId;

                const data = await userRepository.getUsersByChannel(cid);

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
            if (targetChannelId === 'default') return;

            setIsSyncing(true);

            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;

            if (!activeParams.channelId) activeParams.channelId = targetChannelId;

            emitAuthenticated({
                type: 'chat',
                action: 'users',
                payload: activeParams,
            });

            setTimeout(() => setIsSyncing(false), 5000);
        },
        [targetChannelId, emitAuthenticated]
    );

    useEffect(() => {
        void loadFromDb(initialParams);
        requestSync(initialParams);
    }, [loadFromDb, requestSync, initialParams]);

    useEffect(() => {
        if (!userRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (
                detail.domain === 'user' &&
                detail.cid === userRepository.cloudId &&
                detail.targetId === targetChannelId
            ) {
                // 이제 최신 페이지네이션 값을 기억한 상태로 DB 조회를 수행합니다.
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
