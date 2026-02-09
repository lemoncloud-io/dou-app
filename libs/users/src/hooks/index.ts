import { useQuery } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import { fetchUsers } from '../apis';

import type { Params } from '@lemoncloud/lemon-web-core';

export const usersKeys = createQueryKeys('users');

export const useUsers = (params: Params = {}) =>
    useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => fetchUsers(params),
        refetchOnWindowFocus: false,
    });
