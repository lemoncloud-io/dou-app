import { useEffect } from 'react';

import { runtime } from '@chatic/runtime';

export const useSeedMyUserCache = (): void => {
    const { user } = runtime.data.useRuntimeRepositories();
    const { userId } = runtime.session.useSessionIdentity();

    useEffect(() => {
        if (!userId) return;
        const sessionUser = runtime.session.getActiveSessionUser();
        if (!sessionUser) return;

        let cancelled = false;
        void (async () => {
            const existing = await user.cacheRead(userId);
            if (cancelled || existing) return;
            await user.cacheWrite({ id: userId, ...(sessionUser as object) } as Parameters<typeof user.cacheWrite>[0]);
        })();

        return () => {
            cancelled = true;
        };
    }, [user, userId]);
};
