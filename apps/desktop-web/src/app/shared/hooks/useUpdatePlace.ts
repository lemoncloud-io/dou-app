import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

export interface UpdatePlaceInput {
    id: string;
    name?: string;
    thumbnail?: string;
    desc?: string;
}

export const useUpdatePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const updatePlace = useCallback(
        (input: UpdatePlaceInput): Promise<DomainPlace> => placeRepository.updatePlace(input),
        [placeRepository]
    );

    return { updatePlace };
};
