import { useQuery } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { config } from '@chatic/config';

import { fetchInviteInfoWithCode } from '@chatic/runtime-client';
import { useSessionAuth } from '../session';

export const useInviteInfo = (code?: string | null, backend?: string) => {
    const { isAuthenticated } = useSessionAuth();
    const endpoint = backend || (config.get<string>('net.relay.backend') ?? '');
    const enabled = isAuthenticated && !!code && !!endpoint;

    return useQuery<MyInviteView>({
        queryKey: ['inviteInfo', code, endpoint],
        queryFn: () => fetchInviteInfoWithCode(code as string, endpoint),
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
    });
};
