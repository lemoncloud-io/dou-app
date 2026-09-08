import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { Coalescer } from '../../../utils/coalescer';
import { Throttle } from '../../../utils/throttle';
import { relaySession } from '../../auth/relaySession';
import { useSessionAuth } from '../session';
import { useDynamicDeviceId } from './useDynamicDeviceId';

/**
 * Floor between two EDGE-driven retries. The edges are cheap to fire repeatedly — a user bouncing
 * between apps produces a visibility edge every time — and each attempt is a real login POST, so
 * this is a storm guard. It never delays the first attempt: the boot login runs off the effect's own
 * dependencies, not off an edge, and `Throttle` grants its first acquire anyway.
 */
const RETRY_FLOOR_MS = 5_000;

const isBrowserOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

/**
 * Keeps the relay session always present: when relay authentication is absent, it performs a
 * background guest login by device. This recovers an "absent session" state, not an explicit logout.
 *
 * - Guest login is the default entry; social/invite promotion is handled by separate flows.
 * - Requires a resolved deviceId (device registration must run first).
 *
 * **A failed attempt has to be retriable, and an effect alone cannot do that.** The login effect
 * re-runs only when its dependencies move, and a failure moves none of them — `isAuthenticated` is
 * still false, the deviceId is the same. So a first launch with no network used to burn its one
 * attempt and then sit sessionless until the app was restarted: coming back online re-established
 * the sockets, but nothing re-asked for the session they needed. The edges below are that missing
 * re-ask, and the offline skip keeps the attempt for a moment when it can succeed (the same reliable
 * negative both credential guards use).
 */
export const useRelaySessionKeepAlive = (enabled: boolean): void => {
    const { isAuthenticated } = useSessionAuth();
    const { deviceId } = useDynamicDeviceId();
    // One background login at a time — the effect can re-run before the previous attempt settles
    // (ADR-0076 결정 4; this was a bespoke `runningRef`). A failed attempt frees the slot, so the
    // next trigger retries.
    const login = useRef<Coalescer<void>>(new Coalescer<void>()).current;
    const retryFloor = useRef<Throttle>(new Throttle({ intervalMs: RETRY_FLOOR_MS })).current;
    const [retryTick, setRetryTick] = useState(0);

    // Re-ask on the two edges that can turn a failed attempt into a possible one: the network coming
    // back, and the app returning to the foreground (a suspended tab may have missed the `online`
    // event entirely). Only armed while there is nothing to log in for.
    useEffect(() => {
        if (!enabled || isAuthenticated || typeof window === 'undefined') {
            return;
        }

        const retry = (): void => {
            if (!isBrowserOnline() || !retryFloor.tryAcquire()) return;
            setRetryTick(tick => tick + 1);
        };
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'visible') retry();
        };

        window.addEventListener('online', retry);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.removeEventListener('online', retry);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [enabled, isAuthenticated, retryFloor]);

    useEffect(() => {
        if (!enabled || isAuthenticated || !deviceId) {
            return;
        }
        if (!isBrowserOnline()) {
            // The login would only fail; the `online` edge above brings us back.
            logger.debug('AUTH', '[keepAlive] relay session absent but offline — waiting for the link');
            return;
        }

        logger.debug('AUTH', '[keepAlive] relay session absent, running background guest login');
        void login.run(() =>
            relaySession
                .loginGuestByDevice(deviceId)
                .then(() => undefined)
                .catch(error => logger.error('AUTH', '[keepAlive] guest login failed', { error }))
        );
        // `retryTick` is the edge trigger: it carries no value, it exists so a failed attempt can be
        // re-run without any of the real inputs having changed.
    }, [enabled, isAuthenticated, deviceId, login, retryTick]);
};
