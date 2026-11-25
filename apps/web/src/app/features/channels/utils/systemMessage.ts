import type { ChatSubType } from '@chatic/runtime-react';

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
