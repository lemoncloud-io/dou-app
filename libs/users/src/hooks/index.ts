import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

import { fetchClouds, fetchUsers, registerDeviceToken, verifyNativeAppToken, verifyEmail } from '../apis';

import type { Params } from '@lemoncloud/lemon-web-core';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type {
    CloudVerifyEmailBody,
    CloudVerifyEmailView,
    RegisterDeviceTokenBody,
    UserTokenView,
} from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

export const usersKeys = createQueryKeys('users');
export const cloudsKeys = createQueryKeys('clouds');

export const useClouds = (params: Params = {}) => {
    const { isAuthenticated } = useWebCoreStore();
    return useQuery({
        queryKey: cloudsKeys.list(params),
        queryFn: async () => {
            const result = await fetchClouds(params);
            console.log('[useClouds] result:', result);
            return result;
        },
        enabled: isAuthenticated,
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

export const useRegisterDeviceToken = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody>(body => registerDeviceToken(body));

export const useVerifyNativeAppToken = () =>
    useCustomMutation<UserTokenView, string, VerifyNativeTokenBody>(body => verifyNativeAppToken(body));

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

export const useVerifyEmail = () =>
    useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        verifyEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
