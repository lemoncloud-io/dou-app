import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

export interface CreatePlaceInput {
    name: string;
    /** Optional place photo, as a base64 data URL. */
    thumbnail?: string;
}

/**
 * Makes a place in the active cloud. The repository writes the new row into the place cache before
 * it returns, so the rail (which observes that cache) shows the place without a refetch. Creating
 * does not enter the place: the session stays where it was until the caller switches.
 */
export const useCreatePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const createPlace = useCallback(
        ({ name, thumbnail }: CreatePlaceInput): Promise<DomainPlace> =>
            placeRepository.createPlace({ name, thumbnail }),
        [placeRepository]
    );

    return { createPlace };
};
