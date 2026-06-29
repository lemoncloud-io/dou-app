import { useCallback } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Clears every local repository cache. Used on logout so the next (auto guest) session starts from
 * a clean slate. Relay/cloud session teardown is handled separately by `useSessionLogout`.
 */
export const useClearCache = () => {
    const repos = useRuntimeRepositories();

    const clearAllCache = useCallback(async (): Promise<void> => {
        await Promise.all([
            repos.channel.cacheClear(),
            repos.chat.cacheClear(),
            repos.cloud.cacheClear(),
            repos.join.cacheClear(),
            repos.profile.cacheClear(),
            repos.place.cacheClear(),
            repos.user.cacheClear(),
        ]);
    }, [repos]);

    return { clearAllCache };
};
