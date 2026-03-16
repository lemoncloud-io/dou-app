import { useWebCoreStore } from '@chatic/web-core';

import { useMyChannels } from '../../features/home/hooks/useMyChannels';
import { GUEST_MAX_CHANNELS, MAX_CHANNELS_PER_PLACE } from '../consts/limits';

export const useCanCreateChannel = () => {
    const { isGuest } = useWebCoreStore();
    const { channels, isLoading } = useMyChannels();

    const currentCount = channels.length;
    const maxCount = isGuest ? GUEST_MAX_CHANNELS : MAX_CHANNELS_PER_PLACE;
    const canCreate = !isLoading && currentCount < maxCount;
    const isLimitReached = !isLoading && currentCount >= maxCount;

    return {
        canCreate,
        isLimitReached,
        isLoading,
        currentCount,
        maxCount,
    };
};
