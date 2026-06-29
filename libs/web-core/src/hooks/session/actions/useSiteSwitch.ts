import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { switchSiteSession } from '../../../session';

/**
 * Stable key for the site-switch mutation. Exported so a global observer (e.g. the
 * background sync runner) can detect an in-flight switch via `useIsMutating` — the
 * mutation's own `isSwitching` is per-hook-instance and not visible across components.
 */
export const SWITCH_SITE_MUTATION_KEY = ['session', 'switch-site'] as const;

/**
 * Switches the active site. Optimistically pre-applies the target sid (cached channel
 * streams swap immediately), commits via the cloud session refresh, and rolls the sid
 * back to the previous site if the refresh fails.
 */
export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_SITE_MUTATION_KEY,
        mutationFn: (siteId: string) => switchSiteSession(siteId),
    });

    return {
        switchSite: useCallback((siteId: string) => mutation.mutateAsync(siteId), [mutation]),
        isSwitching: mutation.isPending,
    };
};
