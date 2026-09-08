import { useCallback, useEffect, useRef } from 'react';

import { useRegisterDeviceTokenMutation } from '../../data/hooks';
import { useDynamicDeviceId, useSessionAuth } from '../../session';
import { Coalescer } from '../../utils/coalescer';
import { Throttle } from '../../utils/throttle';

/**
 * Shell-provided contract for push device-token registration.
 *
 * The runtime stays shell-agnostic: how a token is resolved differs per shell
 * (mobile WebView uses a request/response bridge call, Electron replies with an
 * event), so the app injects the acquisition path — same inversion as
 * `SocketSessionDelegate` on the socket side.
 */
export interface DeviceTokenDelegate {
    /** Resolve the current push token from the native shell; null when unavailable. */
    fetchDeviceToken: () => Promise<string | null>;
    /** Shell platform identifier sent to the push broker (e.g. 'ios' | 'android' | 'desktop'). */
    platform: string;
    /**
     * @deprecated The Firebase installation id is resolved from useDynamicDeviceId
     * (the shared device-identity source). Supply only when a shell cannot inject
     * the CHATIC_APP_* globals; a provided value still wins.
     */
    installId?: string;
    /** SNS application name; defaults to 'chatic'. */
    application?: string;
}

const DEFAULT_APPLICATION = 'chatic';
const REREGISTER_THROTTLE_MS = 60_000;

/**
 * Cross-cloud push registration for native shells.
 *
 * Registers the shell's push token with the home broker (`reg-dev`) once
 * authenticated, and re-registers (throttled) whenever the user returns to the
 * app. Registration is always forced — never deduped by token value — because
 * SNS disables a platform endpoint after a single failed delivery and a
 * token-equality skip would leave the device permanently dark (see the incident
 * notes in apps/desktop-web's useDeviceTokenRegistration, whose strategy this
 * generalizes).
 *
 * The token is re-fetched from the shell on every attempt instead of cached, so
 * a late permission grant or an FCM token rotation mid-session is picked up on
 * the next trigger without an app restart.
 *
 * Pass `delegate: null` outside a native shell to make the hook a no-op — the
 * "are we inside the app?" check is shell knowledge and stays with the caller.
 * Best-effort: a failure resets the throttle so the next trigger retries.
 */
export const useDeviceTokenRegistration = (delegate: DeviceTokenDelegate | null): void => {
    const { isAuthenticated } = useSessionAuth();
    const { deviceId, firebaseInstallationId } = useDynamicDeviceId();
    const { mutateAsync } = useRegisterDeviceTokenMutation();

    // Latest-value refs keep `register` stable even when callers rebuild the
    // delegate object every render.
    const delegateRef = useRef(delegate);
    delegateRef.current = delegate;
    const isAuthenticatedRef = useRef(isAuthenticated);
    isAuthenticatedRef.current = isAuthenticated;
    const deviceIdRef = useRef(deviceId);
    deviceIdRef.current = deviceId;
    const firebaseInstallationIdRef = useRef(firebaseInstallationId);
    firebaseInstallationIdRef.current = firebaseInstallationId;
    const mutateRef = useRef(mutateAsync);
    mutateRef.current = mutateAsync;

    // In-flight share + the re-register floor, as the two extracted primitives (ADR-0076 결정 4).
    // Numbers unchanged: REREGISTER_THROTTLE_MS stays the floor and the first attempt always runs.
    const attempt = useRef<Coalescer<void>>(new Coalescer<void>()).current;
    const floor = useRef<Throttle>(new Throttle({ intervalMs: REREGISTER_THROTTLE_MS })).current;

    const register = useCallback(() => {
        const currentDelegate = delegateRef.current;
        if (!currentDelegate || !isAuthenticatedRef.current) return;
        // The floor is consumed only when we are actually going to try — `tryAcquire` arms as it grants.
        if (!floor.tryAcquire()) return;

        void attempt.run(() =>
            currentDelegate
                .fetchDeviceToken()
                .then(deviceToken => {
                    // An empty token (permission denied, FCM not ready) is a failure:
                    // fall through to the catch so the next trigger retries immediately.
                    if (!deviceToken) throw new Error('empty device token');
                    return mutateRef.current({
                        // useDynamicDeviceId is the single device-identity source shared
                        // with the socket side — registration must never derive its own.
                        deviceId: deviceIdRef.current ?? undefined,
                        deviceToken,
                        platform: currentDelegate.platform,
                        installId: currentDelegate.installId ?? firebaseInstallationIdRef.current,
                        application: currentDelegate.application ?? DEFAULT_APPLICATION,
                        force: true,
                    });
                })
                .then(() => undefined)
                .catch(() => {
                    floor.reset(); // allow an immediate retry
                })
        );
    }, [attempt, floor]);

    // Launch / login path. A fresh login (including an account switch shortly
    // after logout) must register right away, so drop any leftover throttle
    // window from the previous session before attempting.
    const hasDelegate = !!delegate;
    useEffect(() => {
        if (!isAuthenticated || !hasDelegate) return;
        floor.reset();
        register();
    }, [isAuthenticated, hasDelegate, register, floor]);

    // Return-to-app path: re-register (throttled) so an endpoint disabled
    // mid-session comes back without a restart.
    useEffect(() => {
        if (!hasDelegate) return;
        const onFocus = () => {
            if (document.visibilityState === 'visible') register();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [hasDelegate, register]);
};
