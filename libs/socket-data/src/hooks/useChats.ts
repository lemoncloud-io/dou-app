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
    const targetChannelId = initialParams.channelId;

    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const chatRepository = useChatRepository(cloudId);
    const joinRepository = useJoinRepository(cloudId);

    const [messages, setMessages] = useState<ClientChatView[]>([]);
    const [status, setStatus] = useState({
        isLoading: true,
        isSyncing: false,
        isError: false,
    });

    // 최신 파라미터 상태를 유지하기 위한 Ref
    const currentParamsRef = useRef<ChatFeedPayload>(initialParams);

    /**
     * 로컬 DB에서 데이터 패칭 및 ClientChatView로의 매핑/정렬/필터링
     */
    const requestFromLocal = useCallback(
        async (params?: ChatFeedPayload) => {
            try {
                if (params) {
                    currentParamsRef.current = { ...currentParamsRef.current, ...params };
                }
                const activeParams = currentParamsRef.current;
                const channelId = activeParams.channelId ?? targetChannelId;
                if (!channelId) {
                    setMessages([]);
                    setStatus(prev => ({ ...prev, isLoading: false, isError: false }));
                    return;
                }

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
                setStatus({
                    isLoading: false,
                    isSyncing: false,
                    isError: false,
                });
            } catch (error) {
                console.error(`Failed to load chats for channel ${targetChannelId}:`, error);
                setStatus(prev => ({ ...prev, isLoading: false, isError: true }));
            }
        },
        [targetChannelId, chatRepository, joinRepository]
    );

    /**
     * 서버에 최신(또는 과거) 메시지 목록 동기화 요청 (chat:feed)
     */
    const requestFromNetwork = useCallback(
        (params?: ChatFeedPayload) => {
            if (params) {
                currentParamsRef.current = { ...currentParamsRef.current, ...params };
            }
            const activeParams = currentParamsRef.current;
            const channelId = activeParams.channelId ?? targetChannelId;

            if (!channelId) return;

            setStatus(prev => ({ ...prev, isSyncing: true }));
            emitAuthenticated({
                type: 'chat',
                action: 'feed',
                payload: {
                    ...activeParams,
                    channelId: channelId,
                },
            });

            setTimeout(() => setStatus(prev => ({ ...prev, isSyncing: false })), 5000);
        },
        [targetChannelId, emitAuthenticated]
    );

    /**
     * 초기 마운트 및 채널 변경 시 로드
     */
    useEffect(() => {
        currentParamsRef.current = initialParams;
        setStatus(prev => ({ ...prev, isLoading: true }));
        void requestFromLocal(initialParams);
        requestFromNetwork(initialParams);
    }, [targetChannelId, requestFromLocal, requestFromNetwork]);

    /**
     * 통합 이벤트 버스 구독
     */
    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (detail.domain === 'chat' || detail.domain === 'join') {
                if (detail.cid === chatRepository.cloudId && detail.targetId === targetChannelId) {
                    void requestFromLocal();
                }
            }
        };
        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [targetChannelId, chatRepository.cloudId, requestFromLocal]);

    return {
        messages,
        ...status,
        refresh: (options?: ChatFeedPayload) => {
            setStatus(prev => ({ ...prev, isLoading: true }));
            void requestFromLocal(options);
            requestFromNetwork(options);
        },
        sync: (options?: ChatFeedPayload) => requestFromNetwork(options),
    };
};
