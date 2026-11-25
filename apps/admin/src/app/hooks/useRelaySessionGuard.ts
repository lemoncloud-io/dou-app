import { runtime } from '@chatic/runtime-react';

const CHECK_INTERVAL_MS = 30_000;

export const useRelaySessionGuard = (enabled: boolean): void => {
    runtime.session.useSessionStalenessGuard({
        enabled,
        intervalMs: CHECK_INTERVAL_MS,
        checkOnVisible: true,
        checkOnRelayVerified: true,
    });
};
