import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { Coalescer } from '../../../utils/coalescer';
import { relaySession } from '../../auth/relaySession';
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
    // One background login at a time — the effect can re-run before the previous attempt settles
    // (ADR-0076 결정 4; this was a bespoke `runningRef`). A failed attempt frees the slot, so the
    // next trigger retries.
    const login = useRef<Coalescer<void>>(new Coalescer<void>()).current;

    useEffect(() => {
        if (!enabled || isAuthenticated || !deviceId) {
            return;
        }

        logger.debug('AUTH', '[keepAlive] relay session absent, running background guest login');
        void login.run(() =>
            relaySession
                .loginGuestByDevice(deviceId)
                .then(() => undefined)
                .catch(error => logger.error('AUTH', '[keepAlive] guest login failed', { error }))
        );
    }, [enabled, isAuthenticated, deviceId, login]);
};
