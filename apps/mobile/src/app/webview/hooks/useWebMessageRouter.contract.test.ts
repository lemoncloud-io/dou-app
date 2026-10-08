import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { renderHook } from '@testing-library/react';
import { WEB_MESSAGE_RESPONSE_TYPE, type BridgeError, type WebMessageType } from '@chatic/app-messages';
import { AppBridgeHost, InMemoryAdapter, JsonProtocol, WebBridgeClient } from '@chatic/bridges';

import { useWebMessageRouter } from './useWebMessageRouter';
import { useWebViewNavigation } from './useWebViewNavigation';

/**
 * Requests in `WEB_MESSAGE_RESPONSE_TYPE` this shell deliberately leaves unregistered. The host
 * answers each with `NOT_FOUND`, which is what the web falls back on. A message belongs here only
 * by decision — a new one in `@chatic/app-messages` fails this suite until it has a handler or a
 * line here.
 */
const MOBILE_UNSUPPORTED = {
    OpenModal: 'Declared, but no web build sends it',
    CloseModal: 'Declared, but no web build sends it',
    ShowLoader: 'Declared, but no web build sends it',
    HideLoader: 'Declared, but no web build sends it',
    SyncCredential: 'Declared, but no web build sends it',
    PopWebView: 'Declared, but no web build sends it',
    Ping: "Debug overlay's round-trip probe; the NOT_FOUND reply already proves the channel",
    ShowNotification: "Desktop's OS banner; the phone raises notifications from push, not on request",
    StartUpdateDownload: 'Desktop self-update; the phone updates through the store (CheckAppUpdate)',
    RestartToUpdate: 'Desktop self-update; the phone updates through the store (OpenStore)',
} satisfies Partial<Record<WebMessageType, string>>;

// Per-handler behaviour for the loopback cases below; every other handler is a bare mock.
const mockHandlers: Record<string, Record<string, unknown>> = {
    useFcmHandler: {
        handleFetchBadgeCount: async () => ({ type: 'OnFetchBadgeCount', success: true, data: { count: 7 } }),
        // The reply of a different request — what a handler wired to the wrong message would send.
        handleFetchBadgeBase: async () => ({ type: 'OnFetchBadgeCount', success: true, data: { count: 7 } }),
    },
    useSafeAreaHandler: {
        fetchSafeAreaInfo: async () => {
            throw new Error('insets unavailable');
        },
    },
    useLogHandler: { handleSendLog: jest.fn() },
};

// Every domain hook becomes a stub (the real ones reach native modules and the service provider).
// Capability flags read true, so the handlers registered only where a native module exists count
// as handled — they are, on a build that has the module.
jest.mock('./index', () => {
    const stubHook = (hook: string) =>
        new Proxy(
            {},
            {
                get: (_target, name) => {
                    if (name === 'then') return undefined;
                    const pinned = mockHandlers[hook]?.[name as string];
                    if (pinned !== undefined) return pinned;
                    if (name === 'isAvailable' || String(name).startsWith('can')) return true;
                    return jest.fn();
                },
            }
        );
    return new Proxy(
        {},
        {
            get: (_target, name) => (name === '__esModule' ? true : () => stubHook(name as string)),
        }
    );
});

jest.mock('./useAppStateHandler', () => ({
    useAppStateHandler: () => ({ handleFetchBackgroundStatus: jest.fn(), handleDismissResumeOverlay: jest.fn() }),
}));
jest.mock('../../bridge', () => ({ BackNavigationBridge: { setCanGoBack: jest.fn() } }));
jest.mock('./useAndroidBack', () => ({ useAndroidBack: jest.fn() }));

const VOCABULARY = Object.keys(WEB_MESSAGE_RESPONSE_TYPE) as WebMessageType[];
const UNSUPPORTED = Object.keys(MOBILE_UNSUPPORTED);

/** Every hook that registers on the bridge — the router (`AppWebView`) and `SetCanGoBack` (`MainScreen`). */
const mountShell = (host: AppBridgeHost) =>
    renderHook(() => {
        useWebMessageRouter({ bridge: host });
        useWebViewNavigation(host);
    });

describe('mobile bridge contract', () => {
    // Read off a real host, so `WebAppReady` — answered inside `AppBridgeHost` — counts too.
    const registeredTypes = (): string[] => {
        const register = jest.spyOn(AppBridgeHost.prototype, 'registerHandler');
        const { unmount } = mountShell(new AppBridgeHost({ sendToWeb: jest.fn() }));
        const types = register.mock.calls.map(call => call[0] as string);
        unmount();
        register.mockRestore();
        return types;
    };

    it('answers every request in the vocabulary, or lists it as unsupported', () => {
        const registered = new Set(registeredTypes());

        const undecided = VOCABULARY.filter(type => !registered.has(type) && !UNSUPPORTED.includes(type));

        expect(undecided).toEqual([]);
    });

    it('registers no handler for a request outside the vocabulary', () => {
        const stale = registeredTypes().filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    // The `satisfies` above says the same, but only to tsc — and CI does not type check this
    // project, nor does this suite's transform report it.
    it('lists as unsupported only requests in the vocabulary', () => {
        const stale = UNSUPPORTED.filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    // A handler registered anywhere else is invisible to the checks above, so a message already
    // listed as unsupported could gain one without failing them.
    it('registers handlers only in the hooks this suite mounts', () => {
        const allowed = ['useWebMessageRouter.ts', 'useWebViewNavigation.ts'];
        const appRoot = join(__dirname, '../..');
        const sources = (dir: string): string[] =>
            readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
                entry.isDirectory() ? sources(join(dir, entry.name)) : [join(dir, entry.name)]
            );

        const elsewhere = sources(appRoot)
            .filter(file => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
            .filter(file => readFileSync(file, 'utf8').includes('.registerHandler('))
            .map(file => relative(__dirname, file))
            .filter(file => !allowed.includes(file));

        expect(elsewhere).toEqual([]);
    });

    it('lists as unsupported only requests that have no handler', () => {
        const registered = new Set(registeredTypes());

        const handled = UNSUPPORTED.filter(type => registered.has(type));

        expect(handled).toEqual([]);
    });
});

describe('mobile bridge loopback', () => {
    // The real web client, in-memory channel and host, with the real router behind them: what a
    // caller here receives is what a web caller in the WebView receives.
    const connect = () => {
        const adapter = new InMemoryAdapter();
        const host = new AppBridgeHost({
            sendToWeb: raw => adapter.receiveFromApp(JsonProtocol.decode(raw) as any),
        });
        adapter.setAppHost(host);
        const client = new WebBridgeClient({ adapter, isBridgeAvailable: () => true, timeoutMs: 1000 });
        const shell = mountShell(host);
        return {
            client,
            close: () => {
                shell.unmount();
                client.destroy();
            },
        };
    };

    let bridge: ReturnType<typeof connect>;
    beforeEach(() => {
        bridge = connect();
    });
    afterEach(() => bridge.close());

    it("resolves a request with its handler's reply", async () => {
        const reply = await bridge.client.request({ type: 'FetchBadgeCount', data: {} });

        expect(reply).toEqual(
            expect.objectContaining({ type: 'OnFetchBadgeCount', success: true, data: { count: 7 } })
        );
    });

    it('delivers a fire-and-forget message to its handler', async () => {
        const entry = { level: 'info' as const, tag: 'BRIDGE', message: 'loopback' };

        bridge.client.post({ type: 'SendLog', data: entry });
        // The adapter delivers on a zero timer and the host calls the handler without awaiting
        // anything first, so one more turn is enough.
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockHandlers.useLogHandler.handleSendLog).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'SendLog', data: entry })
        );
    });

    it('rejects with a BridgeError when the handler throws', async () => {
        const failure = bridge.client.request({ type: 'FetchSafeArea', data: {} });

        await expect(failure).rejects.toEqual(
            expect.objectContaining<Partial<BridgeError>>({
                code: 'INTERNAL_ERROR',
                message: 'insets unavailable',
                requestType: 'FetchSafeArea',
                expectedResponseType: 'OnFetchSafeArea',
            })
        );
    });

    // The guard that keeps a caller from reading one message's payload as another's.
    it('rejects a reply of the wrong type as RESPONSE_TYPE_MISMATCH', async () => {
        const mismatch = bridge.client.request({ type: 'FetchBadgeBase', data: {} });

        await expect(mismatch).rejects.toEqual(
            expect.objectContaining<Partial<BridgeError>>({
                code: 'RESPONSE_TYPE_MISMATCH',
                requestType: 'FetchBadgeBase',
                expectedResponseType: 'OnFetchBadgeBase',
                actualResponseType: 'OnFetchBadgeCount',
            })
        );
    });

    // What the list above promises the web: an answer, and the one it knows to fall back on.
    it.each(UNSUPPORTED)('answers unsupported %s with NOT_FOUND', async type => {
        const unanswered = bridge.client.request({ type, data: {} } as any);

        await expect(unanswered).rejects.toEqual(
            expect.objectContaining<Partial<BridgeError>>({ code: 'NOT_FOUND', requestType: type })
        );
    });
});
