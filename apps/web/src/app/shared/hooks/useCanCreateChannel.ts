import { cloudCore, useUserContext } from '@chatic/web-core';
import { useChannels } from '@chatic/data';

export const useCanCreateChannel = () => {
    const { permissions } = useUserContext();
    const placeId = cloudCore.getSelectedPlaceId() || '';
    const { channels, isLoading } = useChannels({ placeId, detail: true });

    const selectedCloudId = cloudCore.getSelectedCloudId();
    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';

    const currentCount = channels.length;
    const maxCount = permissions.maxChannels;
    const canCreate = permissions.canCreateChannel && !isLoading && currentCount < maxCount && !isDefaultCloud;
    const isLimitReached = !isLoading && currentCount >= maxCount;

    return {
        canCreate,
        isDefaultCloud,
        isLimitReached,
        isLoading,
        currentCount,
        maxCount,
    };
};
