import { useQuery } from '@tanstack/react-query';

import { logger } from '@chatic/bridges';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

import { fetchClouds, fetchUsers, registerDeviceToken, updateCloud, verifyEmail, verifyNativeAppToken } from '../apis';

import type {
    CloudBody,
    CloudVerifyEmailBody,
    CloudVerifyEmailView,
    CloudView,
    RegisterDeviceTokenBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { Params } from '@lemoncloud/lemon-web-core';

export const usersKeys = createQueryKeys('users');
export const cloudsKeys = createQueryKeys('clouds');

export type UseCloudsParams = Params & {
    /**
     * Legacy compatibility: some callers still pass `enabled` in the params object.
     * The hook strips it before building the actual request params.
     */
    enabled?: boolean;
};

export type UseCloudsOptions = {
    /**
     * Additional local gate on top of the auth check before the query can run.
     */
    enabled?: boolean;
};

/**
 * Query hook for the current user's cloud list.
 * Runs only when the user is authenticated and the optional `enabled` gate is true.
 */
export const useClouds = (params: UseCloudsParams = {}, options?: UseCloudsOptions) => {
    const { isAuthenticated } = useWebCoreStore();
    const { enabled: legacyEnabled, ...requestParams } = params;
    const enabled = options?.enabled ?? legacyEnabled ?? true;

    return useQuery({
        queryKey: cloudsKeys.list(requestParams),
        queryFn: async () => {
            const result = await fetchClouds(requestParams);
            logger.debug('USERS', '[useClouds] result', result);
            return result;
        },
        enabled: isAuthenticated && enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
        refetchOnMount: 'always',
    });
};

/**
 * Query hook for the current user list.
 * Exposed so admin and picker UIs can share the same query key contract.
 */
export const useUsers = (params: Params = {}) =>
    useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => fetchUsers(params),
        refetchOnWindowFocus: false,
    });

/**
 * Mutation hook for updating a cloud profile.
 */
export const useUpdateCloud = () =>
    useCustomMutation<CloudView, string, { id: string; body: CloudBody }>(({ id, body }) => updateCloud(id, body));

/**
 * Mutation hook for registering the current device push token.
 */
export const useRegisterDeviceToken = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => registerDeviceToken(body, { force })
    );

/**
 * Mutation hook that verifies a native-app token and issues a web user token.
 */
export const useVerifyNativeAppToken = () =>
    useCustomMutation<UserTokenView, string, VerifyNativeTokenBody>(body => verifyNativeAppToken(body));

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

/**
 * Mutation hook for the cloud email verification flow.
 * In local and dev environments, the `confirm` step runs as a dry-run to avoid creating real accounts.
 */
export const useVerifyEmail = () =>
    useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        verifyEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
