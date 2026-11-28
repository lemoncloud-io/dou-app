import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { InviteLogin } from '@chatic/runtime-client';

import { switchCloudSessionMutation, traceCloudSwitch } from '@chatic/runtime/api/session';

export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: switchCloudSessionMutation.mutationKey,
        mutationFn: switchCloudSessionMutation.mutationFn,
    });

    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            (cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void> =>
                traceCloudSwitch(() => mutateAsync({ cloudId, inviteLogin: options?.inviteLogin })),
            [mutateAsync]
        ),
        isPending: mutation.isPending,
    };
};
