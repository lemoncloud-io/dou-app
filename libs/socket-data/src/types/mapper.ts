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
     * @param myUserId 현재 로그인한 유저 ID (isMe 등 UI 편의 상태를 만들 때 유용함)
     */
    toClient(cache: CacheChatView, unreadCount = 0, myUserId?: string): ClientChatView {
        const timestamp = cache?.createdAt ? new Date(cache.createdAt) : new Date();
        const isSystem = cache.stereo === 'system';
        const ownerName = cache.owner$?.name || '...';

        return {
            ...cache,
            unreadCount,
            timestamp,
            isSystem,
            ownerName,
            isOwner: cache.ownerId === myUserId,
            isPending: cache.isPending ?? false,
            isFailed: cache.isFailed ?? false,
        };
    },
};
