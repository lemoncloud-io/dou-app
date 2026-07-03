import type { ChatSubType, DomainChat } from '@chatic/data';

// System messages (channel join/leave) are modeled with `stereo === 'system'`. The server stores
// no natural-language content for them — only the `subType` code — so the client decides how to
// render and whether they affect counts.
export const isSystemChat = (chat: Pick<DomainChat, 'stereo'>): boolean => chat.stereo === 'system';

// Per-requirement: unread counts only user messages. System events (join/leave) carry no unread
// weight, so they short-circuit to 0 regardless of member cursors. For user messages, count the
// members whose read cursor is still below this chat (excluding the sender, who has read it).
export const countUnreadMembers = (
    chat: Pick<DomainChat, 'stereo' | 'ownerId' | 'chatNo'>,
    memberIds: string[],
    cursorByUser: Map<string, number>
): number => {
    if (isSystemChat(chat)) return 0;
    return memberIds.filter(uid => uid !== chat.ownerId && (cursorByUser.get(uid) ?? 0) < chat.chatNo).length;
};

// Debug-oriented label for the testbed system bubble. Unlike the web app (which localizes via
// i18n), the testbed surfaces the raw subType code alongside a readable sentence to aid testing.
export const formatSystemChatLabel = (subType: ChatSubType | undefined, name: string): string => {
    const who = name || '알 수 없음';
    switch (subType) {
        case 'join':
            return `${who}님이 입장했습니다`;
        case 'leave':
            return `${who}님이 퇴장했습니다`;
        default:
            return `${who} 시스템 메시지`;
    }
};
