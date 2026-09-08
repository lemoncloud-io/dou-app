import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { perfNow, reportPerfMetric } from '@chatic/bridges';

import { cloudSession } from '../../../auth/cloudSession';
import { SWITCH_CLOUD_MUTATION_KEY } from '../../mutationKeys';

/**
 * Switches the active cloud session through session services.
 *
 * The `cloud-switch` budget is measured here rather than inside `CloudSession.switchTo`
 * (ADR-0071). The service function has a second caller — cloud-refresh recovery re-exchanges a
 * token through it after re-minting the relay session — and that path is rare and slow, so
 * measuring the service would let recovery masquerade as a user-initiated switch and drag the
 * tail. Every caller of this hook is a real selection: the cloud sheet, search navigation, an
 * invite entry, a push deep link.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: (cloudId: string) => cloudSession.switchTo(cloudId),
    });

    // Keyed on the stable `mutateAsync` (react-query memoizes it) rather than the mutation object,
    // which is a fresh reference every render — otherwise this callback's identity churns and
    // downstream effect deps re-run on every render. Same fix `useSiteSwitch` already carries.
    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            async (cloudId: string) => {
                const startedAt = perfNow();
                try {
                    const snapshot = await mutateAsync(cloudId);
                    reportPerfMetric('cloud-switch', perfNow() - startedAt, { ok: true });
                    return snapshot;
                } catch (error) {
                    // Reported rather than skipped: a switch slow enough to fail belongs in the
                    // distribution, and dropping failures biases it optimistic.
                    reportPerfMetric('cloud-switch', perfNow() - startedAt, { ok: false });
                    throw error;
                }
            },
            [mutateAsync]
        ),
        isPending: mutation.isPending,
    };
};
