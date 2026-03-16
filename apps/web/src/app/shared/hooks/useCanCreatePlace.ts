import { useWebCoreStore } from '@chatic/web-core';

import { useMyPlaces } from '../../features/home/hooks/useMyPlaces';
import { MAX_PLACES } from '../consts/limits';

export const useCanCreatePlace = () => {
    const { isGuest } = useWebCoreStore();
    const { places, isLoading } = useMyPlaces();

    const currentCount = places.length;
    const canCreate = !isGuest && !isLoading && currentCount < MAX_PLACES;
    const isLimitReached = !isLoading && currentCount >= MAX_PLACES;

    return {
        canCreate,
        isLimitReached,
        isLoading,
        currentCount,
        maxCount: MAX_PLACES,
    };
};
