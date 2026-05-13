import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DomainChat } from '@chatic/data';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';
import { useRepositories } from '../data';
import type { ClientChatView } from '../types';

// 기본 채팅 메시지 로드 제한 수
const DEFAULT_CHAT_LIMIT = 50;

/**
 * DomainChat 객체를 클라이언트 UI에서 사용하기 위한 ClientChatView 형식으로 변환합니다.
 * 이 과정에서 UI 표시에 필요한 추가 필드를 계산하거나 변환합니다.
 * @param chat - 변환할 DomainChat 객체
 * @param userId - 현재 로그인한 사용자 ID (메시지 소유자 여부 판단용)
 * @returns ClientChatView 객체
 */
const toClientChat = (chat: DomainChat, userId?: string): ClientChatView => {
    // createdAt이 없을 경우 현재 시간을 사용 (방어적 코딩)
    const createdAt = chat.createdAt ?? Date.now();
    const timestamp = new Date(createdAt);
    // chat.id가 없으면 channelId와 chatNo를 조합하여 고유 ID 생성
    // chatNo도 없을 경우 id는 undefined가 될 수 있음
    const id = chat.id ?? (chat.chatNo !== undefined ? `${chat.channelId}:${chat.chatNo}` : undefined);

    return {
        ...chat,
        id,
        readCount: chat.readCount,
        // unreadCount는 현재 DomainChat에서 직접 제공되지 않으므로 undefined로 설정됩니다.
        // 만약 DomainChat에 unreadCount 정보가 있다면 해당 필드를 사용하도록 수정할 수 있습니다.
        unreadCount: undefined,
        // timestamp가 유효하지 않은 Date 객체일 경우 현재 시간을 사용 (방어적 코딩)
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
        // stereo 필드를 통해 시스템 메시지 여부 판단
        isSystem: chat.stereo === 'system',
        // 소유자 이름이 없을 경우 'Unknown User'로 표시하여 UI에서 명확하게 처리할 수 있도록 합니다.
        // '...'는 모호할 수 있으므로 더 명확한 문자열을 사용합니다.
        ownerName: chat.owner$?.name ?? 'Unknown User',
        // 현재 사용자가 메시지 소유자인지 판단. 메시지가 전송 중(pending)일 경우에도 소유자로 간주합니다.
        isOwner: (chat.isPending ?? false) || (chat.isFailed ?? false) || chat.ownerId === userId,
        // 메시지 전송 중 상태 (기본값 false)
        isPending: chat.isPending ?? false,
        isFailed: chat.isFailed ?? false,
    };
};

const sortMessages = (messages: ClientChatView[]) =>
    [...messages].sort((a, b) => {
        // chatNo가 모두 존재하고 다를 경우 chatNo 기준으로 정렬 (우선 순위 높음)
        // chatNo는 메시지의 고유한 순서를 나타내는 경우가 많으므로 이를 우선합니다.
        if (a.chatNo !== undefined && b.chatNo !== undefined && a.chatNo !== b.chatNo) {
            return a.chatNo - b.chatNo;
        }
        // chatNo가 없거나 같을 경우 timestamp 기준으로 정렬
        return a.timestamp.getTime() - b.timestamp.getTime();
    });

export const useChats = (initialParams: ChatFeedPayload) => {
    const { chat: chatRepository } = useRepositories();
    const profile = useDynamicProfile();
    const userId = profile?.uid;
    const targetChannelId = initialParams.channelId;
    const pageSize = initialParams.limit ?? DEFAULT_CHAT_LIMIT;

    // 캐시 전체를 ref에 저장 (state가 아니므로 re-render 유발 안 함)
    const allCachedRef = useRef<DomainChat[]>([]);
    // 화면에 표시할 메시지 (최신 displayLimit개)
    const [domainMessages, setDomainMessages] = useState<DomainChat[] | null>(null);
    // 표시할 메시지 수 (loadMore로 증가)
    const [displayLimit, setDisplayLimit] = useState(pageSize);

    // ref에서 최신 displayLimit개를 잘라서 state에 반영
    const applyDisplayWindow = useCallback((allMessages: DomainChat[], limit: number) => {
        const sliced = allMessages.length > limit ? allMessages.slice(-limit) : allMessages;
        setDomainMessages(sliced);
    }, []);

    /**
     * 실시간 채팅 업데이트를 구독 (캐시 전체를 받되, displayLimit만큼만 state에 반영)
     * 서버 요청 없음 — subscribeList는 로컬 캐시만 관찰
     */
    useEffect(() => {
        if (!targetChannelId) {
            allCachedRef.current = [];
            setDomainMessages([]);
            return;
        }

        const unsubscribe = chatRepository.subscribeList(targetChannelId, result => {
            if (result === null) return;
            allCachedRef.current = result.list;
            applyDisplayWindow(result.list, displayLimit);
        });

        return () => unsubscribe();
    }, [targetChannelId, chatRepository, displayLimit, applyDisplayWindow]);

    const isLoading = domainMessages === null;
    const isEmpty = domainMessages !== null && domainMessages.length === 0;

    const messages = useMemo(() => {
        if (!domainMessages) return [];
        const clientMessages = domainMessages.map(chat => toClientChat(chat, userId));
        return sortMessages(clientMessages);
    }, [domainMessages, userId]);

    /**
     * loadMore: displayLimit을 pageSize만큼 늘려서 캐시에서 더 많은 과거 메시지 표시
     */
    const loadMore = useCallback(() => {
        if (!targetChannelId) return;
        setDisplayLimit(prev => {
            const next = prev + pageSize;
            applyDisplayWindow(allCachedRef.current, next);
            return next;
        });
    }, [targetChannelId, pageSize, applyDisplayWindow]);

    const hasMore = allCachedRef.current.length > displayLimit;

    /**
     * refresh: displayLimit 리셋 후 캐시에서 다시 표시
     */
    const refresh = useCallback(() => {
        if (!targetChannelId) return;
        setDisplayLimit(pageSize);
        applyDisplayWindow(allCachedRef.current, pageSize);
    }, [targetChannelId, pageSize, applyDisplayWindow]);

    return {
        messages,
        isLoading,
        isEmpty,
        isLoadingMore: false,
        isError: false,
        hasMore,
        loadMore,
        refresh,
        sync: refresh,
    };
};
