/**
 * @jest-environment node
 */
// Node, not jsdom: the runtime's socket client needs `TextEncoder`, which jsdom leaves out.
import type { SubWebViewRuntimePermission } from '@chatic/bridge-messages';
import { SDK_RUNTIME_CONTRACTS, type ChaticAppsError } from '@chatic/chatic-apps-sdk';
import { connectOver, type Transport } from '@chatic/chatic-apps-sdk/internal';
import { RUNTIME_CONTRACTS, createRuntimeBridgeHost, type RuntimeEngine } from '@chatic/runtime-mobile';

import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubWebViewRuntimeBridge } from './subWebViewRuntimeBridge';
import type { SubWebViewReadBudget } from './subWebViewReadBudget';

// The runtime package reads these at import; nothing here reaches them.
jest.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: jest.fn() },
    Platform: { OS: 'ios' },
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(), fetch: jest.fn() }));

/**
 * The library pages are built with, reading the app's runtime through this app's real page host, the
 * sub WebView's runtime bridge and the runtime's own bridge host, in one process — only the engine
 * behind them is a stand-in. What the library sends is what the whitelist passes and the runtime
 * answers; a change on either side that breaks a page's read fails here.
 */

const setup = ({
    granted = ['channel'] as SubWebViewRuntimePermission[],
    budget = { take: () => ({ ok: true }) } as SubWebViewReadBudget,
} = {}) => {
    let cloudId = 'c1';
    const sessionListeners = new Set<() => void>();
    const roomListeners = new Set<(result: unknown) => void>();
    const engine = {
        session: {
            snapshot: () => ({
                context: {
                    cloud: { cloudId, siteId: 's1', isActive: true },
                    identity: { userId: 'u1', isAuthenticated: true },
                },
                committedSiteId: 's1',
            }),
            subscribe: (listener: () => void) => {
                sessionListeners.add(listener);
                return () => sessionListeners.delete(listener);
            },
            onLogout: () => () => undefined,
        },
        data: {
            repositories: () => ({
                channel: {
                    cacheReadList: async (query: unknown) => ({ list: [{ id: 'ch1', name: 'General' }], query }),
                    fetchList: async () => ({ list: [] }),
                    observeList: (_query: unknown, listener: (result: unknown) => void) => {
                        roomListeners.add(listener);
                        return () => roomListeners.delete(listener);
                    },
                },
            }),
        },
    } as unknown as RuntimeEngine;

    let toPage: ((message: string) => void) | undefined;
    let host: ReturnType<typeof createSubBridgeHost> | null = null;
    const pageHost = () => host;
    const runtime = createSubWebViewRuntimeBridge({
        createHost: send => createRuntimeBridgeHost({ engine: async () => engine, send }),
        session: engine.session,
        openedCloudId: 'c1',
        granted: new Set(granted),
        origin: 'https://quiz.apps.chatic.io',
        pageHost,
        consent: { ensure: async () => 'allowed' },
        budget,
    });
    host = createSubBridgeHost(
        // Asynchronous, as the WebView is.
        message => queueMicrotask(() => toPage?.(message)),
        runtime.handlers,
        () => ({
            protocolVersion: 1,
            viewId: 'view-1',
            platform: 'ios',
            appVersion: '0.31.0',
            locale: 'ko',
            theme: 'light',
            params: {},
        })
    );
    const transport: Transport = {
        send: message => void host?.handleMessage(message),
        listen: listener => {
            toPage = listener;
            return () => (toPage = undefined);
        },
    };
    return {
        transport,
        runtime,
        emitRooms: (result: unknown) => roomListeners.forEach(listener => listener(result)),
        moveTo: (next: string) => {
            cloudId = next;
            sessionListeners.forEach(listener => listener());
        },
    };
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('chatic-apps-sdk reading the runtime through the page host', () => {
    it('speaks the runtime contracts this app does', () => {
        expect(SDK_RUNTIME_CONTRACTS).toEqual(RUNTIME_CONTRACTS);
    });

    it('connects and reads what the whitelist opens for its permissions', async () => {
        const { transport } = setup();
        const apps = await connectOver(transport, { reportErrors: false });

        expect(apps.supports('runtime')).toBe(true);
        const connection = await apps.runtime.connect();
        expect(connection.allowed.calls).toContain('channel.cacheReadList');
        expect(connection.allowed.calls).not.toContain('chat.getChat');

        await expect(apps.runtime.call('channel.cacheReadList', { sid: 's1' })).resolves.toEqual({
            list: [{ id: 'ch1', name: 'General' }],
            query: { sid: 's1' },
        });
        apps.disconnect();
    });

    it("hears a stream's events, and its end when the cloud changes", async () => {
        const { transport, emitRooms, moveTo } = setup();
        const apps = await connectOver(transport, { reportErrors: false });
        const listener = jest.fn();
        const onEnd = jest.fn();
        const onCloudChanged = jest.fn();
        apps.runtime.onCloudChanged(onCloudChanged);

        await apps.runtime.subscribe('channel.observeList', [{ sid: 's1' }], listener, onEnd);
        emitRooms({ list: [{ id: 'ch2' }] });
        await settle();
        expect(listener).toHaveBeenCalledWith({ list: [{ id: 'ch2' }] });

        moveTo('c2');
        await settle();
        expect((onEnd.mock.calls[0]?.[0] as ChaticAppsError | undefined)?.code).toBe('CLOUD_CHANGED');
        expect(onCloudChanged).toHaveBeenCalledTimes(1);
        apps.disconnect();
    });

    it("hands the host's refusal back with its details", async () => {
        const { transport } = setup({ budget: { take: () => ({ ok: false, retryAfterMs: 90 }) } });
        const apps = await connectOver(transport, { reportErrors: false });

        await expect(apps.runtime.call('channel.fetchList', {})).rejects.toEqual(
            expect.objectContaining({ code: 'RATE_LIMITED', details: { retryAfterMs: 90 } })
        );
        apps.disconnect();
    });

    it('gives the session only with `session`', async () => {
        const without = setup({ granted: ['channel'] });
        const apps = await connectOver(without.transport, { reportErrors: false });
        await apps.runtime.connect();
        expect(apps.runtime.session()).toBeNull();
        apps.disconnect();

        const withIt = setup({ granted: ['session'] });
        const other = await connectOver(withIt.transport, { reportErrors: false });
        await other.runtime.connect();
        expect(other.runtime.session()).toEqual(expect.objectContaining({ context: expect.anything() }));
        other.disconnect();
    });
});
