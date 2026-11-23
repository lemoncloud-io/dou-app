import { runtime } from '@chatic/runtime';

import { useAppForeground } from '../bridge';

export const useRelayCredentialRefresh = (): void => {
    const { check } = runtime.session.useSessionStalenessGuard({
        intervalMs: null,
        checkOnRelayVerified: true,
        forceRefresh: true,
    });

    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    useAppForeground(() => {
        if (!isRelayVerified) return;
        void check();
    });
};
