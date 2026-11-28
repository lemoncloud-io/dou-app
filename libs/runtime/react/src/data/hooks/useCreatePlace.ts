import { useCallback } from 'react';

import type { DomainPlace } from '@chatic/data';

import { useRuntimeRepositories } from './useRuntimeRepositories';

export interface CreatePlaceInput {
    name: string;
    thumbnail?: string;
}

export const useCreatePlace = () => {
    const { place: placeRepository } = useRuntimeRepositories();

    const createPlace = useCallback(
        ({ name, thumbnail }: CreatePlaceInput): Promise<DomainPlace> =>
            placeRepository.createPlace({ name, thumbnail }),
        [placeRepository]
    );

    return { createPlace };
};
