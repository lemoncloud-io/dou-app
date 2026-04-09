import { useState, useEffect, useCallback } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import { useChannelRepository } from '../../repository';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';

/**
 * 특정 단일 채널의 상세 정보를 로컬 DB에서 즉시 조회
 * 백그라운드에서 최신 데이터를 서버에 요청하여 동기화하는 Query 훅
 */
export const useChannel = (channelId?: string | null) => {
    const targetChannelId = channelId ?? 'default';

    const { emitAuthenticated } = useWebSocketV2();
    const repository = useChannelRepository();

    const [channel, setChannel] = useState<ChannelView | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    /**
     *  로컬 DB에서 단일 채널 정보 읽어오기
     */
    const loadFromDb = useCallback(async () => {
        try {
            setIsError(false);
            const data: CacheChannelView | null = await repository.getChannel(targetChannelId);

            if (data) {
                const { sid, ...rest } = data as any;
                setChannel(rest as ChannelView);
            } else {
                setChannel(null); // DB에 없는 경우
            }
        } catch (error) {
            console.error(`Failed to load channel (${targetChannelId}) from DB:`, error);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, [repository, targetChannelId]);

    /**
     * 서버에 해당 채널의 최신 상세 정보 요청
     */
    const requestSync = useCallback(() => {
        setIsSyncing(true);
        emitAuthenticated({
            type: 'chat',
            action: 'channel',
            payload: { channelId: targetChannelId },
        });

        setTimeout(() => setIsSyncing(false), 5000);
    }, [targetChannelId, emitAuthenticated]);

    /**
     * 초기 마운트 및 채널 변경 시 DB 로드, 최신화 동시 수행
     */
    useEffect(() => {
        void loadFromDb();
        requestSync();
    }, [loadFromDb, requestSync]);

    /**
     *  이벤트 버스 구독
     */
    useEffect(() => {
        if (!repository.cloudId) return;

        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;

            // 해당 채널의 정보(이름 변경 등) 또는 채팅이 갱신되었을 때
            if (
                (detail.domain === 'channel' || detail.domain === 'chat') &&
                detail.cid === repository.cloudId &&
                detail.targetChannelId === targetChannelId
            ) {
                void loadFromDb();
                setIsSyncing(false);
            }
        };

        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [repository.cloudId, targetChannelId, loadFromDb]);

    return {
        channel,
        isLoading,
        isSyncing,
        isError,
        refresh: () => {
            void loadFromDb();
            requestSync();
        },
    };
};
