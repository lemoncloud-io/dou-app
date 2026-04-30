import type { ClientChatView } from '../types';
import type { CacheChatView } from '@chatic/app-messages';

/**
 * Chat 도메인의 데이터 변환을 담당하는 Mapper 모듈
 */
export const ChatMapper = {
    /**
     * DB 모델(CacheChatView)을 UI 모델(ClientChatView)로 변환합니다.
     * @param cache 로컬 DB에서 조회한 원본 데이터
     * @param unreadCount 외부에서 계산된 안읽음 수 (기본값 0)
     * @param readCount 외부에서 계산된 읽음 수 (기본값 0)
     * @param myUserId 현재 로그인한 유저 ID (isMe 등 UI 편의 상태를 만들 때 유용함)
     */
    toClient(cache: CacheChatView, unreadCount = 0, readCount = 0, myUserId?: string): ClientChatView {
        const now = Date.now();
        const createdAt = cache?.createdAt ?? now;
        const timestamp = new Date(createdAt);

        // pending 상태인데 생성된 지 1분(60,000ms)이 지났다면 실패로 간주
        const isStalePending = cache.isPending && now - createdAt > 60000;

        const isPending = cache.isPending && !isStalePending;
        const isFailed = cache.isFailed || isStalePending;

        return {
            ...cache,
            readCount,
            unreadCount,
            timestamp,
            isSystem: cache.stereo === 'system',
            ownerName: cache.owner$?.name || '...',
            isOwner: cache.ownerId === myUserId,
            isPending: isPending ?? false,
            isFailed: isFailed ?? false,
        };
    },
};
