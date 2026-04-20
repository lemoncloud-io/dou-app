import { usePlaceMutations } from '@chatic/data';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const useCreatePlace = () => {
    const { makeSite, isPending } = usePlaceMutations();

    const createPlace = async (name: string): Promise<MySiteView> => {
        return await makeSite({ name, stereo: 'work' });
    };

    return { createPlace, isLoading: isPending['make-site'], isError: false, place: null };
};
