import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

export interface CreatePlaceInput {
    name: string;
    thumbnail?: string;
}

export const useCreatePlace = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();

    const createPlace = useCallback(
        ({ name, thumbnail }: CreatePlaceInput): Promise<DomainPlace> =>
            placeRepository.createPlace({ name, thumbnail }),
        [placeRepository]
    );

    return { createPlace };
};
