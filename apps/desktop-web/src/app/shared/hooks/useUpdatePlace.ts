import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

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
