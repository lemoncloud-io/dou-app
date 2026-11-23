import { useCallback, useEffect } from 'react';

import { logger } from '@chatic/bridges';
import type { AppMessageData } from '@chatic/bridge-messages';

import { channelIdOfRoomPath, roomOpenTrace } from '../../runtime/perf';
import { pendingNavigationStore } from './pendingNavigationStore';
import { resolvePushNavigation } from './resolvePushNavigation';
import { usePushNavigate } from './usePushNavigate';

export const useHandlePushNavigation = (): void => {
    const navigateToPush = usePushNavigate();

    const handleNavigate = useCallback(
        async (message: AppMessageData<'OnNavigate'>) => {
            const { path, replace, perfTrace } = message.data;
            logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, { replace });
            const roomChannelId = channelIdOfRoomPath(resolvePushNavigation(path).target);
            if (roomChannelId) {
                roomOpenTrace.begin(roomChannelId, perfTrace?.entry ?? 'navigate', perfTrace);
                roomOpenTrace.mark(roomChannelId, 'handler');
            }
            await navigateToPush(path);
        },
        [navigateToPush]
    );

    useEffect(() => pendingNavigationStore.register(handleNavigate), [handleNavigate]);
};
