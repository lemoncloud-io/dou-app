import { useEffect } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { getActiveSessionUser, useSessionIdentity } from '@chatic/web-core';

/**
 * Seeds the user cache from the session profile so `useMyUser`'s `observeItem(uid)` has a row to
 * emit on subscribe — closing the flash window before `getMyProfile` resolves.
 *
 * The session profile (`cloudProfile ?? relayProfile`) is token-derived state; its `$user`
 * (name/photo) is written into the user repo cache, which is the single source every profile reader
 * observes. Seeds ONLY when the cache has no row yet, so it never clobbers an observed/edited value;
 * `getMyProfile` (triggered by useMyUser) refreshes it from the socket afterward.
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
