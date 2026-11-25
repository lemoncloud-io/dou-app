import { runtime, type DomainPlace } from '@chatic/runtime-react';

export interface CreatePlaceInput {
    name: string;
    thumbnail?: string;
}

export const useCreatePlace = () => {
    const { place } = runtime.data.useRuntimeRepositories();

    const createPlace = async ({ name, thumbnail }: CreatePlaceInput): Promise<DomainPlace> => {
        return await place.createPlace({ name, thumbnail });
    };

    return { createPlace };
};
