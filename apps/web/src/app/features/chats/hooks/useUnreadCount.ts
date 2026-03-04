import { useEffect, useState } from 'react';

import { countUnreadMessages } from './useChatMessages';

const BROADCAST_CHANNEL_NAME = 'chat-messages-update';

export const useUnreadCount = (userId: string | null, channelId: string) => {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!userId) return;

        const refresh = () => {
            countUnreadMessages(userId, channelId).then(setUnreadCount).catch(console.error);
        };

        refresh();

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = event => {
            const { userId: msgUserId, channelId: msgChannelId } = event.data;
            if (msgUserId === userId && msgChannelId === channelId) {
                refresh();
            }
        };

        return () => bc.close();
    }, [userId, channelId]);

    return unreadCount;
};
