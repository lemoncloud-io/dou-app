import { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useChatRepository, useJoinRepository } from '../repository';
import type { ClientChatView } from '../types';

/**
 * 특정 채널의 메시지 목록을 조회하고 가공하여 상태로 관리하는 훅
 * 백그라운드에서 `chat:feed`를 통해 서버와 최신/과거 데이터를 동기화
 */
export const useChats = (initialParams: ChatFeedPayload) => {
    const targetChannelId = initialParams.channelId ?? 'default';

    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const chatRepository = useChatRepository(cloudId);
    const joinRepository = useJoinRepository(cloudId);

    const [messages, setMessages] = useState<ClientChatView[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isError, setIsError] = useState(false);

    const currentParamsRef = useRef<ChatFeedPayload>(initialParams);
    /**
     * 로컬 DB에서 데이터 패칭 및 ClientChatView로의 매핑/정렬/필터링
     */
    const requestFromLocal = useCallback(
        async (params?: ChatFeedPayload) => {
            try {
                setIsError(false);

                if (params) {
                    currentParamsRef.current = { ...currentParamsRef.current, ...params };
                }
                const activeParams = currentParamsRef.current;
                const channelId = activeParams.channelId ?? targetChannelId;

                const [rawMsgs, activeJoins] = await Promise.all([
                    chatRepository.getChatsByChannel(channelId),
                    joinRepository.getActiveJoinsByChannel(channelId),
                ]);

                const totalActiveMembers = activeJoins.length;

                let processedData = rawMsgs
                    .sort((a, b) => {
                        const noA = a.chatNo ?? Number.MAX_SAFE_INTEGER;
                        const noB = b.chatNo ?? Number.MAX_SAFE_INTEGER;
                        if (noA === noB && a.createdAt && b.createdAt) {
                            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                        }
                        return noA - noB;
                    })
                    .map((msg): ClientChatView => {
                        let unreadCount = 0;
                        const isPending = !msg.chatNo;
                        const timestamp = msg?.createdAt ? new Date(msg.createdAt) : new Date();
                        const isSystem = msg.stereo === 'system';
                        const ownerName = msg.owner$?.name || '...';

                        if (msg.chatNo !== undefined) {
                            const readCount = activeJoins.filter(join => (join.chatNo || 0) >= msg.chatNo!).length;
                            unreadCount = Math.max(0, totalActiveMembers - readCount);
                        } else {
                            unreadCount = Math.max(0, totalActiveMembers - 1);
                        }

                        return { ...msg, unreadCount, isPending, timestamp, isSystem, ownerName };
                    });

                if (activeParams.limit) {
                    const limit = activeParams.limit;
                    const page = activeParams.page ?? 0;
                    processedData = processedData.slice(-(limit * (page + 1)));
                }

                setMessages(processedData);
            } catch (error) {
                console.error(`Failed to load chats for channel ${targetChannelId}:`, error);
                setIsError(true);
            } finally {
                setIsLoading(false);
            }
        },
        [targetChannelId, chatRepository, joinRepository]
    );

    /**
     * 서버에 최신(또는 과거) 메시지 목록 동기화 요청 (chat:feed)
     */
    const requestFromNetwork = useCallback(
        (params?: ChatFeedPayload) => {
            if (targetChannelId === 'default') return; // 기본 상태일 땐 요청 방지

            setIsSyncing(true);

            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;
            if (!activeParams.channelId) activeParams.channelId = targetChannelId;

            emitAuthenticated({
                type: 'chat',
                action: 'feed',
                payload: activeParams,
            });

            setTimeout(() => setIsSyncing(false), 5000);
        },
        [targetChannelId, emitAuthenticated]
    );

    /**
     * 초기 마운트 및 채널 변경 시 로드
     */
    useEffect(() => {
        void requestFromLocal(initialParams);
        requestFromNetwork(initialParams);
    }, [requestFromLocal, requestFromNetwork, initialParams]);

    /**
     * 통합 이벤트 버스 구독
     */
    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;

            const isRelevantDomain = detail.domain === 'chat' || detail.domain === 'join';
            const isMyCloud = detail.cid === chatRepository.cloudId;
            const isMyChannel = detail.targetId === targetChannelId;

            if (isRelevantDomain && isMyCloud && isMyChannel) {
                // 이벤트 수신 시에는 초기 렌더링 파라미터 기준 최신화
                void requestFromLocal();
                setIsSyncing(false);
            }
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [targetChannelId, chatRepository.cloudId, requestFromLocal]);

    return {
        messages,
        isLoading,
        isSyncing,
        isError,
        refresh: (options?: ChatFeedPayload) => {
            void requestFromLocal(options);
            requestFromNetwork(options);
        },
        sync: (options?: ChatFeedPayload) => requestFromNetwork(options),
    };
};
