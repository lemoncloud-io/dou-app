import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import { tabStore } from '../../storage';

const WEDGE_GRACE_MS = 25_000;
const RELOAD_GUARD_MS = 5 * 60_000;
const RELOAD_AT_KEY = 'chatic:wedge-reload-at';

const readReloadAt = (): number => Number(tabStore.get(RELOAD_AT_KEY)) || 0;

export const useSocketWedgeReload = (): void => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const hasVerifiedRef = useRef(false);

    useEffect(() => {
        if (!runtime.appShell.ownsWindow) return;

        if (isVerified) {
            hasVerifiedRef.current = true;
            tabStore.remove(RELOAD_AT_KEY);
            return;
        }

        if (!hasVerifiedRef.current || !isAuthenticated) return;

        const timer = setTimeout(() => {
            if (runtime.connection.getRuntimeSocketState().isVerified) return;

            const lastReloadAt = readReloadAt();
            if (lastReloadAt && Date.now() - lastReloadAt < RELOAD_GUARD_MS) return;

            logger.warn('AUTH', '[wedge-reload] socket unverified past grace after wake — reloading');
            tabStore.set(RELOAD_AT_KEY, String(Date.now()));
            window.location.reload();
        }, WEDGE_GRACE_MS);

        return () => clearTimeout(timer);
    }, [isAuthenticated, isVerified]);
};
