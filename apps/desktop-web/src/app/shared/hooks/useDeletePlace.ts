import { useCallback } from 'react';

import { runtime } from '@chatic/app-runtime';

/**
 * Deletes a place of the active cloud. The repository asks the server first and drops the row from
 * the place cache only once it has agreed, so the rail (which observes that cache) loses the tile
 * when the place is really gone and keeps it when the delete is refused.
 */
export const useDeletePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const deletePlace = useCallback(
        (placeId: string): Promise<void> => placeRepository.deletePlace(placeId),
        [placeRepository]
    );

    return { deletePlace };
};
