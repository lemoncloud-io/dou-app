import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { UserUpdateSitePayload, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import { useState } from 'react';

import { useMyPlaces } from './useMyPlaces';

export const useUpdateMyPlace = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { setPlaces } = useMyPlaces();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const updatePlace = (payload: UserUpdateSitePayload): Promise<MySiteView> => {
        return new Promise((resolve, reject) => {
            setIsPending(true);
            setIsError(false);

            const timeoutId = setTimeout(() => {
                unsubscribe();
                setIsPending(false);
                setIsError(true);
                reject(new Error('updatePlace timeout'));
            }, 10000);

            const unsubscribe = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                lastMessage => {
                    const envelope = lastMessage as WSSEnvelope<MySiteView> | null;
                    if (!envelope) return;
                    if (envelope.type !== 'user') return;
                    if (envelope.action !== 'update-site' && envelope.action !== 'error') return;

                    clearTimeout(timeoutId);
                    unsubscribe();
                    setIsPending(false);

                    if (envelope.action === 'error') {
                        setIsError(true);
                        reject(
                            new Error(
                                (envelope.payload as unknown as { error?: string })?.error ?? 'updatePlace failed'
                            )
                        );
                        return;
                    }

                    const updated = envelope.payload;
                    if (updated) {
                        setPlaces(prev => prev.map(p => (p.id === updated.id ? updated : p)));
                    }
                    resolve(updated);
                }
            );

            emitAuthenticated({ type: 'user', action: 'update-site', payload });
        });
    };

    return { updatePlace, isPending, isError };
};
