import { useCallback, useEffect } from 'react';

import { logger } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/app-messages';

import { pendingNavigationStore } from './pendingNavigationStore';
import { usePushNavigate } from './usePushNavigate';

/**
 * Centralizes active navigation driven by the native `OnNavigate` bridge event
 * (push-notification taps and deep links).
 *
 * The heavy lifting (cloud/site switch ordering, handshake gating, history
 * normalization) lives in `usePushNavigate`, shared with in-app notification clicks
 * so both entry points behave identically.
 *
 * Subscribes through `pendingNavigationStore` rather than the bridge directly: this
 * hook only mounts once the session is initialized and the router tree exists, but on
 * cold start the native side flushes the buffered push tap much earlier. The store
 * captures that early event and replays it here on registration.
 *
 * Must be used within the router tree (relies on `useNavigate`).
 */
export const useHandlePushNavigation = (): void => {
    const navigateToPush = usePushNavigate();

    const handleNavigate = useCallback(
        async (message: AppMessageData<'OnNavigate'>) => {
            const { path, replace } = message.data;
            // `replace` is still logged for diagnostics but no longer drives the route change:
            // history normalization (rebase-to-home) supersedes the native flag either way.
            logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
            await navigateToPush(path);
        },
        [navigateToPush]
    );

    useEffect(() => pendingNavigationStore.register(handleNavigate), [handleNavigate]);
};
