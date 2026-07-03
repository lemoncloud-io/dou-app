import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useSessionSelection, useSiteSwitch, useSwitchCloudSession } from '@chatic/web-core';
import type { AppMessageData } from '@chatic/app-messages';

import { useOnNavigate } from '../useHandleAppMessage';
import { resolvePushNavigation } from './resolvePushNavigation';

/**
 * Centralizes active navigation driven by the native `OnNavigate` bridge event
 * (push-notification taps and deep links).
 *
 * Push notifications can deep-link into a channel room that lives in a different cloud/site
 * than the one currently active. Channel data is loaded from the *active* server's repository,
 * so the target cloud/site must be switched *before* navigating — otherwise the room page
 * cannot find the channel and bounces back home. The cloud switch clears the selected site,
 * so the site switch is ordered after it, and both are awaited before the route change.
 *
 * Must be used within the router tree (relies on `useNavigate`).
 */
export const useHandlePushNavigation = (): void => {
    const navigate = useNavigate();
    const { selectedCloudId, selectedSiteId } = useSessionSelection();
    const { switchCloud } = useSwitchCloudSession();
    const { switchSite } = useSiteSwitch();

    const handleNavigate = useCallback(
        async (message: AppMessageData<'OnNavigate'>) => {
            const { path, replace } = message.data;
            const { target, cid, sid } = resolvePushNavigation(path);
            logger.info('ROUTER', `Received OnNavigate event from native: ${path}`, {
                target,
                cid,
                sid,
                replace,
            });

            try {
                // Cloud first (it clears the selected site), then site, then route.
                if (cid && cid !== selectedCloudId) await switchCloud(cid);
                if (sid && sid !== selectedSiteId) await switchSite(sid);
                navigate(target, { replace: !!replace });
            } catch (error) {
                logger.error('ROUTER', `Failed to navigate to: ${target}`, { error });
                // Best-effort: attempt the route anyway so a switch failure doesn't strand the user.
                navigate(target, { replace: !!replace });
            }
        },
        [navigate, selectedCloudId, selectedSiteId, switchCloud, switchSite]
    );

    useOnNavigate(handleNavigate);
};
