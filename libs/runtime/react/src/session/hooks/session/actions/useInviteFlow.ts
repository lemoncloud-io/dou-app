import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSessionIdentity } from '../readers/useSessionIdentity';
import { registerUserWithInviteCode } from '@chatic/runtime-client';

interface InviteFlowArgs {
    code: string;
    backend?: string;
}

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
