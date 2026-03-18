import { useQuery } from '@tanstack/react-query';

import { createQueryKeys, useCustomMutation } from '@chatic/shared';

import { fetchUsers, registerDeviceToken } from '../apis';

import type { Params } from '@lemoncloud/lemon-web-core';
import type { RegisterDeviceResult } from '@lemoncloud/chatic-pushes-api';
import type { RegisterDeviceTokenBody } from '@lemoncloud/chatic-backend-api';

export const usersKeys = createQueryKeys('users');

export const useUsers = (params: Params = {}) =>
    useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => fetchUsers(params),
        refetchOnWindowFocus: false,
    });

export const useRegisterDeviceToken = () =>
    useCustomMutation<RegisterDeviceResult, string, RegisterDeviceTokenBody>(body => registerDeviceToken(body));
