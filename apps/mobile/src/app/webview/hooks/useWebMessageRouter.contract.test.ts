import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { renderHook } from '@testing-library/react';
import { WEB_MESSAGE_RESPONSE_TYPE, type BridgeError, type WebMessageType } from '@chatic/bridge-messages';
import { AppBridgeHost, InMemoryAdapter, JsonProtocol, WebBridgeClient } from '@chatic/bridges';

import { useWebMessageRouter } from './useWebMessageRouter';
import { useWebViewNavigation } from './useWebViewNavigation';

const NATIVE_LAUNCH_ONLY =
    "The runtime conversation; registered on its own (useRuntimeBridgeHandler) and only on a launch the app's runtime owns, which offers it in CHATIC_APP_RUNTIME";

const OWNER_SWITCH =
    'The session owner switch; registered on its own (useSessionOwnerHandler), and answered outside production or while debug mode is on';

const MOBILE_UNSUPPORTED = {
    ShowNotification: "Desktop's OS banner; the phone raises notifications from push, not on request",
    StartUpdateDownload: 'Desktop self-update; the phone updates through the store (CheckAppUpdate)',
    RestartToUpdate: 'Desktop self-update; the phone updates through the store (OpenStore)',
    FinishSubWebView: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    SetSubWebViewTitle: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    GetSubWebViewUserKey: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    SetSubWebViewCloseGuard: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    ReportSubWebViewError: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    GetSubWebViewStorage: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    SetSubWebViewStorage: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    RemoveSubWebViewStorage: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    ClearSubWebViewStorage: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    GetSubWebViewStorageInfo: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    GetSubWebViewPermission: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    RequestSubWebViewPermission: "A sub WebView page's request, answered by that view's own host (subWebView/)",
    RuntimeHello: NATIVE_LAUNCH_ONLY,
    RuntimeCall: NATIVE_LAUNCH_ONLY,
    RuntimeSubscribe: NATIVE_LAUNCH_ONLY,
    RuntimeUnsubscribe: NATIVE_LAUNCH_ONLY,
    FetchSessionOwner: OWNER_SWITCH,
    SetSessionOwner: OWNER_SWITCH,
    SetDefaultSessionOwner:
        "The page's default session owner; registered on its own (useSessionOwnerHandler) with the switch, and answered on every build",
} satisfies Partial<Record<WebMessageType, string>>;

const mockHandlers: Record<string, Record<string, unknown>> = {
    useFcmHandler: {
        handleFetchBadgeCount: async () => ({ type: 'OnFetchBadgeCount', success: true, data: { count: 7 } }),
        handleFetchBadgeBase: async () => ({ type: 'OnFetchBadgeCount', success: true, data: { count: 7 } }),
        handleFetchPushMarks: async () => {
            throw new Error('push marks unavailable');
        },
    },
    useLogHandler: { handleSendLog: jest.fn() },
};

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
    useAppStateHandler: () => ({ handleDismissResumeOverlay: jest.fn() }),
}));
jest.mock('../../bridge', () => ({ BackNavigationBridge: { setCanGoBack: jest.fn() } }));
jest.mock('./useAndroidBack', () => ({ useAndroidBack: jest.fn() }));
jest.mock('../../services', () => ({ subWebViewService: { current: () => null, subscribe: () => () => undefined } }));

const VOCABULARY = Object.keys(WEB_MESSAGE_RESPONSE_TYPE) as WebMessageType[];
const UNSUPPORTED = Object.keys(MOBILE_UNSUPPORTED);

const mountShell = (host: AppBridgeHost) =>
    renderHook(() => {
        useWebMessageRouter({ bridge: host });
        useWebViewNavigation(host);
    });

const registeredTypes = (): string[] => {
    const register = jest.spyOn(AppBridgeHost.prototype, 'registerHandler');
    const { unmount } = mountShell(new AppBridgeHost({ sendToWeb: jest.fn() }));
    const types = register.mock.calls.map(call => call[0] as string);
    unmount();
    register.mockRestore();
    return types;
};

describe('mobile bridge contract', () => {
    it('answers every request in the vocabulary, or lists it as unsupported', () => {
        const registered = new Set(registeredTypes());

        const undecided = VOCABULARY.filter(type => !registered.has(type) && !UNSUPPORTED.includes(type));

        expect(undecided).toEqual([]);
    });

    it('registers no handler for a request outside the vocabulary', () => {
        const stale = registeredTypes().filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    it('lists as unsupported only requests in the vocabulary', () => {
        const stale = UNSUPPORTED.filter(type => !(type in WEB_MESSAGE_RESPONSE_TYPE));

        expect(stale).toEqual([]);
    });

    it('registers handlers only in the hooks this suite mounts', () => {
        const allowed = [
            'useWebMessageRouter.ts',
            'useWebViewNavigation.ts',
            'useRuntimeBridgeHandler.ts',
            'useSessionOwnerHandler.ts',
            '../../subWebView/createSubBridgeHost.ts',
        ];
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

    it('answers the storage medium requests on the main WebView', () => {
        const registered = new Set(registeredTypes());

        expect(['StorageGet', 'StorageSave', 'StorageClear'].filter(type => !registered.has(type))).toEqual([]);
    });

    it('lists as unsupported only requests that have no handler', () => {
        const registered = new Set(registeredTypes());

        const handled = UNSUPPORTED.filter(type => registered.has(type));

        expect(handled).toEqual([]);
    });
});

describe('mobile bridge loopback', () => {
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
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockHandlers.useLogHandler.handleSendLog).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'SendLog', data: entry })
        );
    });

    it('rejects with a BridgeError when the handler throws', async () => {
        const failure = bridge.client.request({ type: 'FetchPushMarks', data: {} });

        await expect(failure).rejects.toEqual(
            expect.objectContaining<Partial<BridgeError>>({
                code: 'INTERNAL_ERROR',
                message: 'push marks unavailable',
                requestType: 'FetchPushMarks',
                expectedResponseType: 'OnFetchPushMarks',
            })
        );
    });

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

    it('advertises in the handshake exactly the requests it answers', async () => {
        const report = (await bridge.client.request({ type: 'WebAppReady', data: {} })).data;

        const handled = VOCABULARY.filter(type => !UNSUPPORTED.includes(type));
        expect([...report.supportedWebMessages].sort()).toEqual([...new Set(registeredTypes())].sort());
        expect([...report.supportedWebMessages].sort()).toEqual([...handled].sort());
        expect([...report.supportedAppMessages].sort()).toEqual(
            [...new Set(handled.map(type => WEB_MESSAGE_RESPONSE_TYPE[type]))].sort()
        );
    });

    it('answers Ping with Pong', async () => {
        const reply = await bridge.client.request({ type: 'Ping', data: { payload: 'probe' } });

        expect(reply).toEqual(expect.objectContaining({ type: 'Pong', success: true, data: { payload: 'probe' } }));
    });

    it.each(UNSUPPORTED)('answers unsupported %s with NOT_FOUND', async type => {
        const unanswered = bridge.client.request({ type, data: {} } as any);

        await expect(unanswered).rejects.toEqual(
            expect.objectContaining<Partial<BridgeError>>({ code: 'NOT_FOUND', requestType: type })
        );
    });
});
