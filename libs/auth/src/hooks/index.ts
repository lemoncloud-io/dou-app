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
    useCustomMutation<UserView, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {
            onSuccess: () => {
                console.log('User registered successfully');
            },
        }
    );

export const useLogin = () => {
    const { setProfile, setIsAuthenticated } = useSimpleWebCore();

    return useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: data => {
            setProfile(data);
            setIsAuthenticated(true);
            console.log('Login successful');
        },
    });
};
export const useIssueToken = () => {
    const mutation = useCustomMutation<UserTokenView, string, LoginUserBody & { email?: boolean }>(
        ({ email, ...body }) => login(body, email)
    );

    return {
        ...mutation,
        issuingLoginId: mutation.isPending ? mutation.variables?.uid : null,
    };
};
