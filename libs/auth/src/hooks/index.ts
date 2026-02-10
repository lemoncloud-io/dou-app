import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

import { login, registerUser } from '../apis';

import type { LoginUserBody, UserBody, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';

export const authKeys = createQueryKeys('auth');

export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            console.log('User registered successfully');
        },
    });

export const useLogin = () => {
    const { setIsAuthenticated } = useWebCoreStore();

    return useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: () => {
            setIsAuthenticated(true);
            console.log('Login successful');
        },
    });
};
