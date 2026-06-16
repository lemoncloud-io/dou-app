import { useState } from 'react';

import { useWebCoreStore, useUserContext, UserType } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';
import type { UserUpdateProfilePayload } from '@lemoncloud/chatic-sockets-api';
import { useRepositories } from '../../../shared/data';

type UserView = UserProfile$['$user'];

export const useUpdateMyProfile = () => {
    const { user: userRepository } = useRepositories();
    const { userType } = useUserContext();
    const [isPending, setIsPending] = useState(false);
    const [isError, setIsError] = useState(false);

    const updateProfile = (payload: UserUpdateProfilePayload): Promise<UserView> => {
        if (userType === UserType.TEMP_ACCOUNT) return Promise.reject(new Error('Not a cloud user'));

        return new Promise((resolve, reject) => {
            setIsPending(true);
            setIsError(false);
            userRepository
                .updateProfile(payload)
                .then(updated => {
                    setIsPending(false);
                    if (updated) {
                        const currentProfile = useWebCoreStore.getState().profile;
                        if (currentProfile) {
                            useWebCoreStore.getState().setProfile({
                                ...currentProfile,
                                $user: { ...currentProfile.$user, ...updated },
                            } as UserProfile$);
                        }
                    }
                    resolve(updated as UserView);
                })
                .catch(error => {
                    setIsPending(false);
                    setIsError(true);
                    reject(error);
                });
        });
    };

    return { updateProfile, isPending, isError };
};
