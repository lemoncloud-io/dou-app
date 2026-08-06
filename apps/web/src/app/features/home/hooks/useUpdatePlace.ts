import { useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

interface UpdatePlacePayload {
    /** Backend requires `@id` on place.update; for a place, id === sid. */
    id: string;
    sid: string;
    name?: string;
    thumbnail?: string;
}

export const useUpdatePlace = () => {
    const { place } = useRuntimeRepositories();
    const [isPending, setIsPending] = useState(false);

    const updatePlace = async (payload: UpdatePlacePayload): Promise<void> => {
        setIsPending(true);
        try {
            await place.updatePlace(payload as Parameters<typeof place.updatePlace>[0]);
        } finally {
            setIsPending(false);
        }
    };

    return { updatePlace, isPending, isError: false };
};
