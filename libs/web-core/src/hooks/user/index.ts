import { useQuery } from '@tanstack/react-query';

import { logger } from '@chatic/bridges';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useSessionAuth } from '../session';

import {
    fetchClouds,
    fetchUsers,
    registerDeviceToken,
    updateCloud,
    verifyEmail,
    verifyNativeAppToken,
} from '../../api';

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
    enabled?: boolean;
};

export type UseCloudsOptions = {
    enabled?: boolean;
};

export const useClouds = (params: UseCloudsParams = {}, options?: UseCloudsOptions) => {
    const { isAuthenticated } = useSessionAuth();
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

export const useUsers = (params: Params = {}) =>
    useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => fetchUsers(params),
        refetchOnWindowFocus: false,
    });

export const useUpdateCloud = () =>
    useCustomMutation<CloudView, string, { id: string; body: CloudBody }>(({ id, body }) => updateCloud(id, body));

export const useRegisterDeviceToken = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody & { force?: boolean }>(
        ({ force, ...body }) => registerDeviceToken(body, { force })
    );

export const useVerifyNativeAppToken = () =>
    useCustomMutation<UserTokenView, string, VerifyNativeTokenBody>(body => verifyNativeAppToken(body));

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

export const useVerifyEmail = () =>
    useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        verifyEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
