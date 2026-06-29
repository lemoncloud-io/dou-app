import { useQuery } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { fetchInviteInfoWithCode } from '../../api';
import { useSessionAuth } from '../session';

/**
 * Fetches invite metadata (inviter, target site/channel) for the accept popup.
 *
 * `fetchInviteInfoWithCode` issues a signed request, so it requires an authenticated session
 * (the background guest login). The query stays disabled until both the code and backend are
 * present and auth has settled, so a non-invite landing never fires a request.
 */
export const useInviteInfo = (code?: string | null, backend?: string) => {
    const { isAuthenticated } = useSessionAuth();
    const enabled = isAuthenticated && !!code && !!backend;

    return useQuery<MyInviteView>({
        queryKey: ['inviteInfo', code, backend],
        queryFn: () => fetchInviteInfoWithCode(code as string, backend as string),
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
    });
};
