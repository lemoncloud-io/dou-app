import { useState } from 'react';

import { runtime } from '@chatic/runtime-react';

interface UpdatePlacePayload {
    id: string;
    sid: string;
    name?: string;
    thumbnail?: string;
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
