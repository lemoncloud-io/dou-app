import { usePlaceMutations } from '@chatic/data';

import type { UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';

export const useUpdateMyPlace = () => {
    const { updateSite, isPending } = usePlaceMutations();

    const updatePlace = async (payload: UserUpdateSitePayload): Promise<void> => {
        await updateSite(payload);
    };

    return { updatePlace, isPending: isPending['update-site'], isError: false };
};
