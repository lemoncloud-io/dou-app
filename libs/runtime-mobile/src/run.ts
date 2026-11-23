import { AppState } from 'react-native';

import { RELAY_SLOT } from '@chatic/runtime-core';
import type { DeviceTokenDelegate, PushDeviceIds, RuntimeEngine, SessionStalenessPolicy } from '@chatic/runtime-core';

import { nativeForegroundPorts } from './foreground';
import type { AppStateSource } from './foreground';

export const NATIVE_RELAY_GUARD_POLICY: SessionStalenessPolicy = {
    intervalMs: null,
    checkOnRelayVerified: true,
    forceRefresh: true,
};

export interface NativeRuntimeRunOptions {
    deviceIds: () => PushDeviceIds;
    push: DeviceTokenDelegate | null;
    appState?: AppStateSource;
    now?: () => number;
}

export const WAKE_KICK_THROTTLE_MS = 5_000;

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
        stopAll();
        throw error;
    }

    return stopAll;
};
