import { useMemo } from 'react';

import { cloudCore } from '@chatic/web-core';

import { useChannels } from '../../../shared/hooks/useChannels';

export const useTotalUnreadCount = () => {
    const placeId = cloudCore.getSelectedPlaceId() || '';
    const { channels } = useChannels({ placeId, detail: true });

    return useMemo(() => {
        return channels.reduce((sum: number, ch) => sum + ((ch.unreadCount as number) ?? 0), 0);
    }, [channels]);
};
