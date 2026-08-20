import { useEffect } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { getActiveSessionUser, useSessionIdentity } from '@chatic/web-core';

/**
 * Seeds the user cache from the ACTIVE session profile so cache-observing profile readers have a row
 * to emit on subscribe — closing the flash window before a `getMyProfile` fetch resolves.
 *
 * Its reader is `useRuntimeProfile` (isGuest / userRole / permissions), which observes the
 * active-scope cache by the active uid. It is NOT what feeds the MY page any more: account screens
 * read the relay token directly (`useMyUser`), because the cache is partitioned by the active cloud
 * and cannot answer "who is the relay account" while a cloud is selected.
 *
 * The active session user is token-derived state; its name/photo are written into the user repo
 * cache. Seeds ONLY when the cache has no row yet, so it never clobbers an observed/edited value.
 */
export const useSeedMyUserCache = (): void => {
    const { user } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();

    useEffect(() => {
        if (!userId) return;
        const sessionUser = getActiveSessionUser();
        if (!sessionUser) return;

        let cancelled = false;
        void (async () => {
            const existing = await user.cacheRead(userId);
            if (cancelled || existing) return; // don't clobber observed/edited data
            await user.cacheWrite({ id: userId, ...(sessionUser as object) } as Parameters<typeof user.cacheWrite>[0]);
        })();

        return () => {
            cancelled = true;
        };
    }, [user, userId]);
};
