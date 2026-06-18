import { useMutation } from '@tanstack/react-query';
import { logger } from '@chatic/bridges';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useWebCoreStore } from '../../stores';

import {
    findAlias,
    issueCloudDelegationToken,
    issueCloudToken,
    login,
    logout,
    refreshCloudToken,
    registerDevice,
    registerUser,
    registerUserV2,
    verifyAlias,
} from '../../api';

import {
    type CloudDelegationTokenView,
    type LoginUserBody,
    type RegisterUserV2Body,
    type UserBody,
    type UserProfile$,
    type UserTokenView,
    type UserView,
} from '@lemoncloud/chatic-backend-api';
import type { AxiosError } from 'axios';

import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '../../api';

export const authKeys = createQueryKeys('auth');

export const useRegisterDevice = () => useCustomMutation<UserTokenView, string, string>(registerDevice);

export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });

export const useRegisterUserV2 = () =>
    useCustomMutation<UserView, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {
            onSuccess: () => {
                logger.info('AUTH', 'User registered successfully');
            },
        }
    );

export const useLogin = () => {
    const { setProfile, setIsAuthenticated } = useWebCoreStore();

    return useCustomMutation<UserTokenView, string, LoginUserBody>(login, {
        onSuccess: data => {
            const { Token: _Token, ...rest } = data;
            setProfile(rest as unknown as UserProfile$);
            setIsAuthenticated(true);
            logger.info('AUTH', 'Login successful');
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
    return useCustomMutation<IssueCloudTokenResult, string, string>(async (cloudId: string) => {
        const cloudDelegationToken: CloudDelegationTokenView = await issueCloudDelegationToken(cloudId);
        const userToken: UserTokenView = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

        return { cloudDelegationToken, userToken };
    });
};

export const useRefreshCloudToken = () => {
    return useMutation({
        mutationFn: ({ target }: { target?: string } = {}) => refreshCloudToken(target),
    });
};

export const useFindAlias = () => useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(findAlias);

export const useVerifyAlias = () => useCustomMutation<VerifyAliasView, AxiosError, VerifyAliasBody>(verifyAlias);

export const useLogout = () => {
    const storeLogout = useWebCoreStore(s => s.logout);

    return useCustomMutation<void, string, void>(async () => {
        await logout().catch(err => {
            logger.error('AUTH', '[useLogout] Server logout failed', { error: err });
        });
        await storeLogout();
    });
};
