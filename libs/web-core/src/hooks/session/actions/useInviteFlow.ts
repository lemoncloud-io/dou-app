import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { loginWithInviteCode, switchCloudSession } from '../../../session';
import { useSessionIdentity } from '../readers/useSessionIdentity';

interface InviteFlowArgs {
    code: string;
    /** Backend endpoint of the target cloud (carried by the deeplink). */
    backend?: string;
    /** Cloud to enter after login. When provided, the invite cloud entry is performed in one step. */
    cloudId?: string;
}

/**
 * Drives the full invite scenario as one hook: logs in with the invite code using the stored
 * delegatorId, then continues into cloud entry via the standard cloud-switch flow. This avoids
 * forcing consumers to chain multiple hooks manually.
 *
 * - delegatorId is read from identity (saved during guest login).
 * - Cloud entry uses `switchCloudSession` (delegate-cloud → exchange-token), which carries the
 *   optimistic pre-apply + rollback behavior.
 * - Socket auth and data reload happen outside web-core (app-runtime reacts to the cid/sid change).
 */
export const useInviteFlow = () => {
    const { delegatorId } = useSessionIdentity();

    const mutation = useMutation({
        mutationFn: async ({ code, backend, cloudId }: InviteFlowArgs) => {
            if (!delegatorId) {
                throw new Error('No delegatorId for invite flow');
            }

            await loginWithInviteCode({ code, delegatorId, backend });

            if (!cloudId) {
                return null;
            }

            return switchCloudSession({ cloudId });
        },
    });

    return {
        runInviteFlow: useCallback((args: InviteFlowArgs) => mutation.mutateAsync(args), [mutation]),
        isInviting: mutation.isPending,
    };
};
