import { useMemo } from 'react';

import { useChannels } from '@chatic/socket-data';
import { cloudCore } from '@chatic/web-core';

export const useTotalUnreadCount = () => {
    const placeId = cloudCore.getSelectedPlaceId() || '';
    const { channels } = useChannels({ placeId });

    return useMemo(() => {
        return channels.reduce((sum: number, ch) => sum + ((ch.unreadCount as number) ?? 0), 0);
    }, [channels]);
};
