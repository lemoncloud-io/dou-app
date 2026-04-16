import { cloudCore, useUserContext } from '@chatic/web-core';
import { useChannels } from '@chatic/socket-data';

export const useCanCreateChannel = () => {
    const { permissions } = useUserContext();
    const placeId = cloudCore.getSelectedPlaceId() || '';
    const { channels, isLoading } = useChannels({ placeId });

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
