import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startPerfTrace } from '@chatic/perf';

import { SDK_REFRESH_CYCLE_MS } from '../../../../socket/constants';
import { credentialRenewers } from '../../../../socket/auth/renewers';
import { getSocketManager } from '../../../../socket/runtime';
import { slotKeyOf } from '../../../../socket/utils/slotKey';
import { cloudSession } from '../../../auth/cloudSession';
import { SWITCH_CLOUD_MUTATION_KEY } from '../../mutationKeys';

/**
 * A switch onto a live background slot commits that slot's tokens as they are, without re-issuing —
 * including ones that ran low while nothing was looking (a laptop asleep, say). The credential guard
 * would renew them on its next tick, which can be minutes away; the user just walked into this
 * cloud, so renew now. Renewal re-issues and re-registers the socket in one step.
 */
const renewIfLapsing = (cloudId: string): void => {
    const renewer = credentialRenewers.forSlot(slotKeyOf(cloudId));
    const left = renewer.timeToExpiry();
    if (left != null && left <= SDK_REFRESH_CYCLE_MS) void renewer.renew();
};

/**
 * Switches the active cloud session through session services.
 *
 * The `cloud_switch` trace is taken here rather than inside `CloudSession.switchTo`. The service function has a second caller — cloud-refresh recovery re-exchanges a
 * token through it after re-minting the relay session — and that path is rare and slow, so
 * measuring the service would let recovery masquerade as a user-initiated switch and drag the
 * tail. Every caller of this hook is a real selection: the cloud sheet, search navigation, an
 * invite entry, a push deep link.
 */
export const useSwitchCloudSession = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_CLOUD_MUTATION_KEY,
        mutationFn: async (cloudId: string) => {
            // Asked at the moment of the switch: a background slot for the target may have bound or
            // gone since render, and whether one is up decides which tokens the switch may commit.
            const hasLiveSlot = getSocketManager()
                .getSlotKeys()
                .some(key => key === cloudId);
            const snapshot = await cloudSession.switchTo(cloudId, { hasLiveSlot });
            if (hasLiveSlot) renewIfLapsing(cloudId);
            return snapshot;
        },
    });

    // Keyed on the stable `mutateAsync` (react-query memoizes it) rather than the mutation object,
    // which is a fresh reference every render — otherwise this callback's identity churns and
    // downstream effect deps re-run on every render. Same fix `useSiteSwitch` already carries.
    const { mutateAsync } = mutation;

    return {
        switchCloud: useCallback(
            async (cloudId: string) => {
                const trace = startPerfTrace('cloud_switch');
                try {
                    const snapshot = await mutateAsync(cloudId);
                    trace.putAttribute('outcome', 'ok');
                    trace.stop();
                    return snapshot;
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
