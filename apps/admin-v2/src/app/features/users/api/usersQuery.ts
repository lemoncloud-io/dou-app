import { useQuery } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { createQueryKeys } from '@chatic/shared';

import type { Params } from '@lemoncloud/lemon-web-core';

/**
 * Relay user listing for the console, moved down from `@chatic/app-runtime`'s `data/hooks/user.ts`.
 *
 * This console is the only consumer the listing has ever had (`IUserRepositoryV2.listRelayUsers`
 * says as much), so both the hook and its cache key belong here rather than on the shared runtime
 * surface (ADR-0070 결정 5, ②안 방향).
 */
export const usersKeys = createQueryKeys('users');

export const useUsers = (params: Params = {}) => {
    const { user } = useRuntimeRepositories();

    return useQuery({
        queryKey: usersKeys.list(params),
        queryFn: () => user.listRelayUsers(params),
        refetchOnWindowFocus: false,
    });
};
