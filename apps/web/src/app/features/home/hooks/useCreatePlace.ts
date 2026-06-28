import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { useRuntimeRepositories } from '@chatic/app-runtime';

export const useCreatePlace = () => {
    const { place } = useRuntimeRepositories();

    const createPlace = async (name: string): Promise<MySiteView> => {
        return await place.createPlace({ name });
    };

    return { createPlace };
};
