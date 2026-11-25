import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime-react';

const RECOVER_THROTTLE_MS = 5_000;

export const useSocketWakeRecovery = (): void => {
    const lastKickRef = useRef(0);

    useEffect(() => {
        if (!runtime.appShell.ownsWindow) return;

        const kick = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            if (runtime.connection.getRuntimeSocketState().isVerified) return;

            const now = Date.now();
            if (now - lastKickRef.current < RECOVER_THROTTLE_MS) return;
            lastKickRef.current = now;
            void runtime.connection.reconnectSocket().catch(() => undefined);
        };

        window.addEventListener('focus', kick);
        window.addEventListener('online', kick);
        document.addEventListener('visibilitychange', kick);
        return () => {
            window.removeEventListener('focus', kick);
            window.removeEventListener('online', kick);
            document.removeEventListener('visibilitychange', kick);
        };
    }, []);
};
