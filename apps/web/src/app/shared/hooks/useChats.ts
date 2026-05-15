import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@chatic/app-messages';
import type { DomainChat, DomainListResult } from '@chatic/data';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';
import { useRepositories } from '../data';
import type { ClientChatView } from '../types';

const DEFAULT_CHAT_LIMIT = 50;

const toClientChat = (chat: DomainChat, userId?: string): ClientChatView => {
    const createdAt = chat.createdAt ?? Date.now();
    const timestamp = new Date(createdAt);
    const id = chat.id ?? (chat.chatNo !== undefined ? `${chat.channelId}:${chat.chatNo}` : undefined);

    return {
        ...chat,
        id,
        readCount: chat.readCount,
        unreadCount: undefined,
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
        isSystem: chat.stereo === 'system',
        ownerName: chat.owner$?.name ?? 'Unknown User',
        isOwner: (chat.isPending ?? false) || (chat.isFailed ?? false) || chat.ownerId === userId,
        isPending: chat.isPending ?? false,
        isFailed: chat.isFailed ?? false,
    };
};

const sortMessages = (messages: ClientChatView[]) =>
    [...messages].sort((a, b) => {
        if (a.chatNo !== undefined && b.chatNo !== undefined && a.chatNo !== b.chatNo) {
            return a.chatNo - b.chatNo;
        }
        return a.timestamp.getTime() - b.timestamp.getTime();
    });

// 중복 메시지를 제거하고, chatNo 또는 timestamp 기준으로 정렬된 새 배열을 반환합니다.
const mergeAndSortMessages = (existing: DomainChat[], incoming: DomainChat[]): DomainChat[] => {
    // 기존 데이터를 기반으로 Map 초기화
    const messageMap = new Map<string, DomainChat>();

    // 안전한 ID 추출 헬퍼 함수
    const getMessageId = (msg: DomainChat) =>
        msg.id || (msg.chatNo !== undefined ? `${msg.channelId}:${msg.chatNo}` : undefined);

    for (const msg of existing) {
        const key = getMessageId(msg) || msg.tempId;
        if (key) messageMap.set(key, msg);
    }

    // 새로운(incoming) 데이터를 병합하면서, tempId가 있다면 기존 임시 메시지 교체
    for (const msg of incoming) {
        const key = getMessageId(msg);

        // incoming 메시지에 tempId가 명시되어 있다면, 기존에 존재하던 해당 tempId의 임시 메시지를 삭제
        if (msg.tempId && messageMap.has(msg.tempId)) {
            messageMap.delete(msg.tempId);
        }

        // 새 메시지를 Map에 추가 (같은 key가 있다면 덮어씀)
        if (key) {
            messageMap.set(key, msg);
        } else if (msg.tempId) {
            // key가 없고 tempId만 있는 낙관적 메시지인 경우
            messageMap.set(msg.tempId, msg);
        }
    }

    // 정리된 메시지 목록을 정렬하여 반환
    return Array.from(messageMap.values()).sort((a, b) => {
        // 낙관적 메시지(chatNo가 매우 큰 값) 처리 포함
        const aChatNo = a.chatNo ?? Number.MAX_SAFE_INTEGER;
        const bChatNo = b.chatNo ?? Number.MAX_SAFE_INTEGER;

        if (aChatNo !== bChatNo) {
            // 정상 메시지들 또는 낙관적 메시지와의 비교
            return aChatNo - bChatNo;
        }

        // chatNo가 같거나 둘 다 없는 경우 timestamp(createdAt)로 비교
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
};

export const useChats = (initialParams: ChatFeedPayload) => {
    const { chat: chatRepository } = useRepositories();
    const profile = useDynamicProfile();
    const userId = profile?.uid;
    const targetChannelId = initialParams.channelId;
    const pageSize = initialParams.limit ?? DEFAULT_CHAT_LIMIT;

    const [domainMessages, setDomainMessages] = useState<DomainChat[] | null>(null);
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);
    const [status, setStatus] = useState({
        isLoadingMore: false,
        isError: false,
    });

    /**
     * 로컬 캐시 구독 — chat:feed 를 직접 호출하지 않고,
     * GlobalChatSync가 background sync를 담당합니다.
     * 로컬 캐시 변경 시 자동으로 UI가 갱신됩니다.
     */
    useEffect(() => {
        if (!targetChannelId) {
            setDomainMessages([]);
            return;
        }

        setDomainMessages(null); // 로딩 상태 시작

        const unsubscribe = chatRepository.subscribeList(targetChannelId, result => {
            if (result === null || result.list.length === 0) {
                // 캐시 비어있음 — GlobalChatSync가 채울 때까지 빈 상태 표시
                setDomainMessages(prev => prev ?? []);
                return;
            }
            setDomainMessages(prev => mergeAndSortMessages(prev || [], result.list));
        });

        return () => unsubscribe();
    }, [targetChannelId, chatRepository]);

    // feedCursorNo: 현재 로드된 메시지의 최소 chatNo에서 파생
    // loadMore 서버 응답 시 서버 cursor로 갱신됨
    useEffect(() => {
        if (feedCursorNo !== undefined) return; // loadMore에서 이미 설정됨
        if (!domainMessages || domainMessages.length === 0) return;

        const chatNos = domainMessages
            .map(m => m.chatNo)
            .filter((n): n is number => n !== undefined && n > 0 && n !== Number.MAX_SAFE_INTEGER);
        if (chatNos.length > 0) {
            setFeedCursorNo(Math.min(...chatNos));
        }
    }, [domainMessages, feedCursorNo]);

    // channelId가 변경되면 cursor 초기화
    useEffect(() => {
        setFeedCursorNo(undefined);
    }, [targetChannelId]);

    const isLoading = domainMessages === null;
    const isEmpty = domainMessages !== null && domainMessages.length === 0;

    const messages = useMemo(() => {
        if (!domainMessages) return [];
        const clientMessages = domainMessages.map(chat => toClientChat(chat, userId));
        return sortMessages(clientMessages);
    }, [domainMessages, userId]);

    const loadMore = useCallback(() => {
        if (!targetChannelId || feedCursorNo === undefined || feedCursorNo <= 1 || status.isLoadingMore) return;

        setStatus(prev => ({ ...prev, isLoadingMore: true, isError: false }));

        chatRepository
            .fetchChat(
                {
                    channelId: targetChannelId,
                    cursorNo: feedCursorNo,
                    limit: pageSize,
                },
                { cachePolicy: 'network-only' }
            )
            .then((result: DomainListResult<DomainChat>) => {
                setDomainMessages(prev => mergeAndSortMessages(prev || [], result.list));
                // 서버 cursor로 갱신 — 0이면 더 이상 older 메시지 없음
                setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to load more chats', {
                    error,
                    data: { channelId: targetChannelId, cursorNo: feedCursorNo },
                });
                setStatus(prev => ({ ...prev, isError: true }));
            })
            .finally(() => {
                setStatus(prev => ({ ...prev, isLoadingMore: false }));
            });
    }, [targetChannelId, feedCursorNo, pageSize, status.isLoadingMore, chatRepository]);

    const hasMore = feedCursorNo !== undefined && feedCursorNo > 1;

    const refresh = useCallback(() => {
        if (!targetChannelId) return;

        setDomainMessages(null);
        setFeedCursorNo(undefined);
        setStatus(prev => ({ ...prev, isError: false }));

        chatRepository
            .fetchChat({ channelId: targetChannelId, limit: pageSize }, { cachePolicy: 'network-only' })
            .then(result => {
                setDomainMessages(result.list);
                setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(error => {
                setStatus(prev => ({ ...prev, isError: true }));
                logger.error('CHAT', 'Failed to refresh chats', { error });
            });
    }, [targetChannelId, pageSize, chatRepository]);

    return {
        messages,
        isLoading,
        isEmpty,
        isLoadingMore: status.isLoadingMore,
        isError: status.isError,
        hasMore,
        loadMore,
        refresh,
        sync: refresh,
    };
};
