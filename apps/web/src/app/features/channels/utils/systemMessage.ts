import type { ChatSubType } from '@chatic/data';

// Maps a system message subType to its i18n key for the trailing clause. The owner name is rendered
// separately (bold, as a prefix), so the localized string is only the suffix — e.g. "님이 들어왔습니다"
// (ko) or " joined the channel" (en). Returns null for unknown/empty subTypes so the caller can fall
// back to the legacy natural-language `content` that older system rows may carry.
export const systemMessageSuffixKey = (subType: ChatSubType | undefined): string | null => {
    switch (subType) {
        case 'join':
            return 'chat.room.system.join';
        case 'leave':
            return 'chat.room.system.leave';
        default:
            return null;
    }
};
