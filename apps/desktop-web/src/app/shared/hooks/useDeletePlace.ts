import { useCallback } from 'react';

import { runtime } from '@chatic/runtime';

export const useDeletePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const deletePlace = useCallback(
        (placeId: string): Promise<void> => placeRepository.deletePlace(placeId),
        [placeRepository]
    );

    return { deletePlace };
};
