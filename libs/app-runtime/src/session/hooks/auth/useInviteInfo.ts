import { useQuery } from '@tanstack/react-query';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { fetchInviteInfoWithCode } from '../../auth/authActions';
import { getDynamicRelayBackend } from '@chatic/web-config';
import { useSessionAuth } from '../session';

/**
 * Fetches invite metadata (inviter, target site/channel) for the accept popup.
 *
 * `fetchInviteInfoWithCode` issues a signed request, so it requires an authenticated session
 * (the background guest login). The query stays disabled until the code, a resolved endpoint and
 * settled auth are all present, so a non-invite landing never fires a request.
 *
 * Relay invites carry no `_backend`, so an absent `backend` falls back to the env relay endpoint —
 * mirroring `registerUserWithInviteCode`, which already resolves the same way for the accept call.
 */
export const useInviteInfo = (code?: string | null, backend?: string) => {
    const { isAuthenticated } = useSessionAuth();
    const endpoint = backend || getDynamicRelayBackend();
    const enabled = isAuthenticated && !!code && !!endpoint;

    return useQuery<MyInviteView>({
        queryKey: ['inviteInfo', code, endpoint],
        queryFn: () => fetchInviteInfoWithCode(code as string, endpoint),
        enabled,
        refetchOnWindowFocus: false,
        staleTime: 0,
    });
};
