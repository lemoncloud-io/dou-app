import { useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore, useUserContext, UserType } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { UserUpdateProfilePayload, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

type UserView = UserProfile$['$user'];

export const useUpdateMyProfile = () => {
    const { emitAuthenticated } = useWebSocketV2();
    const { userType } = useUserContext();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const updateProfile = (payload: UserUpdateProfilePayload): Promise<UserView> => {
        if (userType === UserType.TEMP_ACCOUNT) return Promise.reject(new Error('Not a cloud user'));

        return new Promise((resolve, reject) => {
            setIsPending(true);
            setIsError(false);

            const timeoutId = setTimeout(() => {
                unsubscribe();
                setIsPending(false);
                setIsError(true);
                reject(new Error('updateProfile timeout'));
            }, 10000);

            const unsubscribe = useWebSocketV2Store.subscribe(
                s => s.lastMessage,
                lastMessage => {
                    const envelope = lastMessage as WSSEnvelope<UserView> | null;
                    if (!envelope) return;
                    if (envelope.type !== 'user') return;
                    if (envelope.action !== 'update-profile' && envelope.action !== 'error') return;

                    clearTimeout(timeoutId);
                    unsubscribe();
                    setIsPending(false);

                    if (envelope.action === 'error') {
                        setIsError(true);
                        reject(
                            new Error(
                                (envelope.payload as unknown as { error?: string })?.error ?? 'updateProfile failed'
                            )
                        );
                        return;
                    }

                    const updated = envelope.payload;
                    if (updated) {
                        const currentProfile = useWebCoreStore.getState().profile;
                        if (currentProfile) {
                            useWebCoreStore.getState().setProfile({
                                ...currentProfile,
                                $user: { ...currentProfile.$user, ...updated },
                            } as UserProfile$);
                        }
                    }
                    resolve(updated);
                }
            );

            emitAuthenticated({ type: 'user', action: 'update-profile', payload });
        });
    };

    return { updateProfile, isPending, isError };
};
