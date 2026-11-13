import { AppState } from 'react-native';

import { RELAY_SLOT } from '@chatic/runtime-core';
import type { DeviceTokenDelegate, PushDeviceIds, RuntimeEngine, SessionStalenessPolicy } from '@chatic/runtime-core';

import { nativeForegroundPorts } from './foreground';
import type { AppStateSource } from './foreground';

/**
 * The relay guard's policy, as a page's entry runs it: no timer, a refresh on the relay's first
 * verification and on each return to the front. At those edges the stored expiry is a poor proxy for
 * "the credential still signs", so the refresh is forced; the runtime throttles it to once a minute.
 */
export const NATIVE_RELAY_GUARD_POLICY: SessionStalenessPolicy = {
    intervalMs: null,
    checkOnRelayVerified: true,
    forceRefresh: true,
};

/** What the app hands the running runtime. */
export interface NativeRuntimeRunOptions {
    /**
     * The device's ids — the ones the app injects into its pages, so the server sees one device
     * whichever side holds the session.
     */
    deviceIds: () => PushDeviceIds;
    /** How this app reaches its push token; `null` for a build without push. */
    push: DeviceTokenDelegate | null;
    /** The app's state, for the foreground checks. React Native's `AppState` when left out. */
    appState?: AppStateSource;
    /** The clock the wake throttle reads; `Date.now` when left out. */
    now?: () => number;
}

/** The shortest gap between two foreground socket recoveries — a page's throttle. */
export const WAKE_KICK_THROTTLE_MS = 5_000;

/**
 * Starts what keeps a booted runtime's session alive, as a page's runtime host does on mount, and
 * returns the stop:
 *
 * - the session controller: it reads the session, then keeps a guest signed in;
 * - the connection controller: background clouds at once, the sockets once the session is ready;
 * - on each return to the front, a probe of the sockets and a delta for each background cloud
 *   (throttled), and the relay and cloud credential guards checked again (the relay one only while
 *   its socket is verified — without it a check can reach nobody);
 * - push registration: now if signed in, then on each sign-in, return to the front and token change.
 *
 * Nothing here waits: what runs later runs on the runtime's own signals. A step that throws stops
 * what started before it and rethrows, so a failed run leaves nothing running.
 */
export const runNativeRuntime = (
    engine: RuntimeEngine,
    { deviceIds, push, appState = AppState, now = Date.now }: NativeRuntimeRunOptions
): (() => void) => {
    const stops: (() => void)[] = [];
    const stopAll = () => {
        stops.reverse().forEach(stop => stop());
        stops.length = 0;
    };

    try {
        const deviceId = () => deviceIds().deviceId;

        const session = engine.sessionController({ deviceId });
        const connection = engine.connectionController({ deviceId });
        void session.initialize();
        stops.push(session.startGuestKeepAlive());
        stops.push(connection.startBackground());

        // The sockets wait for the session, as a page's host renders them only once it is ready.
        let socketsStarted = false;
        const startSockets = () => {
            if (socketsStarted || !session.isReady()) return;
            socketsStarted = true;
            stops.push(connection.startSockets());
        };
        stops.push(session.subscribeReady(startSockets));
        startSockets();

        const relayGuard = engine.relayCredentialGuard(NATIVE_RELAY_GUARD_POLICY);
        const cloudGuard = engine.cloudCredentialGuard();
        stops.push(relayGuard.start(), cloudGuard.start());

        const foreground = nativeForegroundPorts(appState);
        let lastWakeKick = Number.NEGATIVE_INFINITY;
        stops.push(
            foreground.subscribe(() => {
                if (!foreground.read()) return;
                // A socket the OS suspended with the app may be dead without knowing it, and the
                // background clouds' timers froze with it: probe the sockets and ask each verified
                // background cloud for its delta now, as a page does on its foreground — at most once
                // per `WAKE_KICK_THROTTLE_MS`, so a quick back-and-forth does not churn the sockets.
                if (now() - lastWakeKick >= WAKE_KICK_THROTTLE_MS) {
                    lastWakeKick = now();
                    void engine.connection.recoverOnResume();
                    void engine.sync.refreshBackgroundClouds();
                }
                if (engine.connection.snapshot().verifiedSlots.includes(RELAY_SLOT)) void relayGuard.check();
                void cloudGuard.check();
            })
        );

        if (push) stops.push(engine.pushRegistration({ delegate: () => push, deviceIds }).start());
    } catch (error) {
        // Whatever started before the throw is stopped, so a failed run leaves nothing running.
        stopAll();
        throw error;
    }

    return stopAll;
};
