import { useCallback, useEffect, useRef } from 'react';

import { useRegisterDeviceTokenMutation } from '../../data/hooks';
import { getRelaySessionUser, useDynamicDeviceId, useSessionAuth } from '../../session';
import { Coalescer } from '../../utils/coalescer';
import { Throttle } from '../../utils/throttle';
import { PushRegistrationRecord, type NativeRecordMirror, type RegistrationIdentity } from '../registrationRecord';

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
    /**
     * Deployment stage. Omitting it lets the broker fall back to ITS OWN default ('dev'), which
     * registers a production build into the dev SNS application — the token's Firebase project then
     * mismatches the SNS credential, FCM rejects delivery with SENDER_ID_MISMATCH, and SNS disables
     * the endpoint (docs/specs/cross-cloud-push.md §3-1). Supply it on any shell whose build stage
     * is not the broker's default.
     */
    stage?: string;
    /**
     * Optional signal that the shell minted a new push token, returning an unsubscribe.
     *
     * Only shells that can volunteer a token supply this. Without it a rotated token is picked up on
     * the next launch, which is fine for mobile but not for a desktop app that stays open for days —
     * under the once-per-install policy a rotation is one of the few things that re-registers at all.
     *
     * Unlike the other fields this one is read ONCE, on mount: re-subscribing whenever the delegate
     * object is rebuilt would tear down and reinstall the shell listener on every render. Callers who
     * rebuild the delegate each render (which the rest of this contract allows) must therefore keep
     * this function itself stable — a later replacement is not picked up.
     */
    subscribeTokenChange?: (onChange: () => void) => () => void;
    /**
     * Optional durable home for the registration record, for shells whose native storage outlives
     * the webview's. Without it the record lives only in web storage, and a cache clear costs one
     * extra registration.
     */
    nativeRecordMirror?: NativeRecordMirror;
}

/** Why `register` was called. Only the high-frequency trigger consults the record before the bridge. */
type RegisterReason = 'auth' | 'focus' | 'token-change';

const DEFAULT_APPLICATION = 'chatic';
const BURST_FLOOR_MS = 60_000;

/**
 * Cross-cloud push registration for native shells.
 *
 * Registers the shell's push token with the home broker (`reg-dev`) **once per install** (ADR-0077):
 * a successful registration is recorded in `PushRegistrationRecord`, and while that record matches
 * the current account, device and token, no further call is made. The record holds the token rather
 * than a flag, so a rotated token, an account switch or a policy-version bump still re-registers —
 * the skip means "nothing changed", never "we already did this once".
 *
 * This deliberately gives up the endpoint self-healing the previous always-force strategy provided.
 * SNS disables a platform endpoint after a single failed delivery and `CreatePlatformEndpoint` does
 * not revive it, so a device whose endpoint dies now stays dark until one of the recovery paths in
 * `docs/specs/push-device-registration.md` (S8) fires. That trade was made to cut `reg-dev` call
 * volume, which the always-force strategy had driven to several calls per device per day.
 *
 * When a call does go out it is still forced: the broker skips endpoint creation entirely for a
 * registration seen within the hour unless `force` is set (docs/specs/cross-cloud-push.md §3-3).
 *
 * The token is re-fetched from the shell on every attempt instead of cached, so a late permission
 * grant or an FCM token rotation is picked up without an app restart.
 *
 * Pass `delegate: null` outside a native shell to make the hook a no-op — the
 * "are we inside the app?" check is shell knowledge and stays with the caller.
 * Best-effort: a failure records nothing, so the next trigger retries.
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

    // In-flight share + a burst floor, as the two extracted primitives (ADR-0076 결정 4).
    // The floor is no longer the re-register interval — the record is (ADR-0077). What is left for it
    // is absorbing one physical foreground transition arriving twice (`focus` AND `visibilitychange`)
    // and keeping a failing first registration from retrying on every such event.
    const attempt = useRef<Coalescer<void>>(new Coalescer<void>()).current;
    const floor = useRef<Throttle>(new Throttle({ intervalMs: BURST_FLOOR_MS })).current;
    const record = useRef<PushRegistrationRecord>(new PushRegistrationRecord()).current;

    // The account this token registers under. Read from the RELAY session, not `useSessionIdentity`:
    // that one reports the ACTIVE slot's uid, which becomes the cloud delegation token's once the
    // user enters a cloud — keying on it would re-register on every cloud switch.
    const resolveIdentity = useCallback((platform: string): RegistrationIdentity | null => {
        const user = getRelaySessionUser() as { id?: string; uid?: string } | null;
        const uid = user?.id ?? user?.uid;
        const currentDeviceId = deviceIdRef.current;
        if (!uid || !currentDeviceId) return null;
        return { uid, deviceId: currentDeviceId, platform };
    }, []);

    const register = useCallback(
        (reason: RegisterReason) => {
            const currentDelegate = delegateRef.current;
            if (!currentDelegate || !isAuthenticatedRef.current) return;

            // Without an identity there is no key, so the record can neither be read nor written. Fall
            // back to the pre-ADR-0077 behaviour (register every time) rather than skip: an extra call
            // is recoverable, a device that never registers is silently dark.
            const identity = resolveIdentity(currentDelegate.platform);

            // Foreground return is the high-frequency trigger. When the record already covers this
            // identity, stop before the bridge round-trip — a token fetch per app switch is the cost
            // this saves. The other reasons fall through and compare the actual token below.
            if (reason === 'focus' && identity && record.read(identity)) return;

            // The floor is consumed only when we are actually going to try — `tryAcquire` arms as it grants.
            if (!floor.tryAcquire()) return;

            void attempt.run(() =>
                // Hydration is awaited HERE rather than before the fast path above so the foreground
                // return stays synchronous: at worst a not-yet-hydrated launch fetches a token it
                // turns out not to need, and the compare below still stops the call from going out.
                //
                // Run in PARALLEL with the token fetch, not before it: both are bridge round-trips
                // with a 10s timeout and neither needs the other's answer, so chaining them would put
                // a stalled bridge's two timeouts back to back before the first registration.
                Promise.all([record.hydrate(currentDelegate.nativeRecordMirror), currentDelegate.fetchDeviceToken()])
                    .then(([, deviceToken]) => {
                        // An empty token (permission denied, FCM not ready) is a failure:
                        // fall through to the catch so the next trigger retries immediately.
                        if (!deviceToken) throw new Error('empty device token');
                        // Nothing changed since the last successful registration.
                        if (identity && record.read(identity) === deviceToken) return undefined;
                        return mutateRef
                            .current({
                                // useDynamicDeviceId is the single device-identity source shared
                                // with the socket side — registration must never derive its own.
                                deviceId: deviceIdRef.current ?? undefined,
                                deviceToken,
                                platform: currentDelegate.platform,
                                installId: currentDelegate.installId ?? firebaseInstallationIdRef.current,
                                application: currentDelegate.application ?? DEFAULT_APPLICATION,
                                stage: currentDelegate.stage,
                                force: true,
                            })
                            .then(() => {
                                // Recorded only after the server accepted it — a failed attempt must
                                // leave no trace, or the retry would be skipped.
                                if (identity) record.write(identity, deviceToken, currentDelegate.nativeRecordMirror);
                            });
                    })
                    .then(() => undefined)
                    .catch(() => {
                        floor.reset(); // allow an immediate retry
                    })
            );
        },
        [attempt, floor, record, resolveIdentity]
    );

    // Launch / login path. A fresh login (including an account switch shortly
    // after logout) must register right away, so drop any leftover throttle
    // window from the previous session before attempting.
    const hasDelegate = !!delegate;
    useEffect(() => {
        if (!isAuthenticated || !hasDelegate) return;
        floor.reset();
        register('auth');
    }, [isAuthenticated, hasDelegate, register, floor]);

    // Return-to-app path. Under the once-per-install record this is a no-op for an already-registered
    // device; it stays mounted for the device that has NOT registered yet — a user who granted the
    // notification permission after first launch registers on their next return, with no restart.
    useEffect(() => {
        if (!hasDelegate) return;
        const onFocus = () => {
            if (document.visibilityState === 'visible') register('focus');
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [hasDelegate, register]);

    // Token-rotation path, for shells that can volunteer one. A rotation is rare and one of the few
    // things that re-registers at all under this policy, so it clears the burst floor first.
    useEffect(() => {
        if (!hasDelegate) return;
        const subscribe = delegateRef.current?.subscribeTokenChange;
        if (!subscribe) return;
        return subscribe(() => {
            floor.reset();
            register('token-change');
        });
    }, [hasDelegate, register, floor]);
};
