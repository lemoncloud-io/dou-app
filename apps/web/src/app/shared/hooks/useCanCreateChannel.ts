import { cloudCore, useUserContext, useWebCoreStore } from '@chatic/web-core';
import { useChannels } from '@chatic/data';

import { useCloudSession } from './useCloudSession';

export const useCanCreateChannel = () => {
    const { permissions } = useUserContext();
    const { clouds } = useCloudSession();
    const { profile } = useWebCoreStore();
    const placeId = cloudCore.getSelectedPlaceId() || '';
    const { channels, isLoading } = useChannels({ placeId, detail: true });

    const selectedCloudId = cloudCore.getSelectedCloudId();
    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    const selectedCloud = clouds.find(c => c.id === selectedCloudId);
    const isMyCloud = selectedCloud ? selectedCloud.ownerId === profile?.uid : false;

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
        isMyCloud,
    };
};
