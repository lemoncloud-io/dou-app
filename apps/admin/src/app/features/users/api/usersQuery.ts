import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';
import { createQueryKeys } from '@chatic/shared';

import { relayOverrideFor, type ServiceStage } from '../../../config/stageEndpoints';

/** Query parameters for a relay request. */
type Params = Record<string, unknown>;

/**
 * Relay user listing for the console, moved down from `@chatic/app-runtime`'s `data/hooks/user.ts`.
 *
 * This console is the only consumer the listing has ever had (`IUserRepository.listRelayUsers`
 * says as much), so both the hook and its cache key belong here rather than on the shared runtime
 * surface (ADR-0070, decision 5, following option ②).
 */
export const usersKeys = createQueryKeys('users');

/**
 * The stage is part of the key: switching it has to refetch, not relabel the other relay's rows. The
 * override is resolved inside `queryFn`, so an unset stage key shows as the query's error.
 */
export const useUsers = (params: Params = {}, stage: ServiceStage) => {
    const { user } = runtime.data.useRuntimeRepositories();

    return useQuery({
        queryKey: usersKeys.list({ ...params, stage }),
        queryFn: () => {
            const endpoint = relayOverrideFor(stage);
            return user.listRelayUsers(params, endpoint ? { endpoint } : undefined);
        },
        refetchOnWindowFocus: false,
    });
};
