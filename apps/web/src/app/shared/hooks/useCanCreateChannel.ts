import { cloudCore, useUserContext, useWebCoreStore } from '@chatic/web-core';

import { useCloudSession } from './useCloudSession';

interface ChannelsInfo {
    count: number;
    isLoading: boolean;
}

export const useCanCreateChannel = (channelsInfo: ChannelsInfo) => {
    const { permissions } = useUserContext();
    const { profile } = useWebCoreStore();
    const { clouds } = useCloudSession();

    const selectedCloudId = cloudCore.getSelectedCloudId();
    const isDefaultCloud = !selectedCloudId || selectedCloudId === 'default';
    const selectedCloud = clouds.find(c => c.id === selectedCloudId);
    const isMyCloud = selectedCloud ? selectedCloud.ownerId === profile?.uid : false;

    const currentCount = channelsInfo.count;
    const isLoading = channelsInfo.isLoading;
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
