import { createQueryKeys, useCustomMutation } from '@chatic/shared';

import { login, registerUser } from '../apis';

import type { LoginUserBody, UserBody, UserTokenView, UserView } from '@lemoncloud/chatic-backend-api';

export const authKeys = createQueryKeys('auth');

export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            console.log('User registered successfully');
        },
    });

export const useLogin = () =>
    useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: () => {
            console.log('Login successful');
        },
    });
