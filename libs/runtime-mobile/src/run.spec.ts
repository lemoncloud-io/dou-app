import { RELAY_SLOT } from '@chatic/runtime-core';
import type { RuntimeEngine } from '@chatic/runtime-core';

import type { AppStateSource } from './foreground';
import { NATIVE_RELAY_GUARD_POLICY, WAKE_KICK_THROTTLE_MS, runNativeRuntime } from './run';

jest.mock('react-native', () => ({ AppState: {} }));

const fakeAppState = (initial: string) => {
    const handlers = new Set<() => void>();
    const source = {
        currentState: initial,
        addEventListener: jest.fn((_type: string, handler: () => void) => {
            handlers.add(handler);
            return { remove: () => handlers.delete(handler) };
        }),
    };
    const change = (next: string) => {
        source.currentState = next;
        [...handlers].forEach(handler => handler());
    };
    return { source: source as unknown as AppStateSource, change, listeners: () => handlers.size };
};

const fakeEngine = () => {
    const calls: string[] = [];
    const stop = (name: string) => jest.fn(() => calls.push(`stop ${name}`));
    let ready = false;
    const readyListeners = new Set<() => void>();
    const verified: string[] = [];
    const guard = (name: string) => ({
        start: jest.fn(() => {
            calls.push(`start ${name}`);
            return stop(name);
        }),
        check: jest.fn(async () => void calls.push(`check ${name}`)),
        setPolicy: jest.fn(),
    });
    const relay = guard('relay guard');
    const cloud = guard('cloud guard');
    const session = {
        initialize: jest.fn(async () => void calls.push('initialize')),
        isReady: () => ready,
        subscribeReady: (listener: () => void) => {
            readyListeners.add(listener);
            return () => readyListeners.delete(listener);
        },
        startGuestKeepAlive: jest.fn(() => {
            calls.push('start guest keep-alive');
            return stop('guest keep-alive');
        }),
    };
    const connection = {
        startBackground: jest.fn(() => {
            calls.push('start background');
            return stop('background');
        }),
        startSockets: jest.fn(() => {
            calls.push('start sockets');
            return stop('sockets');
        }),
    };
    const push = { start: jest.fn(() => (calls.push('start push'), stop('push'))), notifyForeground: jest.fn() };
    const engine = {
        sessionController: jest.fn(() => session),
        connectionController: jest.fn(() => connection),
        relayCredentialGuard: jest.fn(() => relay),
        cloudCredentialGuard: jest.fn(() => cloud),
        pushRegistration: jest.fn(() => push),
        connection: {
            snapshot: () => ({ active: null, verifiedSlots: [...verified] }),
            recoverOnResume: jest.fn(async () => void calls.push('recover on resume')),
        },
        sync: { refreshBackgroundClouds: jest.fn(async () => void calls.push('refresh background clouds')) },
    } as unknown as RuntimeEngine;
    const becomeReady = () => {
        ready = true;
        readyListeners.forEach(listener => listener());
    };
    return { engine, calls, relay, cloud, push, becomeReady, verified, connection };
};

const deviceIds = () => ({ deviceId: 'device-1', firebaseInstallationId: 'fid' });
const delegate = { fetchDeviceToken: async () => 'token', platform: 'ios' };

describe('runNativeRuntime', () => {
    it('starts the session, the background clouds, the guards and push, and the sockets only once the session is ready', () => {
        const fake = fakeEngine();
        const appState = fakeAppState('active');

        runNativeRuntime(fake.engine, { deviceIds, push: delegate, appState: appState.source });
        expect(fake.calls).toEqual([
            'initialize',
            'start guest keep-alive',
            'start background',
            'start relay guard',
            'start cloud guard',
            'start push',
        ]);
        expect(fake.engine.relayCredentialGuard).toHaveBeenCalledWith(NATIVE_RELAY_GUARD_POLICY);
        expect(fake.engine.sessionController).toHaveBeenCalledWith({ deviceId: expect.any(Function) });
        expect((fake.engine.sessionController as jest.Mock).mock.calls[0][0].deviceId()).toBe('device-1');
        expect(fake.engine.pushRegistration).toHaveBeenCalledWith({ delegate: expect.any(Function), deviceIds });

        fake.becomeReady();
        fake.becomeReady();
        expect(fake.connection.startSockets).toHaveBeenCalledTimes(1);
    });

    it('checks the credentials on each return to the front, the relay only while its socket is verified', async () => {
        const fake = fakeEngine();
        const appState = fakeAppState('active');
        runNativeRuntime(fake.engine, { deviceIds, push: null, appState: appState.source });

        appState.change('background');
        appState.change('active');
        expect(fake.relay.check).not.toHaveBeenCalled();
        expect(fake.cloud.check).toHaveBeenCalledTimes(1);

        fake.verified.push(RELAY_SLOT);
        appState.change('background');
        appState.change('active');
        expect(fake.relay.check).toHaveBeenCalledTimes(1);
        expect(fake.cloud.check).toHaveBeenCalledTimes(2);
        expect(fake.engine.pushRegistration).not.toHaveBeenCalled();
    });

    it('recovers the sockets and refreshes the background clouds on a return to the front, at most once per throttle', () => {
        const fake = fakeEngine();
        const appState = fakeAppState('active');
        let clock = 0;
        runNativeRuntime(fake.engine, { deviceIds, push: null, appState: appState.source, now: () => clock });

        appState.change('background');
        appState.change('active');
        clock += WAKE_KICK_THROTTLE_MS - 1;
        appState.change('background');
        appState.change('active');
        expect(fake.engine.connection.recoverOnResume).toHaveBeenCalledTimes(1);
        expect(fake.engine.sync.refreshBackgroundClouds).toHaveBeenCalledTimes(1);

        clock += 1;
        appState.change('background');
        appState.change('active');
        expect(fake.engine.connection.recoverOnResume).toHaveBeenCalledTimes(2);
        // The credential checks are not throttled: each return to the front asks again.
        expect(fake.cloud.check).toHaveBeenCalledTimes(3);
    });

    it('stops what it started and rethrows when a step fails', () => {
        const fake = fakeEngine();
        const appState = fakeAppState('active');
        (fake.engine.cloudCredentialGuard as jest.Mock).mockImplementation(() => {
            throw new Error('guard bug');
        });

        expect(() => runNativeRuntime(fake.engine, { deviceIds, push: delegate, appState: appState.source })).toThrow(
            'guard bug'
        );
        expect(fake.calls).toEqual(expect.arrayContaining(['stop background', 'stop guest keep-alive']));
        expect(fake.engine.pushRegistration).not.toHaveBeenCalled();
    });

    it('stops everything it started, last first', () => {
        const fake = fakeEngine();
        const appState = fakeAppState('active');
        const stop = runNativeRuntime(fake.engine, { deviceIds, push: delegate, appState: appState.source });
        fake.becomeReady();
        fake.calls.length = 0;

        stop();

        // The sockets started last — when the session became ready — so they stop first.
        expect(fake.calls).toEqual([
            'stop sockets',
            'stop push',
            'stop cloud guard',
            'stop relay guard',
            'stop background',
            'stop guest keep-alive',
        ]);
        expect(appState.listeners()).toBe(0);
    });
});
