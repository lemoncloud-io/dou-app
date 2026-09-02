import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { SWITCH_SITE_MUTATION_KEY } from '../../mutationKeys';

import { switchSite } from '../../../../socket/auth';

/**
 * Switches the active site via the socket (SDK `auth.switch`, owned by app-runtime's
 * `switchSite`). Thin react-query wrapper: exposes `isSwitching` and registers under the
 * shared `SWITCH_SITE_MUTATION_KEY` so the global in-flight observer (useBackgroundSync) can pause
 * periodic sync during a switch. Optimistic sid pre-apply + rollback live in `switchSite`.
 */
export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_SITE_MUTATION_KEY,
        mutationFn: (siteId: string) => switchSite(siteId),
    });

    // Key the memo on the stable mutateAsync (react-query memoizes it) rather than the whole mutation
    // object, which is a fresh reference every render — otherwise the callback identity churns and
    // downstream effect deps (e.g. useSwitchPlace) re-run on every render.
    const { mutateAsync } = mutation;

    return {
        switchSite: useCallback((siteId: string) => mutateAsync(siteId), [mutateAsync]),
        isSwitching: mutation.isPending,
    };
};
