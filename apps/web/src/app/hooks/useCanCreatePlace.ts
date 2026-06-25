import { useCloudSessionCatalog, useSessionIdentity, useSessionSelection } from 'libs/web-core/src';

import { MAX_PLACES } from '../consts/limits';

interface PlacesInfo {
    count: number;
    isLoading: boolean;
}

export const useCanCreatePlace = (placesInfo: PlacesInfo) => {
    const { permissions, activeProfile: profile } = useSessionIdentity();
    const { clouds } = useCloudSessionCatalog();
    const { selectedCloudId } = useSessionSelection();

    const selectedCloud = clouds.find(c => c.id === selectedCloudId);
    const myUserId = profile?.uid;

    // Can only create place if the selected cloud is owned by me
    const isMyCloud = selectedCloud ? selectedCloud.ownerId === myUserId : false;

    const currentCount = placesInfo.count;
    const isLoading = placesInfo.isLoading;
    const canCreate = permissions.canCreatePlace && !isLoading && currentCount < MAX_PLACES && isMyCloud;
    const isLimitReached = !isLoading && currentCount >= MAX_PLACES;

    return {
        canCreate,
        isLimitReached,
        isLoading,
        currentCount,
        maxCount: MAX_PLACES,
        isMyCloud,
    };
};
