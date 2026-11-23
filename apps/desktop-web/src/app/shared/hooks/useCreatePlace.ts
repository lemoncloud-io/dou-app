import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

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
