import type { Params } from '@lemoncloud/lemon-web-core';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../../api';
import { usersKeys } from '../../api/types/cloud';

export const useUsers = (params: Params = {}) =>
    useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => fetchUsers(params),
        refetchOnWindowFocus: false,
    });
