import { useState, useEffect, useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../local';
import { getSocketSend, useWebSocketV2Store } from '@chatic/socket';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { ClientChatView } from '../../types';

/**
 * 특정 채널의 채팅 메시지 및 읽음 상태를 관리하는 Repository 훅.
 * 로컬 저장소(IndexedDB 등)를 단일 진실 공급원(SSOT)으로 사용합니다.
 */
export const useChatRepository = (channelId: string | null, userId: string | null) => {
    // 현재 접속 중인 사용자의 클라우드 ID 조회 (없을 경우 'default' 폴백)
    const cloudId = useWebSocketV2Store(s => s.cloudId) ?? 'default';

    // cloudId에 종속된 채팅 및 참여 정보 로컬 스토리지 어댑터 인스턴스 생성 (cloudId 변경 시에만 재생성)
    const chatDB = useMemo(() => (cloudId ? createStorageAdapter<ChatView>('chat', cloudId) : null), [cloudId]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<any>('join', cloudId) : null), [cloudId]);

    // UI에 바인딩될 가공된 메시지 리스트 상태
    const [messages, setMessages] = useState<ClientChatView[]>([]);

    /**
     * 로컬 DB에서 최신 데이터를 읽어와 상태를 갱신하는 함수.
     */
    const refreshFromLocalDB = useCallback(async () => {
        if (!chatDB || !joinDB || !channelId) return;

        // 채팅 내역과 채널 참여 상태를 로컬 DB에서 병렬로 로드
        const [localMsgs, localJoins] = await Promise.all([chatDB.loadAll(), joinDB.loadAll()]);

        // 현재 채널에 해당하는 메시지만 필터링
        const filteredMsgs = localMsgs.filter(msg => msg.channelId === channelId);

        // 현재 채널에 활성 상태(joined: 1 또는 undefined)로 참여 중인 사용자 필터링
        const activeJoins = localJoins.filter(
            j => j.channelId === channelId && (j.joined === 1 || j.joined === undefined)
        );
        const totalActiveMembers = activeJoins.length;

        // 메시지 정렬 및 클라이언트 뷰 객체(ClientChatView)로 변환
        const parsedData = filteredMsgs
            .sort((a, b) => {
                // chatNo(서버 할당 순서)가 없으면 처리 중인 메시지로 간주하고 최댓값 할당
                const noA = a.chatNo ?? Number.MAX_SAFE_INTEGER;
                const noB = b.chatNo ?? Number.MAX_SAFE_INTEGER;

                // chatNo가 동일한 경우(주로 미확정 임시 메시지) 생성 시간 기준으로 정렬
                if (noA === noB && a.createdAt && b.createdAt) {
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                }
                // 기본적으로 chatNo 오름차순 정렬
                return noA - noB;
            })
            .map((msg): ClientChatView => {
                let unreadCount = 0;
                // chatNo가 없으면 서버에서 확정되지 않은 임시 메시지(Pending)로 식별
                const isPending = !msg.chatNo;

                if (msg.chatNo !== undefined) {
                    // 참여자 중 해당 메시지의 chatNo 이상을 읽은 사용자의 수 계산
                    const readCount = activeJoins.filter(join => (join.chatNo || 0) >= msg.chatNo!).length;
                    // 전체 활성 멤버 수에서 읽은 사람 수를 차감하여 unreadCount 산출 (최소 0 보장)
                    unreadCount = Math.max(0, totalActiveMembers - readCount);
                } else {
                    // 임시 메시지의 경우, 발송자 본인을 제외한 전체 인원이 읽지 않은 것으로 계산
                    unreadCount = Math.max(0, totalActiveMembers - 1);
                }

                return {
                    ...msg,
                    unreadCount,
                    isPending,
                };
            });

        setMessages(parsedData);
    }, [chatDB, joinDB, channelId]);

    // 컴포넌트 마운트 시 로컬 DB에서 초기 데이터 로드
    useEffect(() => {
        void refreshFromLocalDB();
    }, [refreshFromLocalDB]);

    // 글로벌 캐시 동기화 이벤트('local-db-updated') 구독
    // 웹소켓 수신 등으로 로컬 DB가 백그라운드에서 변경되었을 때 UI 동기화를 위해 실행
    useEffect(() => {
        if (!channelId || !cloudId) return;
        const handleUpdate = (e: Event) => {
            const { detail } = e as CustomEvent;
            // 이벤트 도메인이 'chat'이고, 현재 cloudId 및 channelId와 일치할 때만 데이터 갱신
            if (detail.domain === 'chat' && detail.cid === cloudId && detail.channelId === channelId) {
                void refreshFromLocalDB();
            }
        };
        window.addEventListener('local-db-updated', handleUpdate);
        return () => window.removeEventListener('local-db-updated', handleUpdate);
    }, [cloudId, channelId, refreshFromLocalDB]);

    /**
     * 채팅 메시지 발송 함수 (Optimistic Pattern)
     */
    const sendMessage = useCallback(
        async (content: string, tempId: string = Date.now().toString()) => {
            if (!chatDB || !channelId || !userId) return;

            // 서버 발송 전 로컬에 먼저 저장할 임시 메시지 객체 생성
            const tempMessage: ChatView = {
                id: tempId,
                channelId,
                content,
                ownerId: userId,
            } as ChatView;

            // 1. 임시 메시지를 로컬 DB에 우선 저장 후 UI 즉시 갱신
            await chatDB.save(tempId, tempMessage);
            void refreshFromLocalDB();

            // 2. 웹소켓을 통해 실제 서버로 메시지 발송
            const sendFn = getSocketSend();
            if (sendFn) {
                sendFn({
                    type: 'chat',
                    action: 'send',
                    payload: { channelId, content },
                    // 서버 응답 시 동기화 스토어가 로컬의 임시 메시지를 찾아 식별/삭제할 수 있도록 참조(ref) ID 전달
                    meta: { ref: tempId },
                });
            }
        },
        [chatDB, channelId, userId, refreshFromLocalDB]
    );

    /**
     * 특정 메시지를 읽음 처리하는 함수
     */
    const readMessage = useCallback(
        async (chatNo: number) => {
            if (!channelId) return;
            const sendFn = getSocketSend();
            if (sendFn) {
                // 서버에 해당 채널의 특정 chatNo까지 읽었음을 전달
                sendFn({ type: 'chat', action: 'read', payload: { channelId, chatNo } });
            }
        },
        [channelId]
    );

    return { messages, sendMessage, readMessage, refresh: refreshFromLocalDB };
};
