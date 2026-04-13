import { useUserContext } from '@chatic/web-core';

import { useMyChannels } from '../../features/home/hooks/useMyChannels';

export const useCanCreateChannel = () => {
    const { permissions } = useUserContext();
    const { channels, isLoading } = useMyChannels();

    const currentCount = channels.length;
    const maxCount = permissions.maxChannels;
    const canCreate = permissions.canCreateChannel && !isLoading && currentCount < maxCount;
    const isLimitReached = !isLoading && currentCount >= maxCount;

    return {
        canCreate,
        isLimitReached,
        isLoading,
        currentCount,
        maxCount,
    };
};
