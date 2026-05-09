import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@chatic/app-messages';
import type { ClientChatView, DomainChat } from '@chatic/data';
import type { ChatFeedPayload } from '@lemoncloud/chatic-sockets-api';
import { useDynamicProfile } from '@chatic/web-core';
import { useRepositories } from '../data';

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
        // 현재 사용자가 메시지 소유자인지 판단
        isOwner: chat.ownerId === userId,
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
    // 현재 로그인한 사용자의 ID
    const userId = profile?.uid;
    // 초기 파라미터에서 대상 채널 ID 추출
    const targetChannelId = initialParams.channelId;

    // 서버에서 받아온 원본 DomainChat 메시지 목록 상태 (초기에는 null로 로딩 중을 나타냄)
    const [domainMessages, setDomainMessages] = useState<DomainChat[] | null>(null);
    // 무한 스크롤을 위한 다음 메시지 커서 번호 (undefined는 더 이상 불러올 메시지가 없음을 의미)
    const [feedCursorNo, setFeedCursorNo] = useState<number | undefined>(undefined);

    // 로딩 및 에러 상태 관리
    const [status, setStatus] = useState({
        isLoadingMore: false, // 추가 메시지 로딩 중 여부
        isError: false, // 에러 발생 여부
    });

    /**
     * 실시간 채팅 업데이트를 구독하는 useEffect.
     * targetChannelId가 변경될 때마다 구독을 설정하고 해제합니다.
     */
    useEffect(() => {
        // 채널 ID가 없으면 메시지 목록을 비우고 구독하지 않음
        if (!targetChannelId) {
            setDomainMessages([]);
            return;
        }

        // chatRepository를 통해 실시간 메시지 목록 구독
        const unsubscribe = chatRepository.subscribeList(targetChannelId, result => {
            if (result === null) return;
            // DomainListResult 객체에서 list만 꺼내어 저장
            // NOTE: 현재는 구독된 최신 전체 목록으로 메시지 상태를 완전히 대체하는 방식입니다.
            // 만약 subscribeList가 증분 업데이트(새로운 메시지만 전달)를 제공한다면,
            // 기존 메시지 목록에 새 메시지를 병합하는 로직이 필요할 수 있습니다.
            setDomainMessages(result.list);
        });

        // 컴포넌트 언마운트 시 구독 해제
        return () => unsubscribe();
    }, [targetChannelId, chatRepository]);

    /**
     * 초기 채팅 메시지를 로드하거나 새로고침할 때 사용되는 useEffect.
     * targetChannelId 또는 initialParams.limit이 변경될 때 실행됩니다.
     */
    useEffect(() => {
        // 채널 ID가 없으면 로드하지 않음
        if (!targetChannelId) return;

        // 새로운 로드 시작 시 에러 상태를 초기화합니다.
        setStatus(prev => ({ ...prev, isError: false }));

        // chatRepository를 통해 초기 채팅 메시지 목록을 불러옵니다.
        // cachePolicy: 'network-only'를 사용하여 항상 최신 데이터를 가져옵니다.
        chatRepository
            .fetchChat(
                { channelId: targetChannelId, limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT },
                { cachePolicy: 'network-only' }
            )
            .then(result => {
                // 초기 로드 성공 시, 다음 메시지를 불러올 커서 번호를 meta 객체에서 참조하여 저장합니다.
                setFeedCursorNo(result.meta?.cursorNo);
            })
            .catch(error => {
                // 초기 로드 실패 시 에러 상태를 true로 설정합니다.
                setStatus(prev => ({ ...prev, isError: true }));
                logger.error('CHAT', 'Failed to sync chats', { error });
            });
    }, [targetChannelId, initialParams.limit, chatRepository]);

    // 초기 메시지 로딩 중 여부 (domainMessages가 아직 null일 때)
    const isLoading = domainMessages === null;
    // 메시지 목록이 비어있는지 여부
    const isEmpty = domainMessages !== null && domainMessages.length === 0;

    /**
     * 클라이언트 UI에 표시될 메시지 목록을 생성합니다.
     * domainMessages가 변경되거나 userId가 변경될 때마다 ClientChatView로 변환하고 정렬합니다.
     * useMemo를 사용하여 불필요한 재계산을 방지합니다.
     */
    const messages = useMemo(() => {
        // domainMessages가 아직 로딩 중이면 빈 배열 반환
        if (!domainMessages) return [];
        // DomainChat 객체를 ClientChatView 형식으로 변환
        const clientMessages = domainMessages.map(chat => toClientChat(chat, userId));
        // 변환된 메시지들을 정렬
        return sortMessages(clientMessages);
    }, [domainMessages, userId]);

    /**
     * 추가 메시지를 로드하는 함수 (무한 스크롤).
     * useCallback을 사용하여 불필요한 재렌더링을 방지합니다.
     */
    const loadMore = useCallback(() => {
        // 유효하지 않은 채널 ID, 커서 번호가 없거나 0이거나, 이미 로딩 중이면 함수 실행을 중단합니다.
        if (!targetChannelId || feedCursorNo === undefined || feedCursorNo === 0 || status.isLoadingMore) return;

        // 추가 로딩 시작 상태 설정 및 에러 상태 초기화
        setStatus(prev => ({ ...prev, isLoadingMore: true, isError: false }));

        // chatRepository를 통해 이전 채팅 메시지를 불러옵니다.
        // 현재 feedCursorNo를 사용하여 이전 메시지를 요청합니다.
        chatRepository
            .fetchChat(
                {
                    channelId: targetChannelId,
                    cursorNo: feedCursorNo,
                    limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT,
                },
                { cachePolicy: 'network-only' }
            )
            .then(result => {
                // 성공 시, 다음 추가 로드를 위한 커서 번호를 업데이트합니다.
                setFeedCursorNo(result.meta?.cursorNo);
                // 기존 메시지 목록에 새로 불러온 메시지를 병합하고 정렬합니다.
                // prev는 이전 domainMessages 상태를 참조합니다.
                setDomainMessages(prev => [...(prev || []), ...result.list]);
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to load more chats', {
                    error,
                    data: { channelId: targetChannelId, cursorNo: feedCursorNo },
                });
                // 실패 시 에러 상태를 true로 설정합니다.
                setStatus(prev => ({ ...prev, isError: true }));
            })
            .finally(() => {
                // 성공/실패와 관계없이 로딩 상태를 해제합니다.
                setStatus(prev => ({ ...prev, isLoadingMore: false }));
            });
    }, [targetChannelId, feedCursorNo, initialParams.limit, status.isLoadingMore, chatRepository]); // domainMessages는 함수형 업데이트를 사용하므로 의존성 배열에서 제거합니다.

    /**
     * 채팅 목록을 새로고침하는 함수.
     * useCallback을 사용하여 불필요한 재렌더링을 방지합니다.
     */
    const refresh = useCallback(() => {
        // 채널 ID가 없으면 실행하지 않음
        if (!targetChannelId) return;
        // domainMessages를 null로 설정하여 isLoading 상태를 true로 만들고,
        // useEffect (초기 로드)가 다시 실행되도록 유도합니다.
        setDomainMessages(null);
        chatRepository
            .fetchChat(
                { channelId: targetChannelId, limit: initialParams.limit ?? DEFAULT_CHAT_LIMIT },
                { cachePolicy: 'network-only' }
            )
            .then(result => {
                // 새로고침 성공 시, 다음 커서 번호를 업데이트합니다.
                setFeedCursorNo(result.meta?.cursorNo);
                // refresh 성공 시, domainMessages를 새로 불러온 목록으로 설정하여 즉시 업데이트합니다.
                setDomainMessages(result.list);
            })
            .catch(() => setStatus(prev => ({ ...prev, isError: true }))); // 실패 시 에러 상태 설정
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
