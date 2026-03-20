import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@chatic/shared';

import { fetchClouds, fetchUsers, registerDeviceToken, verifyNativeAppToken } from '../apis';

import type { Params } from '@lemoncloud/lemon-web-core';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { RegisterDeviceTokenBody, UserTokenView } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

export const usersKeys = createQueryKeys('users');
export const cloudsKeys = createQueryKeys('clouds');

export const useClouds = (params: Params = {}) =>
    useQuery({
        queryKey: cloudsKeys.list(params),
        queryFn: () => fetchClouds(params),
        refetchOnWindowFocus: false,
    });

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
