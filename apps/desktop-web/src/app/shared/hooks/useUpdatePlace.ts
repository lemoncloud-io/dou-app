import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

export interface UpdatePlaceInput {
    id: string;
    /** Left out when the name is not being changed. */
    name?: string;
    /** A base64 data URL for a new photo, or an empty string for a removed one, as the web app sends. */
    thumbnail?: string;
}

/**
 * Changes a place's name or photo. The repository writes the change into the place cache before
 * the server answers and puts the old row back when the server refuses, so the rail shows the edit
 * at once and never keeps one that did not land.
 */
export const useUpdatePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const updatePlace = useCallback(
        (input: UpdatePlaceInput): Promise<DomainPlace> => placeRepository.updatePlace(input),
        [placeRepository]
    );

    return { updatePlace };
};
