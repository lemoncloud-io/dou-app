import { useState, useEffect, useCallback } from 'react';
import { useChannelRepository } from '../../repository';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';
import { cloudCore } from '@chatic/web-core';
import { useWebSocketV2 } from '@chatic/socket';

/**
 * 특정 워크스페이스(Place)의 채널 목록을 로컬 DB에서 즉시 조회
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 Query 훅
 */
export const useChannels = () => {
    const placeId = cloudCore.getSelectedPlaceId() ?? 'default';
    const repository = useChannelRepository();
    const { emitAuthenticated } = useWebSocketV2();

    const [channels, setChannels] = useState<ChannelView[]>([]);

    // 로컬 DB 최초 조회 로딩
    const [isLoading, setIsLoading] = useState(true);
    // 서버 최신 데이터 동기화 로딩
    const [isSyncing, setIsSyncing] = useState(false);
    // 데이터 조회 에러 상태
    const [isError, setIsError] = useState(false);

    /**
     * 로컬 DB에서 채널 목록 읽어오기 및 정렬
     */
    const loadFromDb = useCallback(async () => {
        try {
            setIsError(false);
            const channelsData: CacheChannelView[] = await repository.getChannelsByPlace(placeId);

            // 최신 메시지 순으로 정렬
            const sortedChannels = channelsData.sort((a, b) => {
                const timeA = new Date(a.lastChat$?.createdAt ?? a.updatedAt ?? 0).getTime();
                const timeB = new Date(b.lastChat$?.createdAt ?? b.updatedAt ?? 0).getTime();
                return timeB - timeA;
            });

            // UI 컴포넌트 호환성을 위해 로컬 전용 식별자(sid) 제거 후 상태 업데이트
            setChannels(sortedChannels.map(({ sid, ...rest }) => rest as ChannelView));
        } catch (error) {
            console.error('Failed to load channels from DB:', error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [repository, placeId]);

    /**
     * 서버에 최신 채널 목록 동기화 요청
     */
    const requestSync = useCallback(() => {
        setIsSyncing(true);
        emitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });

        // 서버 무응답 대비 5초 후 타임아웃 해제
        setTimeout(() => setIsSyncing(false), 5000);
    }, [placeId, emitAuthenticated]);

    /**
     * 초기 마운트 및 placeId 변경 시: DB 로드와 서버 갱신을 동시 수행
     */
    useEffect(() => {
        void loadFromDb();
        requestSync();
    }, [loadFromDb, requestSync]);

    /**
     * 이벤트 버스 구독
     */
    useEffect(() => {
        if (!repository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;

            // 채널 메타데이터나 채팅 내용이 현재 클라우드에서 갱신되었을 때
            if ((detail.domain === 'channel' || detail.domain === 'chat') && detail.cid === repository.cloudId) {
                void loadFromDb();
                setIsSyncing(false);
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [repository.cloudId, loadFromDb]);

    return {
        channels,
        isLoading,
        isSyncing,
        isError,
        refresh: () => {
            void loadFromDb();
            requestSync();
        },
        sync: requestSync,
    };
};
