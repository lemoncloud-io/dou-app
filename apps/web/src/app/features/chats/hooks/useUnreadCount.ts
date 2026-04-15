import { useEffect, useState } from 'react';

import { BROADCAST_CHANNEL_NAME } from '../storages/IndexedDBStorageAdapter';
import { useDynamicStorage } from './_deprecated/useDynamicStorage';

/**
 * TODO: will be migrate by Raine
 */
export const useUnreadCount = (userId: string | null, channelId: string) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const storage = useDynamicStorage();

    useEffect(() => {
        if (!userId) return;

        const refresh = () => {
            storage.countUnread(userId, channelId).then(setUnreadCount).catch(console.error);
        };

        refresh();

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = event => {
            const { userId: msgUserId, channelId: msgChannelId } = event.data;
            if (msgUserId === userId && msgChannelId === channelId) {
                refresh();
            }
        };

        const handleUnreadRefreshed = (e: Event) => {
            const detail = (e as CustomEvent<{ channelId: string }>).detail;
            if (detail.channelId === channelId) {
                refresh();
            }
        };
        window.addEventListener('unread-refreshed', handleUnreadRefreshed);

        return () => {
            bc.close();
            window.removeEventListener('unread-refreshed', handleUnreadRefreshed);
        };
    }, [userId, channelId, storage]);

    return unreadCount;
};
