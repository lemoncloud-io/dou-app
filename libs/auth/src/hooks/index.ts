import { useMutation } from '@tanstack/react-query';
import { logger } from '@chatic/bridges';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

import {
    findAlias,
    issueCloudToken,
    login,
    logout,
    refreshCloudToken,
    registerDevice,
    registerUser,
    registerUserV2,
    verifyAlias,
} from '../apis';

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

import type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '../types';

import { issueCloudDelegationToken } from '@chatic/users';

export const authKeys = createQueryKeys('auth');

/**
 * Mutation for issuing a temporary auth token from a device id.
 */
export const useRegisterDevice = () => useCustomMutation<UserTokenView, string, string>(registerDevice);

/**
 * Mutation for the basic sign-up flow.
 * Only logs on success; follow-up session handling stays with the caller.
 */
export const useRegisterUser = () =>
    useCustomMutation<UserView, string, UserBody>(registerUser, {
        onSuccess: () => {
            logger.info('AUTH', 'User registered successfully');
        },
    });

/**
 * Mutation for the extended sign-up flow.
 * Keeps the email post-processing flag separate from the main payload.
 */
export const useRegisterUserV2 = () =>
    useCustomMutation<UserView, string, RegisterUserV2Body & { email?: boolean }>(
        ({ email, ...body }) => registerUserV2(body, email),
        {
            onSuccess: () => {
                logger.info('AUTH', 'User registered successfully');
            },
        }
    );

/**
 * Mutation that updates the global profile and auth state after login succeeds.
 */
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

/**
 * Same login request as `useLogin`, but also exposes the uid currently being issued.
 * Useful when a list UI needs to show which login request is pending.
 */
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

/**
 * Two-step mutation for cloud switching.
 * 1) Issue a delegation token from relay
 * 2) Exchange it for a user token on the target cloud backend
 */
export const useIssueCloudToken = () => {
    return useCustomMutation<IssueCloudTokenResult, string, string>(async (cloudId: string) => {
        const cloudDelegationToken: CloudDelegationTokenView = await issueCloudDelegationToken(cloudId);
        const userToken: UserTokenView = await issueCloudToken(cloudDelegationToken.backend as string, {
            delegationToken: cloudDelegationToken.delegationToken,
        });

        return { cloudDelegationToken, userToken };
    });
};

/**
 * Mutation that directly triggers a refresh of the current cloud session token.
 */
export const useRefreshCloudToken = () => {
    return useMutation({
        mutationFn: ({ target }: { target?: string } = {}) => refreshCloudToken(target),
    });
};

/**
 * Mutation that checks whether an email alias exists.
 */
export const useFindAlias = () => useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(findAlias);

/**
 * Mutation that runs a step of the email alias verification flow.
 */
export const useVerifyAlias = () => useCustomMutation<VerifyAliasView, AxiosError, VerifyAliasBody>(verifyAlias);

/**
 * Mutation that performs logout and then clears local client state.
 * Client cleanup still runs even if the server logout request fails.
 */
export const useLogout = () => {
    const storeLogout = useWebCoreStore(s => s.logout);

    return useCustomMutation<void, string, void>(async () => {
        // 1. Request server logout. Local cleanup should still continue if this fails.
        await logout().catch(err => {
            logger.error('AUTH', '[useLogout] Server logout failed', { error: err });
        });
        // 2. Clear local auth state and trigger the normal post-logout redirect flow.
        await storeLogout();
    });
};
