import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { loginRelayGuestByDevice } from '../../auth/services';
import { useSessionAuth } from '../session';
import { useDynamicDeviceId } from './useDynamicDeviceId';

/**
 * Keeps the relay session always present: when relay authentication is absent, it performs a
 * background guest login by device. This recovers an "absent session" state, not an explicit logout.
 *
 * - Guest login is the default entry; social/invite promotion is handled by separate flows.
 * - Requires a resolved deviceId (device registration must run first).
 */
export const useRelaySessionKeepAlive = (enabled: boolean): void => {
    const { isAuthenticated } = useSessionAuth();
    const { deviceId } = useDynamicDeviceId();
    const runningRef = useRef(false);

    useEffect(() => {
        if (!enabled || isAuthenticated || !deviceId || runningRef.current) {
            return;
        }

        runningRef.current = true;
        logger.debug('AUTH', '[keepAlive] relay session absent, running background guest login');
        loginRelayGuestByDevice(deviceId)
            .catch(error => logger.error('AUTH', '[keepAlive] guest login failed', { error }))
            .finally(() => {
                runningRef.current = false;
            });
    }, [enabled, isAuthenticated, deviceId]);
};
