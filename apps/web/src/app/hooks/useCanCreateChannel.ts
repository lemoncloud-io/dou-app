import { useCloudSessionCatalog, useSessionIdentity, useSessionSelection } from 'libs/web-core/src';

interface ChannelsInfo {
    count: number;
    isLoading: boolean;
}

export const useCanCreateChannel = (channelsInfo: ChannelsInfo) => {
    const { permissions, activeProfile: profile } = useSessionIdentity();
    const { clouds } = useCloudSessionCatalog();
    const { selectedCloudId } = useSessionSelection();

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
