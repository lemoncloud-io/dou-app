import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startPerfTrace } from '@chatic/perf';
import type { InviteLogin } from '@chatic/auth';

import { sessionCommands } from '../../../sessionCommands';
import { SWITCH_CLOUD_MUTATION_KEY } from '../../mutationKeys';

interface SwitchCloudArgs {
    cloudId: string;
    /** The invite login this entry follows; the runtime enters with its answer instead of re-issuing. */
    inviteLogin?: InviteLogin;
}

/**
 * Switches the active cloud through the engine's `switchCloud` command, under the shared
 * `SWITCH_CLOUD_MUTATION_KEY` so the in-flight observers can pause their work during a switch.
 *
 * The `cloud_switch` trace is taken here rather than inside the command. The switch has a second
 * caller — cloud-refresh recovery re-exchanges a token through it after re-minting the relay session —
 * and that path is rare and slow, so measuring there would let recovery masquerade as a user-initiated
 * switch and drag the tail. Every caller of this hook is a real selection: the cloud sheet, search
 * navigation, an invite entry, a push deep link, a pairing's cloud approval.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: ({ cloudId, inviteLogin }: SwitchCloudArgs) =>
            sessionCommands().switchCloud(cloudId, inviteLogin ? { inviteLogin } : undefined),
    });

    // Keyed on the stable `mutateAsync` (react-query memoizes it) rather than the mutation object,
    // which is a fresh reference every render — otherwise this callback's identity churns and
    // downstream effect deps re-run on every render. Same fix `useSiteSwitch` already carries.
    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            async (cloudId: string, options?: { inviteLogin?: InviteLogin }): Promise<void> => {
                const trace = startPerfTrace('cloud_switch');
                try {
                    // Resolves with nothing: what the switch committed is the session's, and the session
                    // readers show it.
                    await mutateAsync({ cloudId, inviteLogin: options?.inviteLogin });
                    trace.putAttribute('outcome', 'ok');
                    trace.stop();
                } catch (error) {
                    // Recorded rather than skipped: a switch slow enough to fail belongs in the
                    // distribution, and dropping failures biases it optimistic.
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
