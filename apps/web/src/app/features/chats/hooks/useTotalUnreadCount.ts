import { useEffect, useState } from 'react';

import { useDynamicProfile } from '@chatic/web-core';

import { useMyChannels } from '../../home/hooks/useMyChannels';
import { BROADCAST_CHANNEL_NAME } from '../storages/IndexedDBStorageAdapter';
import { useDynamicStorage } from './_deprecated/useDynamicStorage';

/**
 * TODO: will be migrate by Raine
 */
export const useTotalUnreadCount = () => {
    const [totalCount, setTotalCount] = useState(0);
    const storage = useDynamicStorage();
    const profile = useDynamicProfile();
    const { channels } = useMyChannels();

    const userId = profile?.uid ?? null;

    useEffect(() => {
        if (!userId || channels.length === 0) return;

        const refresh = () => {
            Promise.all(channels.map(c => storage.countUnread(userId, c.id ?? '')))
                .then(counts => setTotalCount(counts.reduce((sum, n) => sum + n, 0)))
                .catch(console.error);
        };

        refresh();

        const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = () => refresh();

        const handleUnreadRefreshed = () => refresh();
        window.addEventListener('unread-refreshed', handleUnreadRefreshed);

        return () => {
            bc.close();
            window.removeEventListener('unread-refreshed', handleUnreadRefreshed);
        };
    }, [userId, channels, storage]);

    return totalCount;
};
