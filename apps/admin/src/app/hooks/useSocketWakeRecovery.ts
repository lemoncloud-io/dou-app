import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';

const KICK_THROTTLE_MS = 5_000;

export const useSocketWakeRecovery = (enabled: boolean): void => {
    const lastKickRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;

        const kick = (): void => {
            if (document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastKickRef.current < KICK_THROTTLE_MS) return;
            lastKickRef.current = now;
            void runtime.connection.recoverUnverifiedSockets();
        };

        window.addEventListener('focus', kick);
        window.addEventListener('online', kick);
        document.addEventListener('visibilitychange', kick);
        return () => {
            window.removeEventListener('focus', kick);
            window.removeEventListener('online', kick);
            document.removeEventListener('visibilitychange', kick);
        };
    }, [enabled]);
};
