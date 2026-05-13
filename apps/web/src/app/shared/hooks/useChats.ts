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

    const [domainMessages, setDomainMessages] = useState<DomainChat[] | null>(null);
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);
    const [status, setStatus] = useState({
        isLoadingMore: false,
        isError: false,
    });

    /**
     * 실시간 캐시 변경을 감지하고 UI 상태를 업데이트합니다.
     */
    useEffect(() => {
        if (!targetChannelId) {
            setDomainMessages([]);
            return;
        }

        const unsubscribe = chatRepository.subscribeList(targetChannelId, result => {
            if (result === null) return;
            // [FIXED] 덮어쓰는 대신, 기존 상태와 안전하게 병합합니다.
            // 이렇게 하면 loadMore로 불러온 데이터가 유지되면서 실시간 업데이트도 반영됩니다.
            setDomainMessages(prev => mergeAndSortMessages(prev || [], result.list));
        });

        return () => unsubscribe();
    }, [targetChannelId, chatRepository]);

    /**
     * 초기 메시지를 로드합니다.
     */
    useEffect(() => {
        if (!targetChannelId) return;

        setStatus(prev => ({ ...prev, isError: false }));
        setDomainMessages(null); // 로딩 상태 시작

        chatRepository
            .fetchChat(
                { channelId: targetChannelId, limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT },
                { cachePolicy: 'cache-first' }
            )
            .then(result => {
                // fetch 결과를 즉시 UI 상태에 반영
                setDomainMessages(result.list);
                setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(error => {
                setStatus(prev => ({ ...prev, isError: true }));
                logger.error('CHAT', 'Failed to fetch initial chats', { error });
            });
    }, [targetChannelId, initialParams.limit, chatRepository]);

    const isLoading = domainMessages === null;
    const isEmpty = domainMessages !== null && domainMessages.length === 0;

    const messages = useMemo(() => {
        if (!domainMessages) return [];
        const clientMessages = domainMessages.map(chat => toClientChat(chat, userId));
        return sortMessages(clientMessages);
    }, [domainMessages, userId]);

    const loadMore = useCallback(() => {
        if (!targetChannelId || feedCursorNo === undefined || feedCursorNo === 0 || status.isLoadingMore) return;

        setStatus(prev => ({ ...prev, isLoadingMore: true, isError: false }));

        chatRepository
            .fetchChat(
                {
                    channelId: targetChannelId,
                    cursorNo: feedCursorNo,
                    limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT,
                },
                { cachePolicy: 'cache-first' }
            )
            .then((result: DomainListResult<DomainChat>) => {
                // 가져온 데이터를 기존 메시지 목록과 병합하여 상태 업데이트
                setDomainMessages(prev => mergeAndSortMessages(prev || [], result.list));
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
    }, [targetChannelId, feedCursorNo, initialParams.limit, status.isLoadingMore, chatRepository]);

    const refresh = useCallback(() => {
        if (!targetChannelId) return;

        setDomainMessages(null); // 로딩 상태 시작
        setStatus(prev => ({ ...prev, isError: false }));

        chatRepository
            .fetchChat(
                { channelId: targetChannelId, limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT },
                { cachePolicy: 'network-only' }
            )
            .then(result => {
                setDomainMessages(result.list);
                setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(error => {
                setStatus(prev => ({ ...prev, isError: true }));
                logger.error('CHAT', 'Failed to refresh chats', { error });
            });
    }, [targetChannelId, initialParams.limit, chatRepository]);

    return {
        messages,
        isLoading,
        isEmpty,
        isLoadingMore: status.isLoadingMore,
        isError: status.isError,
        hasMore: feedCursorNo !== undefined && feedCursorNo !== 0,
        loadMore,
        refresh,
        sync: refresh,
    };
};
