import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';
import { createQueryKeys } from '@chatic/shared';

import { relayOverrideFor, type ServiceStage } from '../../../config/stageEndpoints';

type Params = Record<string, unknown>;

export const usersKeys = createQueryKeys('users');

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
