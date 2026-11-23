import { useCallback } from 'react';

import { runtime } from '@chatic/runtime';

export const useClearCache = () => {
    const repos = runtime.data.useRuntimeRepositories();

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
