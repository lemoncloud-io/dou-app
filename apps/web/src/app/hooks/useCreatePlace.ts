import type { DomainPlace } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';

export interface CreatePlaceInput {
    name: string;
    /** Optional profile image (base64). place.create accepts `thumbnail` on its body. */
    thumbnail?: string;
}

export const useCreatePlace = () => {
    const { place } = useRuntimeRepositories();

    // Returns the created place so the caller can switch the active site into it (see
    // CreatePlaceDialog → useSiteSwitch). `thumbnail` rides through on PlaceCreateInput's body.
    const createPlace = async ({ name, thumbnail }: CreatePlaceInput): Promise<DomainPlace> => {
        return await place.createPlace({ name, thumbnail });
    };

    return { createPlace };
};
