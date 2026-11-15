/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
import type { IAppBridgeHost } from '@chatic/bridges';
import { RUNTIME_CONTRACTS } from '@chatic/runtime-mobile';

import { pushedEventErrors, pushedEvents } from '../../webview/hooks/appEventContract';
import { createAppRuntimeBridge } from './runtimeBridge';

// The runtime package reads these at import; nothing here reaches them.
jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn() },
    Platform: { OS: 'ios' },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(), fetch: jest.fn() }));
jest.mock('../provider', () => ({ provider: { logService: { warn: jest.fn() } } }));

const mockStart = jest.fn();
jest.mock('./nativeRuntime', () => ({ nativeRuntimeHost: { start: () => mockStart() } }));

const sessionListeners = new Set<() => void>();
const engine = {
    session: {
        snapshot: () => ({ auth: { isAuthenticated: true } }),
        subscribe: (listener: () => void) => {
            sessionListeners.add(listener);
            return () => sessionListeners.delete(listener);
        },
        onLogout: () => () => undefined,
    },
    commands: { switchSite: jest.fn(async () => undefined) },
    data: {
        observeStateOutbox: (observer: (sample: unknown) => void) => {
            outboxObservers.add(observer);
            return () => outboxObservers.delete(observer);
        },
    },
};
const outboxObservers = new Set<(sample: unknown) => void>();

const fakeBridge = () => ({ pushEvent: jest.fn() }) as unknown as IAppBridgeHost & { pushEvent: jest.Mock };

describe('createAppRuntimeBridge', () => {
    beforeEach(() => mockStart.mockReset());

    it('starts the runtime at the first hello and answers native', async () => {
        mockStart.mockResolvedValue(engine);
        const { handlers } = createAppRuntimeBridge(fakeBridge());

        await expect(
            handlers.RuntimeHello({ type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } } as never)
        ).resolves.toEqual({
            type: 'OnRuntimeHello',
            success: true,
            data: {
                sessionOwner: 'native',
                contract: RUNTIME_CONTRACTS[0],
                seq: 0,
                session: { auth: { isAuthenticated: true } },
            },
        });
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('answers a failure as the bridge expects one, and pushes session changes as events', async () => {
        mockStart.mockResolvedValue(engine);
        const bridge = fakeBridge();
        const { handlers } = createAppRuntimeBridge(bridge);

        await expect(
            handlers.RuntimeCall({
                type: 'RuntimeCall',
                data: { target: 'session', method: 'switchSite', args: ['s'] },
            } as never)
        ).resolves.toMatchObject({ type: 'OnRuntimeCall', success: false, error: { code: 'RUNTIME_NOT_STARTED' } });

        await handlers.RuntimeHello({ type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } } as never);
        sessionListeners.forEach(listener => listener());
        await Promise.resolve();

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnRuntimeSessionChanged',
            success: true,
            data: { seq: 1, signals: ['session'], session: { auth: { isAuthenticated: true } } },
        });
    });

    it("pushes a subscription's events as 'OnRuntimeEvent', in the shape the vocabulary declares", async () => {
        mockStart.mockResolvedValue(engine);
        const bridge = fakeBridge();
        const { handlers } = createAppRuntimeBridge(bridge);
        await handlers.RuntimeHello({ type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } } as never);

        await expect(
            handlers.RuntimeSubscribe({
                type: 'RuntimeSubscribe',
                data: {
                    subscriptionId: 'o1',
                    target: 'data',
                    topic: 'observeStateOutbox',
                    args: [{ $listener: true }],
                },
            } as never)
        ).resolves.toEqual({ type: 'OnRuntimeSubscribe', success: true, data: {} });
        outboxObservers.forEach(observer => observer({ queued: 1 }));
        sessionListeners.forEach(listener => listener());
        await Promise.resolve();

        expect(bridge.pushEvent).toHaveBeenCalledWith({
            type: 'OnRuntimeEvent',
            success: true,
            data: { subscriptionId: 'o1', seq: 1, event: [{ queued: 1 }] },
        });
        expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
    });
});
