import { transportPlatform } from '@chatic/transport/platform';
import { fakeTransportPorts } from '@chatic/transport/testing/platform';
import { getSessionAuthSnapshot, markSessionInitialized } from '@chatic/session/store/contextStore';
import { sessionSignal } from '@chatic/session/store/signal';

import { createSessionController } from './sessionController';
import { foregroundPlatform } from './foreground';

const mockInitialize = jest.fn();
const mockLoginGuestByDevice = jest.fn();
jest.mock('@chatic/auth/session/relaySession', () => ({
    relaySession: {
        initialize: (...args: unknown[]) => mockInitialize(...args),
        loginGuestByDevice: (...args: unknown[]) => mockLoginGuestByDevice(...args),
    },
}));

jest.mock('@chatic/session/store/contextStore', () => ({
    ...jest.requireActual('@chatic/session/store/contextStore'),
    getSessionAuthSnapshot: jest.fn(),
    markSessionInitialized: jest.fn(),
}));

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedSnapshot = getSessionAuthSnapshot as jest.MockedFunction<typeof getSessionAuthSnapshot>;
const mockedMarkInitialized = markSessionInitialized as jest.MockedFunction<typeof markSessionInitialized>;

/** The session store's auth snapshot, as the controller reads it. */
const auth = { isInitialized: false, isAuthenticated: false };
const setAuth = (next: Partial<typeof auth>): void => {
    Object.assign(auth, next);
};

/** A network and a foreground the test drives. */
let online = true;
let notifyOnline: () => void = () => undefined;
let visible = true;
let notifyForeground: () => void = () => undefined;

/** Lets queued promise callbacks run. */
const settle = () => new Promise(resolve => setImmediate(resolve));

/** Every keep-alive a test started, stopped after it — the session signal outlives a test. */
const started: Array<() => void> = [];
afterEach(() => started.splice(0).forEach(stop => stop()));

beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    Object.assign(auth, { isInitialized: false, isAuthenticated: false });
    mockedSnapshot.mockImplementation(() => ({ ...auth }) as never);
    online = true;
    visible = true;
    transportPlatform.configure(
        fakeTransportPorts({
            online: {
                read: () => online,
                subscribe: listener => {
                    notifyOnline = listener;
                    return () => {
                        notifyOnline = () => undefined;
                    };
                },
            },
        })
    );
    foregroundPlatform.configure({
        read: () => visible,
        subscribe: listener => {
            notifyForeground = listener;
            return () => {
                notifyForeground = () => undefined;
            };
        },
    });
    mockLoginGuestByDevice.mockResolvedValue(undefined);
});

const keepAlive = (deviceId: () => string | null | undefined = () => 'device-1') => {
    const stop = createSessionController({ deviceId }).startGuestKeepAlive();
    started.push(stop);
    return stop;
};

describe('initialize', () => {
    afterEach(() => jest.useRealTimers());

    it('is ready once the init has finished and the store says initialised', async () => {
        mockInitialize.mockImplementation(async () => setAuth({ isInitialized: true }));
        const controller = createSessionController({ deviceId: () => 'device-1' });
        expect(controller.isReady()).toBe(false);

        await controller.initialize();

        expect(controller.isReady()).toBe(true);
        expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('runs once per controller, however often it is asked', async () => {
        mockInitialize.mockResolvedValue(undefined);
        const controller = createSessionController({ deviceId: () => 'device-1' });

        const first = controller.initialize();
        const second = controller.initialize();
        await first;

        expect(second).toBe(first);
        expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('retries a failed init three times, 2 s, 4 s and 6 s apart, then renders signed out', async () => {
        jest.useFakeTimers();
        mockInitialize.mockRejectedValue(new Error('Network error'));
        const controller = createSessionController({ deviceId: () => 'device-1' });
        const done = controller.initialize();

        await jest.advanceTimersByTimeAsync(0);
        expect(mockInitialize).toHaveBeenCalledTimes(1);
        await jest.advanceTimersByTimeAsync(2000);
        expect(mockInitialize).toHaveBeenCalledTimes(2);
        await jest.advanceTimersByTimeAsync(4000);
        expect(mockInitialize).toHaveBeenCalledTimes(3);
        await jest.advanceTimersByTimeAsync(6000);
        expect(mockInitialize).toHaveBeenCalledTimes(4);
        await done;

        await jest.advanceTimersByTimeAsync(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(4);
        expect(mockedMarkInitialized).toHaveBeenCalledTimes(1);
    });

    it('stops retrying once an attempt succeeds', async () => {
        jest.useFakeTimers();
        mockInitialize
            .mockRejectedValueOnce(new Error('Network error'))
            .mockRejectedValueOnce(new Error('Network error'))
            .mockImplementation(async () => setAuth({ isInitialized: true }));
        const controller = createSessionController({ deviceId: () => 'device-1' });
        const done = controller.initialize();

        await jest.advanceTimersByTimeAsync(2000 + 4000);
        await done;
        expect(controller.isReady()).toBe(true);

        await jest.advanceTimersByTimeAsync(10000);
        expect(mockInitialize).toHaveBeenCalledTimes(3);
        expect(mockedMarkInitialized).not.toHaveBeenCalled();
    });

    it('tells its readiness listeners when the init finishes and when the session signals', async () => {
        mockInitialize.mockResolvedValue(undefined);
        const controller = createSessionController({ deviceId: () => 'device-1' });
        const listener = jest.fn();
        const unsubscribe = controller.subscribeReady(listener);

        await controller.initialize();
        expect(listener).toHaveBeenCalledTimes(1);

        sessionSignal.emit('identity');
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        sessionSignal.emit('identity');
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe('startGuestKeepAlive', () => {
    it('logs in as a guest by device when there is no relay session', () => {
        keepAlive();

        expect(mockLoginGuestByDevice).toHaveBeenCalledWith('device-1');
        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
    });

    it('does not log in when already authenticated', () => {
        setAuth({ isAuthenticated: true });

        keepAlive();

        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();
    });

    it('does not log in without a device id', () => {
        keepAlive(() => undefined);

        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();
    });

    // A first launch with no network used to burn its single attempt and then sit sessionless until
    // the app restarted: nothing about a failed login moves on its own.
    it('skips the attempt while offline, then runs it when the network returns', () => {
        online = false;
        keepAlive();
        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();

        online = true;
        notifyOnline();

        expect(mockLoginGuestByDevice).toHaveBeenCalledWith('device-1');
    });

    it('retries a FAILED attempt when the app returns to the foreground', async () => {
        mockLoginGuestByDevice.mockRejectedValue(new Error('offline-ish'));
        keepAlive();
        await settle();

        notifyForeground();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(2);
    });

    it('does not retry on a foreground change that leaves the app in the background', async () => {
        mockLoginGuestByDevice.mockRejectedValue(new Error('offline-ish'));
        keepAlive();
        await settle();

        visible = false;
        notifyForeground();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
    });

    it('floors the edge retries so a bouncing app cannot storm the login', async () => {
        mockLoginGuestByDevice.mockRejectedValue(new Error('offline-ish'));
        keepAlive();
        await settle();

        notifyForeground();
        await settle();
        notifyForeground();
        notifyOnline();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(2);
    });

    it('logs in again when a session goes away — after the signal, not inside it', async () => {
        setAuth({ isAuthenticated: true });
        keepAlive();

        setAuth({ isAuthenticated: false });
        sessionSignal.emit('relay:token');
        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();

        await settle();
        expect(mockLoginGuestByDevice).toHaveBeenCalledWith('device-1');
    });

    it('ignores edges once the session is there', () => {
        setAuth({ isAuthenticated: true });
        keepAlive();

        notifyOnline();
        notifyForeground();

        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();
    });

    it('stops listening once stopped', async () => {
        mockLoginGuestByDevice.mockRejectedValue(new Error('offline-ish'));
        const stop = keepAlive();
        await settle();

        stop();
        notifyForeground();
        notifyOnline();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
    });

    // React StrictMode mounts the host, unmounts it and mounts it again before the first login is back.
    it('a stop and a start on one controller join the login in flight instead of sending a second', async () => {
        let finish: () => void = () => undefined;
        mockLoginGuestByDevice.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
        const controller = createSessionController({ deviceId: () => 'device-1' });

        controller.startGuestKeepAlive()();
        started.push(controller.startGuestKeepAlive());

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
        finish();
        await settle();
    });

    it('an edge that arrives while a login is in flight joins it', () => {
        mockLoginGuestByDevice.mockReturnValue(new Promise(() => undefined));
        keepAlive();

        notifyForeground();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
    });

    it('a session signal that leaves the visitor signed out as before tries nothing', async () => {
        mockLoginGuestByDevice.mockRejectedValue(new Error('offline-ish'));
        keepAlive();
        await settle();

        sessionSignal.emit('selection');
        await settle();

        expect(mockLoginGuestByDevice).toHaveBeenCalledTimes(1);
    });

    it('drops an attempt queued by a lost session when it is stopped first', async () => {
        setAuth({ isAuthenticated: true });
        const stop = keepAlive();

        setAuth({ isAuthenticated: false });
        sessionSignal.emit('relay:token');
        stop();
        await settle();

        expect(mockLoginGuestByDevice).not.toHaveBeenCalled();
    });
});
