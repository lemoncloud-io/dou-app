import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { switchSiteViaSocket } from '@chatic/app-runtime';
import { SWITCH_SITE_MUTATION_KEY } from '@chatic/web-core';

/**
 * Switches the active site via the socket (SDK `auth.switch`, owned by app-runtime's
 * `switchSiteViaSocket`). Thin react-query wrapper: exposes `isSwitching` and registers under the
 * shared `SWITCH_SITE_MUTATION_KEY` so the global in-flight observer (useBackgroundSync) can pause
 * periodic sync during a switch. Optimistic sid pre-apply + rollback live in `switchSiteViaSocket`.
 */
export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_SITE_MUTATION_KEY,
        mutationFn: (siteId: string) => switchSiteViaSocket(siteId),
    });

    return {
        switchSite: useCallback((siteId: string) => mutation.mutateAsync(siteId), [mutation]),
        isSwitching: mutation.isPending,
    };
};
