import { useTranslation } from 'react-i18next';
import { useIsMutating } from '@tanstack/react-query';

import { cn } from '@chatic/lib/utils';
import { useSocketState } from '@chatic/app-runtime';
import { SWITCH_CLOUD_MUTATION_KEY, SWITCH_SITE_MUTATION_KEY } from '@chatic/web-core';

/**
 * App-shell connection status bar. The runtime socket state exposes the raw
 * transport state + verification flag — surface them everywhere so a
 * dropped/reconnecting socket is visible regardless of route or open channel.
 * Hidden while healthy (connected + verified).
 */
export const ConnectionBanner = () => {
    const { t } = useTranslation();
    const { state, isConnected, isVerified } = useSocketState();
    // A cloud/place switch intentionally tears the socket down and re-verifies; surfacing
    // "Reconnecting…" during a deliberate switch reads as a failure, so stay quiet while one
    // is in flight (detected via the switch mutations, the same signal useBackgroundSync uses).
    const isSwitching =
        useIsMutating({ mutationKey: SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: SWITCH_CLOUD_MUTATION_KEY }) >
        0;

    // ClientSocketState: 'idle' | 'connecting' | 'connected' | 'closing' | 'closed'.
    // A closed transport is offline; 'idle' is the pre-connect boot state, so it stays
    // quiet. Reconnecting covers (re)dialing and the connected-but-unverified handshake.
    const offline = state === 'closed';
    const reconnecting = state === 'connecting' || state === 'closing' || (isConnected && !isVerified);
    if (isSwitching || (!offline && !reconnecting)) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                'fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-3 py-1 text-caption font-medium',
                offline ? 'bg-destructive text-destructive-foreground' : 'bg-warning/15 text-warning-foreground'
            )}
        >
            {!offline && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />}
            {offline ? t('connection.offline') : t('connection.reconnecting')}
        </div>
    );
};
