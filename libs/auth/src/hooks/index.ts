import { useMutation } from '@tanstack/react-query';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';

import { issueCloudToken, login, registerDevice, registerUser, registerUserV2 } from '../apis';

import type {
    CloudDelegationTokenView,
    LoginUserBody,
    RegisterUserV2Body,
    UserBody,
    UserTokenView,
    UserView,
} from '@lemoncloud/chatic-backend-api';

import { issueCloudDelegationToken } from '@chatic/users';

export const authKeys = createQueryKeys('auth');

export const useRegisterDevice = () => useCustomMutation<UserTokenView, string, string>(registerDevice);

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
    const { setProfile, setIsAuthenticated } = useWebCoreStore();

    return useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: data => {
            const { Token, ...rest } = data;
            setProfile(rest);
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

export type IssueCloudTokenResult = {
    cloudDelegationToken: CloudDelegationTokenView;
    userToken: UserTokenView;
};

export const useIssueCloudToken = () => {
    return useCustomMutation<IssueCloudTokenResult, string, string>(async (placeId: string) => {
        const cloudDelegationToken = await issueCloudDelegationToken(placeId);
        const userToken = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

        return { cloudDelegationToken, userToken };
    });
};

export const useRefreshCloudToken = () => {
    return useMutation({
        mutationFn: () => cloudCore.refreshToken(),
    });
};
