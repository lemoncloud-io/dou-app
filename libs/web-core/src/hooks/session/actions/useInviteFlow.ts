import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSessionIdentity } from '../readers/useSessionIdentity';
import { registerUserWithInviteCode } from '../../../api';

interface InviteFlowArgs {
    code: string;
    /** Backend endpoint of the target cloud (carried by the deeplink). */
    backend?: string;
}

/**
 * Logs in with an invite code using the stored delegatorId (saved during guest login) and returns
 * the resulting token view. This hook only authenticates — cloud/site entry is performed by the
 * consumer from the returned token (cloudId/siteId), keeping the login and navigation steps decoupled.
 */
export const useInviteFlow = () => {
    const { delegatorId } = useSessionIdentity();

    const mutation = useMutation({
        mutationFn: async ({ code, backend }: InviteFlowArgs) => {
            if (!delegatorId) {
                throw new Error('No delegatorId for invite flow');
            }

            return registerUserWithInviteCode(code, delegatorId, backend);
        },
    });

    return {
        runInviteFlow: useCallback((args: InviteFlowArgs) => mutation.mutateAsync(args), [mutation]),
        isInviting: mutation.isPending,
    };
};
