import { useQuery } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { inviteInfoQuery } from '@chatic/runtime/api/session';
import { useSessionAuth } from '../session';

export const useInviteInfo = (code?: string | null, backend?: string) => {
    const { isAuthenticated } = useSessionAuth();
    return useQuery<MyInviteView>(inviteInfoQuery(code, backend, isAuthenticated));
};
