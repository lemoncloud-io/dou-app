import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startPerfTrace } from '@chatic/perf';
import type { InviteLogin } from '@chatic/runtime-client';

import { sessionCommands } from '@chatic/runtime-client';
import { SWITCH_CLOUD_MUTATION_KEY } from '../../mutationKeys';

interface SwitchCloudArgs {
    cloudId: string;
    inviteLogin?: InviteLogin;
}

export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: ({ cloudId, inviteLogin }: SwitchCloudArgs) =>
            sessionCommands().switchCloud(cloudId, inviteLogin ? { inviteLogin } : undefined),
    });

    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            async (cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void> => {
                const trace = startPerfTrace('cloud_switch');
                try {
                    await mutateAsync({ cloudId, inviteLogin: options?.inviteLogin });
                    trace.putAttribute('outcome', 'ok');
                    trace.stop();
                } catch (error) {
                    trace.putAttribute('outcome', 'error');
                    trace.stop();
                    throw error;
                }
            },
            [mutateAsync]
        ),
        isPending: mutation.isPending,
    };
};
