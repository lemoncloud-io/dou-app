import { useCallback, useEffect, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useUserRepository } from '../../repository';
import type { UserView } from '@lemoncloud/chatic-socials-api';

interface UseChannelMembersOptions {
    limit?: number;
    page?: number;
    detail?: boolean;
}

/**
 * 특정 채널의 멤버 목록을 로컬 DB에서 즉시 조회 및
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 훅
 */
export const useChannelMembers = (channelId?: string | null, options: UseChannelMembersOptions = {}) => {
    const targetChannelId = channelId ?? 'default';

    const { emitAuthenticated } = useWebSocketV2();
    const userRepository = useUserRepository();

    const [members, setMembers] = useState<UserView[]>([]);
    const [total, setTotal] = useState<number>(0);

    // DB에서 꺼내오는 최초 로딩 상태
    const [isLoading, setIsLoading] = useState(true);
    // 서버에 최신 목록을 요청하고 기다리는 백그라운드 로딩 상태
    const [isSyncing, setIsSyncing] = useState(false);
    // 에러 추적
    const [isError, setIsError] = useState(false);

    const { limit = 100, page = 0, detail = true } = options;

    /**
     *  로컬 DB에서 멤버 목록 읽어오기
     */
    const loadFromDb = useCallback(async () => {
        try {
            setIsError(false);
            const data = await userRepository.getUsersByChannel(targetChannelId);
            setMembers(data);
            setTotal(data.length);
        } catch (error) {
            console.error('Failed to load members from DB:', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [targetChannelId, userRepository]);

    /**
     * 서버에 최신 데이터 동기화 요청 (Background Sync Request)
     */
    const requestSync = useCallback(() => {
        setIsSyncing(true);
        emitAuthenticated({
            type: 'chat',
            action: 'users',
            payload: { targetChannelId: targetChannelId, limit, page, detail },
        });
        setTimeout(() => setIsSyncing(false), 5000);
    }, [targetChannelId, limit, page, detail, emitAuthenticated]);

    /**
     * 초기 마운트 시 DB 로드 및 서버 갱신 요청
     */
    useEffect(() => {
        void loadFromDb();
        requestSync();
    }, [loadFromDb, requestSync]);

    /**
     * 이벤트 버스 구독
     */
    useEffect(() => {
        if (!userRepository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail: eventDetail } = e as CustomEvent;

            // 내 채널의 멤버가 갱신되었을 때만
            if (
                eventDetail.domain === 'user' &&
                eventDetail.cid === userRepository.cloudId &&
                eventDetail.targetChannelId === targetChannelId
            ) {
                void loadFromDb();
                setIsSyncing(false);
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [targetChannelId, userRepository.cloudId, loadFromDb]);

    return {
        members,
        total,
        isLoading,
        isSyncing,
        isError,
        refresh: () => {
            void loadFromDb();
            requestSync();
        },
    };
};
