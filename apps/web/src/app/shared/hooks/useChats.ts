import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/app-messages';
import type { ClientChatView } from '@chatic/data';
import type { ChatView } from '@lemoncloud/chatic-socials-api';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';

import { useRepositories } from '../data';

const APP_SYNC_EVENT_NAME = 'app-sync-updated';
const DEFAULT_CHAT_LIMIT = 100;

interface LegacyAppSyncDetail<T = unknown> {
    domain?: string;
    action?: string;
    targetId?: string;
    targetSubId?: string;
    payload?: T;
    ref?: string;
}

type LocalChatView = ChatView & {
    isPending?: boolean;
    isFailed?: boolean;
};

const getCreatedAtTime = (chat: Pick<ChatView, 'createdAt'>) => {
    const time = new Date(chat.createdAt ?? 0).getTime();
    return Number.isNaN(time) ? 0 : time;
};

const getChatKey = (chat: ChatView) =>
    chat.id ?? `${chat.channelId ?? 'channel'}:${chat.chatNo ?? getCreatedAtTime(chat)}`;

const toClientChat = (chat: LocalChatView, userId?: string): ClientChatView => {
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
        ownerName: chat.owner$?.name || '...',
        isOwner: chat.ownerId === userId,
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

const mergeMessages = (messages: ClientChatView[], nextMessages: ClientChatView[], replaceRef?: string) => {
    const byKey = new Map<string, ClientChatView>();

    for (const message of messages) {
        if (replaceRef && message.id === replaceRef) continue;
        byKey.set(getChatKey(message), message);
    }

    for (const message of nextMessages) {
        byKey.set(getChatKey(message), message);
    }

    return sortMessages([...byKey.values()]);
};

export const useChats = (initialParams: ChatFeedPayload) => {
    const { chat: chatRepository } = useRepositories();
    const profile = useDynamicProfile();
    const userId = profile?.uid;
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const targetChannelId = initialParams.channelId;
    const requestSeqRef = useRef(0);
    const currentParamsRef = useRef(initialParams);

    const [messages, setMessages] = useState<ClientChatView[]>([]);
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);
    const [status, setStatus] = useState({
        isLoading: true,
        isSyncing: false,
        isLoadingMore: false,
        isError: false,
    });

    const fetchMessages = useCallback(
        async (params?: Partial<ChatFeedPayload>, mode: 'replace' | 'append' = 'replace') => {
            const nextParams = { ...currentParamsRef.current, ...params };
            currentParamsRef.current = nextParams;

            if (!nextParams.channelId) {
                setMessages([]);
                setFeedCursorNo(undefined);
                setStatus({ isLoading: false, isSyncing: false, isLoadingMore: false, isError: false });
                return;
            }

            const requestSeq = requestSeqRef.current + 1;
            requestSeqRef.current = requestSeq;

            setStatus(prev => ({
                ...prev,
                isLoading: mode === 'replace',
                isSyncing: mode === 'replace',
                isLoadingMore: mode === 'append',
                isError: false,
            }));

            try {
                const result = await chatRepository.fetchChat({
                    channelId: nextParams.channelId,
                    cursorNo: nextParams.cursorNo,
                    limit: nextParams.limit ?? DEFAULT_CHAT_LIMIT,
                });

                if (requestSeqRef.current !== requestSeq) return;

                const nextMessages = sortMessages(
                    (result.list ?? []).map((chat: ChatView) => toClientChat(chat, userIdRef.current))
                );

                setMessages(prev => (mode === 'append' ? mergeMessages(prev, nextMessages) : nextMessages));
                setFeedCursorNo(result.cursorNo);
                setStatus({ isLoading: false, isSyncing: false, isLoadingMore: false, isError: false });
            } catch (error) {
                if (requestSeqRef.current !== requestSeq) return;

                logger.error('CHAT', 'Failed to fetch chats from repository', {
                    error,
                    data: { channelId: nextParams.channelId, cursorNo: nextParams.cursorNo },
                });
                setStatus(prev => ({
                    ...prev,
                    isLoading: false,
                    isSyncing: false,
                    isLoadingMore: false,
                    isError: true,
                }));
            }
        },
        [chatRepository]
    );

    useEffect(() => {
        currentParamsRef.current = initialParams;
        setMessages([]);
        setFeedCursorNo(undefined);
        void fetchMessages({ channelId: targetChannelId, limit: initialParams.limit }, 'replace');
    }, [fetchMessages, targetChannelId, initialParams.limit]);

    useEffect(() => {
        return chatRepository.onChatCreated((chat: ChatView) => {
            if (chat.channelId !== targetChannelId) return;
            const nextMessage = toClientChat(chat, userIdRef.current);
            setMessages(prev => mergeMessages(prev, [nextMessage]));
        });
    }, [chatRepository, targetChannelId]);

    useEffect(() => {
        const handleLegacySync = (event: Event) => {
            const { detail } = event as CustomEvent<LegacyAppSyncDetail<LocalChatView>>;
            if (detail.domain !== 'chat' || detail.targetId !== targetChannelId) return;

            // send, delete 액션만 처리 (optimistic update 용도)
            // feed 등 다른 액션은 구 핸들러가 전체 응답 객체를 payload로 전달하므로 무시
            if (detail.action !== 'send' && detail.action !== 'delete') return;

            if (detail.action === 'delete') {
                const deleteKey = detail.targetSubId ?? detail.payload?.id;
                if (deleteKey) {
                    setMessages(prev => prev.filter(message => message.id !== deleteKey));
                }
                return;
            }

            if (!detail.payload) return;
            const nextMessage = toClientChat(detail.payload, userIdRef.current);
            setMessages(prev => mergeMessages(prev, [nextMessage], detail.ref));
        };

        window.addEventListener(APP_SYNC_EVENT_NAME, handleLegacySync);
        return () => window.removeEventListener(APP_SYNC_EVENT_NAME, handleLegacySync);
    }, [targetChannelId]);

    const loadMore = useCallback(() => {
        if (feedCursorNo === undefined || feedCursorNo === 0 || status.isLoadingMore) return;
        void fetchMessages(
            { channelId: targetChannelId, cursorNo: feedCursorNo, limit: initialParams.limit },
            'append'
        );
    }, [feedCursorNo, fetchMessages, initialParams.limit, status.isLoadingMore, targetChannelId]);

    return {
        messages,
        ...status,
        hasMore: feedCursorNo !== undefined && feedCursorNo !== 0,
        loadMore,
        refresh: () => {
            setMessages([]);
            setFeedCursorNo(undefined);
            void fetchMessages({ channelId: targetChannelId, limit: initialParams.limit }, 'replace');
        },
        sync: () => fetchMessages({ channelId: targetChannelId, limit: initialParams.limit }, 'replace'),
    };
};
