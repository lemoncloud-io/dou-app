import { useMutation } from '@tanstack/react-query';
import { loginWithInviteCode } from '../../session';

/**
 * Logs into relay with an invite code and preserves invite identity state.
 */
export const useLoginWithInviteCode = () =>
    useMutation({
        mutationFn: ({ code, delegatorId, backend }: { code: string; delegatorId: string; backend?: string }) =>
            loginWithInviteCode({ code, delegatorId, backend }),
    });
