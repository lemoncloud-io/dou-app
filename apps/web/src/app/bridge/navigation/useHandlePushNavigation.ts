import { useCallback, useEffect } from 'react';

import { logger } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/app-messages';

import { channelIdOfRoomPath, roomOpenTrace } from '../../runtime/perf';
import { pendingNavigationStore } from './pendingNavigationStore';
import { resolvePushNavigation } from './resolvePushNavigation';
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
            const { path, replace, perfTrace } = message.data;
            // `replace` is still logged for diagnostics but no longer drives the route change:
            // history normalization (rebase-to-home) supersedes the native flag either way.
            logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
            // A navigation into a room carries on the trace the native tap started, so it includes
            // the cold boot and handshake this handler waited behind; `handler` marks where that
            // wait ended. An older app build sends no trace, and the web starts its own here.
            const roomChannelId = channelIdOfRoomPath(resolvePushNavigation(path).target);
            if (roomChannelId) {
                roomOpenTrace.begin(roomChannelId, perfTrace?.entry ?? 'navigate', perfTrace).mark('handler');
            }
            await navigateToPush(path);
        },
        [navigateToPush]
    );

    useEffect(() => pendingNavigationStore.register(handleNavigate), [handleNavigate]);
};
