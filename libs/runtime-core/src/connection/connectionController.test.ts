import { backgroundClouds, resetBackgroundClouds } from '@chatic/transport/socket/backgroundClouds';
import { sessionSignal } from '@chatic/session/store/signal';
import { getSyncManager } from '@chatic/sync/runtime';
import { logger } from '@chatic/logger';
import { createConnectionController } from './connectionController';
import { deriveSocketSlots, hasRelaySlot } from './socketSlots';

jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockSync = jest.fn();
const mockDispose = jest.fn();
jest.mock('@chatic/auth/socket/backgroundCloudTokens', () => ({
    BackgroundCloudTokens: jest.fn().mockImplementation(() => ({ sync: mockSync, dispose: mockDispose })),
}));
jest.mock('@chatic/auth/session/cloudTokens', () => ({ issueCloudTokens: jest.fn() }));
const mockDelegate = { id: 'delegate' };
jest.mock('@chatic/auth/socket/sessionDelegate', () => ({ createSocketSessionDelegate: () => mockDelegate }));

const mockSelection = jest.fn((): string[] => ['cloud-a']);
jest.mock('./backgroundSlots', () => ({
    currentBackgroundSelection: () => mockSelection(),
    liveBackgroundReadiness: {},
}));
jest.mock('./socketSlots', () => ({ deriveSocketSlots: jest.fn(), hasRelaySlot: jest.fn() }));

let mockSlotListener: (() => void) | null = null;
const mockUnsubscribeSlots = jest.fn();
const mockManager = {
    subscribeSlotClients: (listener: () => void) => {
        mockSlotListener = listener;
        return mockUnsubscribeSlots;
    },
};
jest.mock('@chatic/transport/socket/runtime', () => ({ getSocketManager: () => mockManager }));

const mockStopReceive = jest.fn();
const mockStartReceive = jest.fn(() => mockStopReceive);
jest.mock('@chatic/sync/runtime', () => ({
    getSyncManager: jest.fn(),
    startBackgroundReceive: () => mockStartReceive(),
}));

/** The order the socket half touches things in, across the sync engine and both binders. */
const order: string[] = [];
const mockApply = jest.fn((slots: unknown) => order.push(`bind ${JSON.stringify(slots)}`));
const mockDetachAll = jest.fn();
jest.mock('./SocketBinder', () => ({
    SocketBinder: jest.fn().mockImplementation(() => ({ apply: mockApply, detachAll: mockDetachAll })),
}));
const mockReauth = jest.fn((slots: unknown) => order.push(`reauth ${JSON.stringify(slots)}`));
jest.mock('./SocketReauthBinder', () => ({
    SocketReauthBinder: jest.fn().mockImplementation(() => ({ apply: mockReauth })),
}));

const mockedDerive = deriveSocketSlots as jest.MockedFunction<typeof deriveSocketSlots>;
const mockedHasRelay = hasRelaySlot as jest.MockedFunction<typeof hasRelaySlot>;
const mockedGetSyncManager = getSyncManager as jest.MockedFunction<typeof getSyncManager>;

/** Lets the controller's coalesced pass run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const slotsFor = (deviceId: string | null | undefined) => ({ relay: { config: { deviceId } } }) as never;

/** Every half a test started, stopped after it — the session signal and the store outlive a test. */
const started: Array<() => void> = [];
const track = (stop: () => void) => {
    started.push(stop);
    return stop;
};
afterEach(() => started.splice(0).forEach(stop => stop()));

beforeEach(() => {
    jest.clearAllMocks();
    resetBackgroundClouds();
    order.length = 0;
    mockSlotListener = null;
    mockSelection.mockReturnValue(['cloud-a']);
    mockedHasRelay.mockReturnValue(true);
    mockedDerive.mockImplementation(slotsFor);
    mockedGetSyncManager.mockImplementation(() => {
        order.push('sync engine');
        return undefined as never;
    });
});

describe('the background half', () => {
    it('prepares the current selection while a relay session exists', () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());

        expect(mockedHasRelay).toHaveBeenCalledWith('d');
        expect(mockSync).toHaveBeenLastCalledWith(['cloud-a']);
    });

    it('prepares nothing without one — and says so, so pending retries are forgotten', () => {
        mockedHasRelay.mockReturnValue(false);

        track(createConnectionController({ deviceId: () => 'd' }).startBackground());

        expect(mockSync).toHaveBeenLastCalledWith([]);
        expect(mockSelection).not.toHaveBeenCalled();
    });

    it('re-checks when the background store announces — e.g. a cloud whose tokens were dropped', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        mockSync.mockClear();
        mockSelection.mockReturnValue(['cloud-a', 'cloud-b']);

        backgroundClouds.invalidate();
        await settle();

        expect(mockSync).toHaveBeenCalledWith(['cloud-a', 'cloud-b']);
    });

    it('re-checks when a slot signal moves — the relay session ending empties the preparer', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        mockSync.mockClear();
        mockedHasRelay.mockReturnValue(false);

        sessionSignal.emit('relay:token');
        await settle();

        expect(mockSync).toHaveBeenCalledWith([]);
    });

    it("re-checks at once when a slot binds or goes away — a torn-down cloud is the preparer's again", () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        mockSync.mockClear();

        mockSlotListener?.();

        expect(mockSync).toHaveBeenCalledWith(['cloud-a']);
    });

    it('re-checks once for several announcements in one go', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        mockSync.mockClear();

        backgroundClouds.invalidate();
        sessionSignal.emit('selection');
        sessionSignal.emit('cloud:token');
        await settle();

        expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('reads the device id on every check, not once', async () => {
        let deviceId = 'first';
        track(createConnectionController({ deviceId: () => deviceId }).startBackground());
        deviceId = 'second';

        backgroundClouds.invalidate();
        await settle();

        expect(mockedHasRelay).toHaveBeenLastCalledWith('second');
    });

    it('runs the receive loops, and its stop ends them with the preparer and every subscription', async () => {
        const stop = track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        expect(mockStartReceive).toHaveBeenCalledTimes(1);

        backgroundClouds.invalidate();
        stop();
        mockSync.mockClear();
        await settle();
        sessionSignal.emit('relay:token');
        await settle();

        expect(mockStopReceive).toHaveBeenCalledTimes(1);
        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockUnsubscribeSlots).toHaveBeenCalledTimes(1);
        // Neither the check queued before the stop nor a later signal reaches the disposed preparer.
        expect(mockSync).not.toHaveBeenCalled();
    });
});

describe('the socket half', () => {
    it('makes the sync engine exist before the first slot binds, and binds before returning', () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());

        expect(order).toEqual([
            'sync engine',
            `bind ${JSON.stringify(slotsFor('d'))}`,
            `reauth ${JSON.stringify(slotsFor('d'))}`,
        ]);
        expect(mockedDerive).toHaveBeenCalledWith('d');
    });

    it('hands both binders the same slots and the one delegate', () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());

        expect(mockApply).toHaveBeenCalledWith(slotsFor('d'), mockDelegate);
        expect(mockReauth).toHaveBeenCalledWith(slotsFor('d'), mockDelegate);
    });

    it('re-derives on the three slot signals and the background store, once per burst', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());
        mockedDerive.mockClear();

        sessionSignal.emit('selection');
        sessionSignal.emit('cloud:token');
        backgroundClouds.invalidate();
        await settle();
        expect(mockedDerive).toHaveBeenCalledTimes(1);

        sessionSignal.emit('relay:token');
        await settle();
        expect(mockedDerive).toHaveBeenCalledTimes(2);
    });

    // `identity` is deliberately absent: none of the slot inputs move on it, and boot alone emits it
    // twice (`setSessionIdentityState`) with every login adding one. The pairing that keeps this safe
    // is the NARROW snapshot the derivation reads (relay + cloud only).
    it('does not re-derive on an identity signal', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());
        mockedDerive.mockClear();

        sessionSignal.emit('identity');
        await settle();

        expect(mockedDerive).not.toHaveBeenCalled();
    });

    it('its stop detaches the binder and drops a pass that was already queued', async () => {
        const stop = track(createConnectionController({ deviceId: () => 'd' }).startSockets());
        mockApply.mockClear();

        sessionSignal.emit('selection');
        stop();
        await settle();

        expect(mockDetachAll).toHaveBeenCalledTimes(1);
        expect(mockApply).not.toHaveBeenCalled();
    });

    it('a restart starts from a fresh binder, as a remounted host does', () => {
        const controller = createConnectionController({ deviceId: () => 'd' });
        controller.startSockets()();
        track(controller.startSockets());

        expect(jest.requireMock('./SocketBinder').SocketBinder).toHaveBeenCalledTimes(2);
        expect(mockApply).toHaveBeenCalledTimes(2);
    });

    it('a binder that throws is logged, and the re-auth still gets its turn', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());
        mockReauth.mockClear();
        mockApply.mockImplementationOnce(() => {
            throw new Error('destroy failed');
        });

        sessionSignal.emit('relay:token');
        await settle();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[ConnectionController] socket reconcile failed',
            expect.objectContaining({ error: expect.any(Error) })
        );
        expect(mockReauth).toHaveBeenCalledTimes(1);
    });

    it('a slot derivation that throws is logged rather than escaping the microtask', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startSockets());
        mockedDerive.mockImplementationOnce(() => {
            throw new Error('no snapshot');
        });

        sessionSignal.emit('selection');
        await settle();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[ConnectionController] socket pass failed',
            expect.objectContaining({ error: expect.any(Error) })
        );
    });
});

describe('running a due socket pass from a host', () => {
    it('announces a due pass at once, once per burst, and moves the version', () => {
        const controller = createConnectionController({ deviceId: () => 'd' });
        track(controller.startSockets());
        const listener = jest.fn();
        controller.subscribeSocketPass(listener);
        const before = controller.getSocketPassVersion();

        sessionSignal.emit('selection');
        sessionSignal.emit('cloud:token');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(controller.getSocketPassVersion()).toBe(before + 1);
    });

    it('flushSockets runs the due pass now, and the microtask then finds nothing to do', async () => {
        const controller = createConnectionController({ deviceId: () => 'd' });
        track(controller.startSockets());
        mockedDerive.mockClear();

        sessionSignal.emit('selection');
        controller.flushSockets();
        expect(mockedDerive).toHaveBeenCalledTimes(1);

        await settle();
        expect(mockedDerive).toHaveBeenCalledTimes(1);
    });

    it('flushSockets with nothing due runs nothing', () => {
        const controller = createConnectionController({ deviceId: () => 'd' });
        track(controller.startSockets());
        mockedDerive.mockClear();

        controller.flushSockets();

        expect(mockedDerive).not.toHaveBeenCalled();
    });

    it("stopping an earlier start does not cut off a later one's passes", async () => {
        const controller = createConnectionController({ deviceId: () => 'd' });
        const stopFirst = controller.startSockets();
        track(controller.startSockets());
        stopFirst();
        mockedDerive.mockClear();

        sessionSignal.emit('selection');
        await settle();

        expect(mockedDerive).toHaveBeenCalledTimes(1);
    });
});

describe('a start that throws', () => {
    it('undoes the background start — no subscription is left behind — and rethrows', async () => {
        mockSync.mockImplementationOnce(() => {
            throw new Error('preparer broke');
        });

        expect(() => createConnectionController({ deviceId: () => 'd' }).startBackground()).toThrow('preparer broke');
        expect(mockDispose).toHaveBeenCalledTimes(1);
        expect(mockUnsubscribeSlots).toHaveBeenCalledTimes(1);
        expect(mockStartReceive).not.toHaveBeenCalled();

        backgroundClouds.invalidate();
        sessionSignal.emit('relay:token');
        await settle();
        expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('logs a later background check that throws instead of letting it escape', async () => {
        track(createConnectionController({ deviceId: () => 'd' }).startBackground());
        mockSync.mockImplementationOnce(() => {
            throw new Error('preparer broke');
        });

        backgroundClouds.invalidate();
        await settle();

        expect(logger.error).toHaveBeenCalledWith(
            'SOCKET',
            '[ConnectionController] background check failed',
            expect.objectContaining({ error: expect.any(Error) })
        );
    });
});
