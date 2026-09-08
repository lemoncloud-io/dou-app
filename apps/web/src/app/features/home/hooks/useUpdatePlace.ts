import { useState } from 'react';

import { runtime } from '@chatic/app-runtime';

interface UpdatePlacePayload {
    /** Backend requires `@id` on place.update; for a place, id === sid. */
    id: string;
    sid: string;
    name?: string;
    thumbnail?: string;
    /** Place introduction text. An empty string clears it. */
    desc?: string;
}

export const useUpdatePlace = () => {
    const { place } = runtime.data.useRuntimeRepositories();
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
