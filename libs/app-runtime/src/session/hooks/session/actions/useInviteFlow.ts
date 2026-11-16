import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSessionIdentity } from '../readers/useSessionIdentity';
import { registerUserWithInviteCode } from '../../../sessionCommands';

interface InviteFlowArgs {
    code: string;
    /** Backend endpoint of the target cloud (carried by the deeplink). */
    backend?: string;
}

/**
 * Logs in with an invite code using the stored delegatorId (saved during guest login). The answer is
 * the invitee's own cloud token, which the runtime keeps: this answers with an `InviteLogin` — a handle
 * and the cloud the answer names. This hook only authenticates — the consumer enters the cloud with
 * `switchCloud(cloudId, { inviteLogin })`, or forgets the handle when it will not
 * (`runtime.session.forgetInviteLogin`), keeping the login and navigation steps decoupled.
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
