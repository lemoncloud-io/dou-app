import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useSimpleWebCore } from '@chatic/web-core';

import { login, registerUser, registerUserV2 } from '../apis';

import type {
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';

export const authKeys = createQueryKeys('auth');

export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            console.log('User registered successfully');
        },
    });

export const useRegisterUserV2 = () =>
    useCustomMutation<UserView, string, RegisterUserV2Body>(registerUserV2, {
        onSuccess: () => {
            console.log('User registered successfully');
        },
    });

export const useLogin = () => {
    const { login: setLogin } = useSimpleWebCore();

    return useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: data => {
            setLogin(data.User);
            console.log('Login successful');
        },
    });
};
