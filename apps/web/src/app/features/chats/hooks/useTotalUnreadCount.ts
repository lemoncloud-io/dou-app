import { useMemo } from 'react';

import { cloudCore } from '@chatic/web-core';

import { useChannels } from '../../../shared/hooks';

export const useTotalUnreadCount = () => {
    const sid = cloudCore.getSelectedPlaceId() || '';
    const { channels } = useChannels({ sid, detail: true });

    return useMemo(() => {
        return channels.reduce((sum: number, ch) => sum + ((ch.unreadCount as number) ?? 0), 0);
    }, [channels]);
};
