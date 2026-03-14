import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { useMyPlaces } from './useMyPlaces';

interface UserMakeSitePayload {
    name: string;
    stereo: 'work';
}

export const useCreatePlace = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);
    const [place, setPlace] = useState<MySiteView | null>(null);

    const { setPlaces } = useMyPlaces();

    const createPlace = (name: string): Promise<MySiteView> => {
        setIsLoading(true);
        setIsError(false);

        return new Promise((resolve, reject) => {
            const unsub = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                (envelope: WSSEnvelope<{ site$?: MySiteView }> | null) => {
                    if (envelope?.type !== 'user') return;
                    if (envelope.action === 'error') {
                        unsub();
                        setIsError(true);
                        setIsLoading(false);
                        reject(new Error('user/make-site error'));
                        return;
                    }
                    if (envelope.action !== 'make-site') return;
                    unsub();
                    const newPlace = envelope.payload?.site$ as MySiteView;
                    setPlace(newPlace);
                    setIsLoading(false);
                    setPlaces(prev => [...prev, newPlace]);
                    resolve(newPlace);
                }
            );

            const payload: UserMakeSitePayload = { name, stereo: 'work' };
            emitAuthenticated({ type: 'user', action: 'make-site', payload });
        });
    };

    return { createPlace, isLoading, isError, place };
};
