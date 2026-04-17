import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocketV2 } from '@chatic/socket';
import type { AppSyncDetail } from '../sync-events';
import { APP_SYNC_EVENT_NAME } from '../sync-events';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useChatRepository, useJoinRepository, useUserRepository } from '../repository';
import type { ClientChatView } from '../types';
import { ChatMapper } from '../types/mapper';
import { useDynamicProfile } from '@chatic/web-core';
import { useConnectionRecoverySync } from './useConnectionRecoverySync';

/**
 * 특정 채널의 메시지 목록을 서버 feed 응답에서 직접 누적하여 관리하는 훅
 * cursorNo 기반 역방향 페이지네이션(loadMore) 지원
 */
export const useChats = (initialParams: ChatFeedPayload) => {
    const targetChannelId = initialParams.channelId;
    const { emitAuthenticated, cloudId } = useWebSocketV2();
    const dynamicProfile = useDynamicProfile();
    const userId = dynamicProfile?.uid;
    const chatRepository = useChatRepository(cloudId);
    const joinRepository = useJoinRepository(cloudId);
    const userRepository = useUserRepository(cloudId);

    const [messages, setMessages] = useState<ClientChatView[]>([]);
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);
    const [status, setStatus] = useState({
        isLoading: true,
        isSyncing: false,
        isLoadingMore: false,
        isError: false,
    });

    const currentParamsRef = useRef<ChatFeedPayload>(initialParams);

    /**
     * 로컬 DB에서 데이터 패칭 및 ClientChatView로의 매핑/정렬/필터링
     * @param cleanPending true면 orphaned pending 메시지를 DB에서 삭제 (마운트 시 1회)
     */
    const requestFromLocal = useCallback(
        async (params?: ChatFeedPayload, cleanPending = false) => {
            try {
                if (params) currentParamsRef.current = { ...currentParamsRef.current, ...params };
                const activeParams = currentParamsRef.current;
                const channelId = activeParams.channelId ?? targetChannelId;

                if (!channelId) {
                    setMessages([]);
                    setStatus(prev => ({ ...prev, isLoading: false, isError: false }));
                    return;
                }

                const [rawMsgsFromDB, activeJoins] = await Promise.all([
                    chatRepository.getChatsByChannel(channelId),
                    joinRepository.getActiveJoinsByChannel(channelId),
                ]);

                // 마운트 시 orphaned pending 메시지 정리
                // 새로고침/재진입 후 in-memory promise/timeout이 없어 pending → confirmed 전환 불가
                let rawMsgs = rawMsgsFromDB;
                if (cleanPending) {
                    const pendingMsgs = rawMsgsFromDB.filter(m => m.isPending);
                    if (pendingMsgs.length > 0) {
                        await Promise.all(pendingMsgs.map(m => chatRepository.deleteChat(m.id!)));
                        rawMsgs = rawMsgsFromDB.filter(m => !m.isPending);
                    }
                }

                // owner$ 없는 메시지를 위해 user repository에서 이름 조회
                const ownerIds = [...new Set(rawMsgs.map(m => m.ownerId).filter(Boolean))] as string[];
                const users = await userRepository.getUsers(ownerIds);
                const userNameMap = new Map(users.map(u => [u.id, u.name]));

                const totalActiveMembers = activeJoins.length;

                // 로컬 데이터는 limit 상관없이 전체 매핑 및 정렬
                const processedData = rawMsgs
                    .sort((a, b) => {
                        if (a.isPending && !b.isPending) return 1;
                        if (!a.isPending && b.isPending) return -1;
                        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return timeA - timeB;
                    })
                    .map((msg): ClientChatView => {
                        let unreadCount = 0;
                        if (msg.chatNo !== undefined) {
                            let readCount = activeJoins.filter(join => (join.chatNo || 0) >= msg.chatNo!).length;
                            // 내 메시지는 본인이 최소 1명으로 읽은 것으로 보장
                            if (msg.ownerId === userId && readCount === 0) readCount = 1;
                            unreadCount = Math.max(0, totalActiveMembers - readCount);
                        } else {
                            unreadCount = Math.max(0, totalActiveMembers - 1);
                        }

                        const mapped = ChatMapper.toClient(msg, unreadCount, userId);
                        // owner$가 없는 경우 user repository에서 조회한 이름으로 보강
                        if (mapped.ownerName === '...' && msg.ownerId) {
                            const resolvedName = userNameMap.get(msg.ownerId);
                            if (resolvedName) {
                                return { ...mapped, ownerName: resolvedName };
                            }
                        }
                        return mapped;
                    });

                setMessages(processedData);
                setStatus({
                    isLoading: false,
                    isSyncing: false,
                    isError: false,
                    isLoadingMore: false,
                });
            } catch (error) {
                console.error(`Failed to load chats for channel ${targetChannelId}:`, error);
                setStatus(prev => ({ ...prev, isLoading: false, isError: true }));
            }
        },
        [targetChannelId, chatRepository, joinRepository, userRepository, userId]
    );

    /**
     * 서버에 최신(또는 과거) 메시지 목록 동기화 요청 (chat:feed)
     */
    const requestFromNetwork = useCallback(
        (params?: Partial<ChatFeedPayload>) => {
            const channelId = params?.channelId ?? targetChannelId;
            if (!channelId) return;

            const feedPayload: ChatFeedPayload = { channelId };
            if (params?.cursorNo !== undefined) feedPayload.cursorNo = params.cursorNo;
            if (params?.limit) feedPayload.limit = params.limit;

            emitAuthenticated({
                type: 'chat',
                action: 'feed',
                payload: feedPayload,
            });
        },
        [targetChannelId, emitAuthenticated]
    );

    /**
     * 초기 마운트 및 채널 변경 시 로드
     * 로컬 DB에서 먼저 조회하여 즉시 표시하고, 네트워크 sync는 병렬로 진행
     */
    useEffect(() => {
        setFeedCursorNo(undefined);
        setStatus(prev => ({ ...prev, isSyncing: true, isLoadingMore: false, isError: false }));
        requestFromNetwork({ channelId: targetChannelId });
        void requestFromLocal({ channelId: targetChannelId }, true);
    }, [targetChannelId]);

    // 연속 이벤트(낙관적 업데이트 + 서버 응답) 시 DB 재조회를 1회로 병합
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedRequestFromLocal = useMemo(
        () => () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                void requestFromLocal();
            }, 50);
        },
        [requestFromLocal]
    );

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    // ref로 최신 함수 참조 유지 → 이벤트 리스너 재등록 없이 항상 최신 함수 호출
    const debouncedRequestFromLocalRef = useRef(debouncedRequestFromLocal);
    debouncedRequestFromLocalRef.current = debouncedRequestFromLocal;

    /**
     * 통합 이벤트 버스 구독
     * chatHandler/modelHandler가 로컬 DB 저장 후 이벤트를 발행하므로,
     * requestFromLocal()로 DB에서 재조회하여 isOwner/ownerName을 올바르게 매핑
     * model handler로 넘어온 join정보를 구독하기 위해 `detail.domain !== 'join'` 를 적용
     */
    useEffect(() => {
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent<AppSyncDetail>;
            if (detail.cid !== cloudId) return;
            if (detail.targetId !== targetChannelId) return;
            if (detail.domain !== 'chat' && detail.domain !== 'join') return;

            if (detail.action === 'feed') {
                const cursorNo: number | undefined = detail.payload?.cursorNo;
                if (cursorNo !== undefined) {
                    setFeedCursorNo(cursorNo);
                }
            }

            debouncedRequestFromLocalRef.current();
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleUpdate);
    }, [targetChannelId, cloudId]);

    // 포그라운드 복귀 + WebSocket 재연결 완료 시 데이터 재동기화
    useConnectionRecoverySync(requestFromLocal, requestFromNetwork);

    /**
     * 이전 메시지 로드 (역방향 페이지네이션)
     */
    const loadMore = useCallback(() => {
        if (feedCursorNo === undefined || feedCursorNo === 0) return;
        setStatus(prev => ({ ...prev, isLoadingMore: true }));
        requestFromNetwork({ channelId: targetChannelId, cursorNo: feedCursorNo });
    }, [feedCursorNo, targetChannelId, requestFromNetwork]);

    return {
        messages,
        ...status,
        hasMore: feedCursorNo !== undefined && feedCursorNo !== 0,
        loadMore,
        refresh: () => {
            setMessages([]);
            setFeedCursorNo(undefined);
            setStatus(prev => ({ ...prev, isLoading: true }));
            requestFromNetwork({ channelId: targetChannelId });
        },
        sync: () => requestFromNetwork({ channelId: targetChannelId }),
    };
};
