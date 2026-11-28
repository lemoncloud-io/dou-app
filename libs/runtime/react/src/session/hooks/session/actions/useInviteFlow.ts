import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSessionIdentity } from '../readers/useSessionIdentity';
import { inviteFlowMutation } from '@chatic/runtime/api/session';

interface InviteFlowArgs {
    code: string;
    backend?: string;
}

export const useInviteFlow = () => {
    const { delegatorId } = useSessionIdentity();

    const mutation = useMutation({ mutationFn: inviteFlowMutation(delegatorId).mutationFn });

    return {
        runInviteFlow: useCallback((args: InviteFlowArgs) => mutation.mutateAsync(args), [mutation]),
        isInviting: mutation.isPending,
    };
};
