import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';

import { RuntimeAuthHost, RuntimeConnectionHost } from './RuntimeConnectionHost';
import { bootstrapSocketConnection } from '@chatic/auth/socket/bootstrapSocketConnection';
import { getCommittedCloudId, getSocketSlotContext, sessionSignal } from '@chatic/session/store';
import { getSocketManager } from '@chatic/transport/socket/runtime';
import { coreEngine } from '@chatic/runtime-core/engine';
import type { RuntimeEngine } from '@chatic/runtime-core';
import { initAppRuntime, resetRuntimeEngine } from '@chatic/runtime-client';

beforeEach(() => initAppRuntime(coreEngine));
afterEach(() => resetRuntimeEngine());

let mockReady = true;
const mockReadyListeners = new Set<() => void>();
const mockInitialize = jest.fn(() => Promise.resolve());
const mockStopKeepAlive = jest.fn();
const mockKeepAlive = jest.fn(() => mockStopKeepAlive);
jest.mock('@chatic/runtime-core/session/sessionController', () => ({
    createSessionController: () => ({
        initialize: () => mockInitialize(),
        isReady: () => mockReady,
        subscribeReady: (listener: () => void) => {
            mockReadyListeners.add(listener);
            return () => mockReadyListeners.delete(listener);
        },
        startGuestKeepAlive: () => mockKeepAlive(),
    }),
}));
const setReady = (ready: boolean): void => {
    mockReady = ready;
    act(() => mockReadyListeners.forEach(listener => listener()));
};

jest.mock('../session/hooks/app/useDynamicDeviceId', () => ({
    resolveDeviceIds: () => ({ deviceId: 'device-1' }),
}));

jest.mock('@chatic/auth/socket/bootstrapSocketConnection', () => ({
    bootstrapSocketConnection: jest.fn().mockResolvedValue(jest.fn()),
}));
jest.mock('@chatic/auth/socket/reauthenticateActiveSocket', () => ({
    reauthenticateActiveSocket: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@chatic/auth/socket/backgroundCloudTokens', () => ({
    BackgroundCloudTokens: jest.fn().mockImplementation(() => ({ sync: jest.fn(), dispose: jest.fn() })),
}));
jest.mock('@chatic/runtime-core/connection/backgroundSlots', () => ({
    currentBackgroundSelection: () => [],
    readyBackgroundConfigs: () => [],
    liveBackgroundReadiness: {},
}));
jest.mock('@chatic/transport/socket/runtime', () => {
    const mockManager = {
        destroy: jest.fn(),
        setActiveSlot: jest.fn(),
        getSlotKeys: jest.fn(() => []),
        subscribeSlotClients: jest.fn(() => () => undefined),
    };
    return { getSocketManager: jest.fn().mockReturnValue(mockManager) };
});
const mockStopReceive = jest.fn();
const mockStartReceive = jest.fn(() => mockStopReceive);
jest.mock('@chatic/sync/runtime', () => ({
    getSyncManager: jest.fn(),
    startBackgroundReceive: () => mockStartReceive(),
}));

jest.mock('@chatic/session/store', () => ({
    ...jest.requireActual('@chatic/session/store'),
    getCommittedCloudId: jest.fn().mockReturnValue(null),
    getSocketSlotContext: jest.fn(),
}));

const mockedBootstrap = bootstrapSocketConnection as jest.MockedFunction<typeof bootstrapSocketConnection>;
const mockedSlotContext = getSocketSlotContext as jest.MockedFunction<typeof getSocketSlotContext>;
const mockedCommitted = getCommittedCloudId as jest.MockedFunction<typeof getCommittedCloudId>;

const signedIn = {
    relay: { wss: 'wss://relay', identityToken: 'relay-token' },
    cloud: { cloudId: 'default', wss: null, identityToken: null, isActive: false },
} as never;

const relayConfig = { url: 'wss://relay', deviceId: 'device-1', wssType: 'relay', cid: 'default' };

beforeEach(() => {
    jest.clearAllMocks();
    mockedBootstrap.mockResolvedValue(jest.fn());
    mockedSlotContext.mockReturnValue(signedIn);
    mockReady = true;
    mockedCommitted.mockReturnValue(null);
});

describe('두 호스트의 유일한 차이 — 게스트 keep-alive', () => {
    it('RuntimeConnectionHost는 게스트를 살려 둔다', () => {
        render(<RuntimeConnectionHost />);

        expect(mockKeepAlive).toHaveBeenCalledTimes(1);
    });

    it('RuntimeAuthHost는 살려 두지 않는다 — 명시 로그인 전까지 세션이 없어야 하는 표면', () => {
        render(<RuntimeAuthHost />);

        expect(mockKeepAlive).not.toHaveBeenCalled();
    });
});

describe('RuntimeConnectionHost', () => {
    it('binds the slots it derives from the session, with a delegate of its own', () => {
        render(
            <RuntimeConnectionHost>
                <div>Children</div>
            </RuntimeConnectionHost>
        );

        expect(mockedBootstrap).toHaveBeenCalledWith(
            expect.objectContaining({
                config: relayConfig,
                delegate: expect.objectContaining({ getAuthRegistration: expect.any(Function) }),
            })
        );
    });

    it('binds nothing before the session is ready, but runs the background half from mount', () => {
        mockReady = false;

        render(<RuntimeConnectionHost />);

        expect(mockInitialize).toHaveBeenCalledTimes(1);
        expect(mockedBootstrap).not.toHaveBeenCalled();
        expect(mockStartReceive).toHaveBeenCalledTimes(1);

        setReady(true);

        expect(mockedBootstrap).toHaveBeenCalledWith(expect.objectContaining({ config: relayConfig }));
        expect(mockStartReceive).toHaveBeenCalledTimes(1);
    });

    it("starts binding before the children's effects run", () => {
        const seenByChild: number[] = [];
        const Child = () => {
            useEffect(() => {
                seenByChild.push(mockedBootstrap.mock.calls.length);
            }, []);
            return null;
        };

        render(
            <RuntimeConnectionHost>
                <Child />
            </RuntimeConnectionHost>
        );

        expect(seenByChild).toEqual([1]);
    });

    it('stops both halves on unmount: the receive loops end and every boot is detached', async () => {
        const detachBoot = jest.fn();
        mockedBootstrap.mockResolvedValue(detachBoot);
        const { unmount } = render(<RuntimeConnectionHost />);
        await act(async () => undefined);

        unmount();

        expect(mockStopReceive).toHaveBeenCalledTimes(1);
        expect(detachBoot).toHaveBeenCalledTimes(1);
    });

    it("moves the active slot before the children's effects on a later change too", async () => {
        const subscribeCloud = (listener: () => void) => sessionSignal.subscribe(['cloud:token'], listener);
        const readSlots = () => getSocketSlotContext();
        const Above = ({ children }: { children: ReactNode }) => {
            useSyncExternalStore(subscribeCloud, readSlots);
            return <>{children}</>;
        };
        const activeSeenByChild: unknown[] = [];
        const Child = () => {
            const slots = useSyncExternalStore(subscribeCloud, readSlots);
            useEffect(() => {
                const calls = (getSocketManager().setActiveSlot as jest.Mock).mock.calls;
                activeSeenByChild.push(calls[calls.length - 1]?.[0]);
            }, [slots]);
            return null;
        };
        mockReady = false;
        const tree = () => (
            <Above>
                <RuntimeConnectionHost>
                    <Child />
                </RuntimeConnectionHost>
            </Above>
        );
        render(tree());
        setReady(true);
        expect(activeSeenByChild).toEqual([null]);

        mockedCommitted.mockReturnValue('cloud-a');
        mockedSlotContext.mockReturnValue({
            relay: { wss: 'wss://relay', identityToken: 'relay-token' },
            cloud: { cloudId: 'cloud-a', wss: 'wss://cloud-a', identityToken: 'cloud-token', isActive: true },
        } as never);
        act(() => sessionSignal.emit('cloud:token'));
        await act(async () => undefined);

        expect(activeSeenByChild).toEqual([null, 'cloud-a']);
    });

    it('survives StrictMode: one receive loop and one keep-alive left running, no socket destroyed', async () => {
        const detachBoots: jest.Mock[] = [];
        mockedBootstrap.mockImplementation(() => {
            const detach = jest.fn();
            detachBoots.push(detach);
            return Promise.resolve(detach);
        });

        render(
            <StrictMode>
                <RuntimeConnectionHost />
            </StrictMode>
        );
        await act(async () => undefined);

        expect(mockStartReceive).toHaveBeenCalledTimes(2);
        expect(mockStopReceive).toHaveBeenCalledTimes(1);
        expect(detachBoots).toHaveLength(2);
        expect(detachBoots.map(detach => detach.mock.calls.length)).toEqual([1, 0]);
        expect(getSocketManager().destroy).not.toHaveBeenCalled();
        expect(mockInitialize).toHaveBeenCalledTimes(2);
        expect(mockKeepAlive).toHaveBeenCalledTimes(2);
        expect(mockStopKeepAlive).toHaveBeenCalledTimes(1);
    });

    it('starts the guest keep-alive after the init, and stops it on unmount', () => {
        const order: string[] = [];
        mockInitialize.mockImplementationOnce(() => {
            order.push('init');
            return Promise.resolve();
        });
        mockKeepAlive.mockImplementationOnce(() => {
            order.push('keep-alive');
            return mockStopKeepAlive;
        });

        const { unmount } = render(<RuntimeConnectionHost />);
        expect(order).toEqual(['init', 'keep-alive']);

        unmount();
        expect(mockStopKeepAlive).toHaveBeenCalledTimes(1);
    });

    it('asks the engine it was handed for both controllers, with the resolved device id', () => {
        const session = {
            initialize: jest.fn(() => Promise.resolve()),
            isReady: () => false,
            subscribeReady: () => () => undefined,
            startGuestKeepAlive: jest.fn(() => () => undefined),
        };
        const connection = { startBackground: jest.fn(() => () => undefined) };
        const engine = {
            sessionController: jest.fn(() => session),
            connectionController: jest.fn(() => connection),
        };
        initAppRuntime(engine as unknown as RuntimeEngine);

        render(<RuntimeConnectionHost />);

        expect(engine.sessionController).toHaveBeenCalledTimes(1);
        expect(engine.connectionController).toHaveBeenCalledTimes(1);
        const [{ deviceId }] = engine.sessionController.mock.calls[0] as unknown as [{ deviceId: () => string }];
        expect(deviceId()).toBe('device-1');
        expect(session.initialize).toHaveBeenCalledTimes(1);
        expect(connection.startBackground).toHaveBeenCalledTimes(1);
    });
});
