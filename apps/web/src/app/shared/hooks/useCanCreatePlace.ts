import { cloudCore, useUserContext, useWebCoreStore } from '@chatic/web-core';
import { usePlaces } from '@chatic/data';

import { useCloudSession } from './useCloudSession';
import { MAX_PLACES } from '../consts/limits';

export const useCanCreatePlace = () => {
    const { permissions } = useUserContext();
    const { places, isLoading } = usePlaces();
    const { clouds } = useCloudSession();
    const { profile } = useWebCoreStore();

    const selectedCloudId = cloudCore.getSelectedCloudId();
    const selectedCloud = clouds.find(c => c.id === selectedCloudId);
    const myUserId = profile?.uid;

    // Can only create place if the selected cloud is owned by me
    const isMyCloud = selectedCloud ? selectedCloud.ownerId === myUserId : false;

    console.log('[useCanCreatePlace]', {
        selectedCloudId,
        selectedCloud: selectedCloud ? { id: selectedCloud.id, ownerId: selectedCloud.ownerId } : null,
        myUserId,
        isMyCloud,
        cloudsCount: clouds.length,
        canCreatePlace: permissions.canCreatePlace,
        placesCount: places.length,
        isLoading,
    });

    const currentCount = places.length;
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
