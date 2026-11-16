import { logger } from '@chatic/logger';
import { Coalescer, Throttle } from '@chatic/auth';
import { getRelaySessionUser, getSessionAuthSnapshot, subscribeSessionSignal } from '@chatic/session';
import { userGateway } from '@chatic/transport';

import { foregroundPlatform } from '../session/foreground';
import { PushRegistrationRecord, type NativeRecordMirror, type RegistrationIdentity } from './registrationRecord';

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
     * @deprecated The Firebase installation id is resolved from the shared device-identity source
     * (`deviceIds` below). Supply only when a shell cannot inject the CHATIC_APP_* globals; a provided
     * value still wins.
     */
    installId?: string;
    /** SNS application name; defaults to 'chatic'. */
    application?: string;
    /**
     * Deployment stage. Omitting it lets the broker fall back to ITS OWN default ('dev'), which
     * registers a production build into the dev SNS application — the token's Firebase project then
     * mismatches the SNS credential, FCM rejects delivery with SENDER_ID_MISMATCH, and SNS disables
     * the endpoint. Supply it on any shell whose build stage is not the broker's default.
     */
    stage?: string;
    /**
     * Optional signal that the shell minted a new push token, returning an unsubscribe.
     *
     * Only shells that can volunteer a token supply this. Without it a rotated token is picked up on
     * the next launch, which is fine for mobile but not for a desktop app that stays open for days —
     * under the once-per-install policy a rotation is one of the few things that re-registers at all.
     *
     * Unlike the other fields this one is read ONCE, when the registration starts: re-subscribing
     * whenever the delegate object is rebuilt would tear down and reinstall the shell listener on every
     * render. Callers who rebuild the delegate (which the rest of this contract allows) must therefore
     * keep this function itself stable — a later replacement is not picked up.
     */
    subscribeTokenChange?: (onChange: () => void) => () => void;
    /**
     * Optional durable home for the registration record, for shells whose native storage outlives
     * the webview's. Without it the record lives only in web storage, and a cache clear costs one
     * extra registration.
     */
    nativeRecordMirror?: NativeRecordMirror;
}

/** The device's ids, as the platform resolves them — the same source the sockets bind with. */
export interface PushDeviceIds {
    deviceId: string | null | undefined;
    firebaseInstallationId?: string;
}

export interface PushRegistrationOptions {
    /** The shell's delegate, read at each attempt — a caller may hand over a fresh object every time. */
    delegate: () => DeviceTokenDelegate | null;
    /** The device's ids, read at each attempt. */
    deviceIds: () => PushDeviceIds;
}

/** Why `register` was called. Only the high-frequency trigger consults the record before the bridge. */
type RegisterReason = 'auth' | 'focus' | 'token-change';

const DEFAULT_APPLICATION = 'chatic';
const BURST_FLOOR_MS = 60_000;

const isAuthenticated = (): boolean => getSessionAuthSnapshot().isAuthenticated;

/**
 * Cross-cloud push registration for native shells.
 *
 * Registers the shell's push token with the home broker (`reg-dev`) **once per install**:
 * a successful registration is recorded in `PushRegistrationRecord`, and while that record matches
 * the current account, device and token, no further call is made. The record holds the token rather
 * than a flag, so a rotated token, an account switch or a policy-version bump still re-registers —
 * the skip means "nothing changed", never "we already did this once".
 *
 * This deliberately gives up the endpoint self-healing the previous always-force strategy provided.
 * SNS disables a platform endpoint after a single failed delivery and `CreatePlatformEndpoint` does
 * not revive it, so a device whose endpoint dies stays dark until a recovery path fires. That trade was
 * made to cut `reg-dev` call volume, which the always-force strategy had driven to several calls per
 * device per day.
 *
 * When a call does go out it is still forced: the broker skips endpoint creation entirely for a
 * registration seen within the hour unless `force` is set.
 *
 * The token is re-fetched from the shell on every attempt instead of cached, so a late permission
 * grant or an FCM token rotation is picked up without an app restart.
 *
 * Best-effort: a failure records nothing, so the next trigger retries. React reaches it through
 * `runtime.push.useDeviceTokenRegistration`, which only starts and stops it.
 */
export class PushRegistration {
    // In-flight share + a burst floor. The floor is not the re-register interval — the record is. What
    // is left for it is absorbing one physical foreground transition arriving twice (a window `focus`
    // AND a visibility change) and keeping a failing first registration from retrying on every such
    // event. These and the record belong to the registration, not to a start: a stop followed by a
    // start (React StrictMode) joins the attempt already in flight.
    private readonly attempt = new Coalescer<void>();
    private readonly floor = new Throttle({ intervalMs: BURST_FLOOR_MS });
    private readonly record = new PushRegistrationRecord();
    /** How many starts are live. The foreground notice is heard only while at least one is. */
    private liveStarts = 0;

    constructor(private readonly options: PushRegistrationOptions) {}

    /**
     * Registers now if the session is signed in, then again on each sign-in, each return to the
     * foreground and each token the shell says it rotated. Returns the stop.
     */
    start(): () => void {
        // Read before anything is subscribed: an unwired runtime throws here, and leaves nothing behind.
        const foreground = foregroundPlatform.ports();
        this.liveStarts += 1;
        let stopped = false;

        // Launch / login path. A fresh login (including an account switch shortly after logout) must
        // register right away, so drop any leftover throttle window from the previous session first.
        const registerOnAuth = (): void => {
            if (stopped || !isAuthenticated()) return;
            this.floor.reset();
            this.register('auth');
        };
        registerOnAuth();
        // A sign-in is the session going from absent to present. Deferred to a microtask, as the React
        // effect this replaced ran after the store update: the login that emitted the signal finishes
        // writing the session the attempt reads.
        let wasAuthenticated = isAuthenticated();
        const unsubscribeSession = subscribeSessionSignal(() => {
            const now = isAuthenticated();
            const signedIn = !wasAuthenticated && now;
            wasAuthenticated = now;
            if (signedIn) void Promise.resolve().then(registerOnAuth);
        });

        // Return-to-app path. Under the once-per-install record this is a no-op for an
        // already-registered device; it stays armed for the device that has NOT registered yet — a user
        // who granted the notification permission after first launch registers on their next return,
        // with no restart.
        const unsubscribeForeground = foreground.subscribe(() => this.notifyForeground());

        // Token-rotation path, for shells that can volunteer one. A rotation is rare and one of the few
        // things that re-registers at all under this policy, so it clears the burst floor first.
        const subscribeTokenChange = this.options.delegate()?.subscribeTokenChange;
        const unsubscribeTokenChange = subscribeTokenChange
            ? subscribeTokenChange(() => {
                  if (stopped) return;
                  this.floor.reset();
                  this.register('token-change');
              })
            : () => undefined;

        return () => {
            if (stopped) return;
            stopped = true;
            this.liveStarts -= 1;
            unsubscribeSession();
            unsubscribeForeground();
            unsubscribeTokenChange();
        };
    }

    /**
     * The app may be back in front of the user. The foreground port calls this; a host with a signal
     * the port does not carry (a page's window `focus`) calls it too. Nothing happens while the app is
     * not in front, or while the registration is stopped.
     */
    notifyForeground(): void {
        if (this.liveStarts === 0 || !foregroundPlatform.ports().read()) return;
        this.register('focus');
    }

    // The account this token registers under. Read from the RELAY session, not the active slot's
    // identity: that one becomes the cloud delegation token's uid once the user enters a cloud, and
    // keying on it would re-register on every cloud switch.
    private resolveIdentity(platform: string): RegistrationIdentity | null {
        const user = getRelaySessionUser() as { id?: string; uid?: string } | null;
        const uid = user?.id ?? user?.uid;
        const deviceId = this.options.deviceIds().deviceId;
        if (!uid || !deviceId) return null;
        return { uid, deviceId, platform };
    }

    private register(reason: RegisterReason): void {
        const delegate = this.options.delegate();
        if (!delegate || !isAuthenticated()) return;

        // Without an identity there is no key, so the record can neither be read nor written. Fall
        // back to registering every time rather than skip: an extra call is recoverable, a device that
        // never registers is silently dark.
        const identity = this.resolveIdentity(delegate.platform);

        // Foreground return is the high-frequency trigger. When the record already covers this
        // identity, stop before the bridge round-trip — a token fetch per app switch is the cost
        // this saves. The other reasons fall through and compare the actual token below.
        if (reason === 'focus' && identity && this.record.read(identity)) return;

        // The floor is consumed only when we are actually going to try — `tryAcquire` arms as it grants.
        if (!this.floor.tryAcquire()) return;

        void this.attempt.run(() =>
            // Hydration is awaited HERE rather than before the fast path above so the foreground
            // return stays synchronous: at worst a not-yet-hydrated launch fetches a token it
            // turns out not to need, and the compare below still stops the call from going out.
            //
            // Run in PARALLEL with the token fetch, not before it: both are bridge round-trips
            // with a 10s timeout and neither needs the other's answer, so chaining them would put
            // a stalled bridge's two timeouts back to back before the first registration.
            Promise.all([this.record.hydrate(delegate.nativeRecordMirror), delegate.fetchDeviceToken()])
                .then(([, deviceToken]) => {
                    // An empty token (permission denied, FCM not ready) is a failure:
                    // fall through to the catch so the next trigger retries immediately.
                    if (!deviceToken) throw new Error('empty device token');
                    // Nothing changed since the last successful registration.
                    if (identity && this.record.read(identity) === deviceToken) return undefined;
                    const { deviceId, firebaseInstallationId } = this.options.deviceIds();
                    return userGateway()
                        .registerDevice(
                            {
                                // The device ids are the single device-identity source shared with
                                // the socket side — registration must never derive its own.
                                deviceId: deviceId ?? undefined,
                                deviceToken,
                                platform: delegate.platform,
                                installId: delegate.installId ?? firebaseInstallationId,
                                application: delegate.application ?? DEFAULT_APPLICATION,
                                stage: delegate.stage,
                            },
                            { force: true }
                        )
                        .then(() => {
                            // Recorded only after the server accepted it — a failed attempt must
                            // leave no trace, or the retry would be skipped.
                            if (identity) this.record.write(identity, deviceToken, delegate.nativeRecordMirror);
                        });
                })
                .then(() => undefined)
                .catch((error: unknown) => {
                    this.floor.reset(); // allow an immediate retry
                    // An empty token is the shell saying "not yet" (no permission, FCM not ready) and is
                    // common; anything else is a registration that failed and would leave the device dark.
                    const emptyToken = error instanceof Error && error.message === 'empty device token';
                    const context = { error, data: { reason, platform: delegate.platform } };
                    if (emptyToken) logger.debug('NOTIFICATION', '[PushRegistration] no device token yet', context);
                    else logger.warn('NOTIFICATION', '[PushRegistration] registration did not go through', context);
                })
        );
    }
}
