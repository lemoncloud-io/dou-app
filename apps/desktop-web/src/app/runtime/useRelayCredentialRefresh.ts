import { useEffect } from 'react';

import { runtime } from '@chatic/runtime-react';

export const useRelayCredentialRefresh = (): void => {
    const { check } = runtime.session.useSessionStalenessGuard({
        intervalMs: null,
        checkOnRelayVerified: true,
        checkOnVisible: false,
        forceRefresh: true,
    });

    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    useEffect(() => {
        const onVisibilityChange = (): void => {
            if (document.visibilityState !== 'visible' || !isRelayVerified) return;
            void check();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [check, isRelayVerified]);
};
