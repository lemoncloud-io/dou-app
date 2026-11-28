import React from 'react';
import { act, render } from '@testing-library/react';
import { BRIDGE_VERSION, JsonProtocol } from '@chatic/bridges';

import { pushedEventErrors } from '../webview/hooks/appEventContract';
import { SUB_WEBVIEW_SAFE_AREA_SETTLE_MS, SubWebView, type SubWebViewHandle } from './SubWebView';
import { deriveSubWebViewUserKey } from './subWebViewUserKey';

let mockWebViewProps: Record<string, any> = {};
const mockPostMessage = jest.fn();
const mockGoBack = jest.fn();
const mockReload = jest.fn();
const mockInjectJavaScript = jest.fn();
let mockBackListener: (() => boolean) | undefined;
const mockOpenURL = jest.fn(() => Promise.resolve());
let mockTheme: 'light' | 'dark' = 'light';

jest.mock('react-native-webview', () => {
    const { forwardRef, useImperativeHandle } = jest.requireActual('react');
    return {
        WebView: forwardRef((props: Record<string, unknown>, ref: unknown) => {
            mockWebViewProps = props;
            useImperativeHandle(ref, () => ({
                postMessage: mockPostMessage,
                goBack: mockGoBack,
                reload: mockReload,
                injectJavaScript: mockInjectJavaScript,
            }));
            return null;
        }),
    };
});
jest.mock('react-native', () => ({
    BackHandler: {
        addEventListener: jest.fn((_event: string, listener: () => boolean) => {
            mockBackListener = listener;
            return { remove: jest.fn() };
        }),
    },
    Linking: { openURL: (url: string) => mockOpenURL(url) },
    Platform: { OS: 'android' },
    StyleSheet: { create: (styles: unknown) => styles },
    AppState: {
        get currentState() {
            return mockAppState;
        },
    },
}));
let mockAppState = 'active';
const MOCK_DEVICE_ID = '6E1C3B0A-9D2F-4C8E-B7A1-2F5D8E3C4B6A';
jest.mock('react-native-device-info', () => ({
    __esModule: true,
    default: { getVersion: () => '0.30.1', getUniqueIdSync: () => MOCK_DEVICE_ID },
}));
jest.mock('../hooks', () => ({
    useResolvedTheme: () => ({ backgroundColor: '#FFFFFF', resolvedTheme: mockTheme }),
}));
jest.mock('../services', () => ({
    logger: { warn: jest.fn() },
    clipboardService: { setText: jest.fn(async () => undefined) },
    subWebViewService: { close: jest.fn(() => ({ ok: true })) },
    deviceService: {
        openShareSheet: jest.fn(async () => ({ action: 'sharedAction' })),
        openSettings: jest.fn(async () => true),
    },
    permissionService: { status: jest.fn(async () => 'DENIED'), request: jest.fn(async () => 'GRANTED') },
}));
jest.mock('../stores', () => ({
    useLanguageStore: (select: (state: { preference: string }) => unknown) => select({ preference: 'ko' }),
    resolveAppLanguage: (preference: string, device: string) => (preference === 'system' ? device : preference),
}));
jest.mock('../utils/device', () => ({ getAppLanguage: () => 'en' }));
jest.mock('react-native-config', () => ({ __esModule: true, default: { VITE_ENV: 'PROD' } }));
jest.mock('../bridge', () => ({ HapticBridge: { trigger: jest.fn(() => true) } }));
jest.mock('../services/subWebView/subWebViewStorageFile', () => {
    const { SubWebViewStorage } = jest.requireActual('../services/subWebView/subWebViewStorage');
    const { memoryStorageFile } = jest.requireActual('../services/subWebView/memoryStorageFile');
    return { openSubWebViewStorage: jest.fn(() => new SubWebViewStorage(memoryStorageFile())) };
});
let mockRuntimeAccess: unknown = null;
const mockOpenRuntime = jest.fn((_input: unknown) => mockRuntimeAccess);
jest.mock('./subWebViewRuntimeAccess', () => ({ openSubWebViewRuntime: (input: unknown) => mockOpenRuntime(input) }));
const mockRuntimeDispose = jest.fn();
const mockCreateRuntimeBridge = jest.fn((_deps: unknown) => ({
    handlers: {
        RuntimeHello: async () => ({ type: 'OnRuntimeHello', success: true, data: { sessionOwner: 'native' } }),
        RuntimeCall: async () => ({ type: 'OnRuntimeCall', success: true, data: { value: null } }),
        RuntimeSubscribe: async () => ({ type: 'OnRuntimeSubscribe', success: true, data: {} }),
        RuntimeUnsubscribe: async () => ({ type: 'OnRuntimeUnsubscribe', success: true, data: {} }),
    },
    dispose: mockRuntimeDispose,
}));
jest.mock('./subWebViewRuntimeBridge', () => ({
    createAppSubWebViewRuntimeBridge: (deps: unknown) => mockCreateRuntimeBridge(deps),
}));
jest.mock('@chatic/shared', () => jest.requireActual('../../../../../libs/mini-app/protocol/src/subWebViewLink'));

const URL_ = 'https://foo.apps.chatic.io/a';

const ALL_PERMISSIONS = new Set(['clipboard', 'share', 'openUrl', 'userKey'] as const);
const NO_RUNTIME = new Set<never>();

const renderView = (props: Partial<React.ComponentProps<typeof SubWebView>> = {}) =>
    render(
        <SubWebView
            viewId="view-1"
            url={URL_}
            params={{ orderId: 7 }}
            permissions={ALL_PERMISSIONS}
            runtimePermissions={NO_RUNTIME}
            trust="reviewed"
            onRequestClose={jest.fn()}
            {...props}
        />
    );

const pageMessage = (url: string, type: string, data: unknown) => ({
    nativeEvent: { url, data: JsonProtocol.encode({ type, refId: `r-${type}`, version: BRIDGE_VERSION, data } as any) },
});

const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

const sentTypes = () => mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw).type);

const runtime = globalThis as { __DEV__?: boolean };

describe('SubWebView', () => {
    beforeEach(() => {
        runtime.__DEV__ = true;
        mockWebViewProps = {};
        mockPostMessage.mockClear();
        mockGoBack.mockClear();
        mockInjectJavaScript.mockClear();
        mockOpenURL.mockClear();
        mockBackListener = undefined;
        mockTheme = 'light';
        mockRuntimeAccess = null;
        mockOpenRuntime.mockClear();
        mockCreateRuntimeBridge.mockClear();
        mockRuntimeDispose.mockClear();
    });

    describe('the runtime requests', () => {
        const RUNTIME = ['RuntimeHello', 'RuntimeCall', 'RuntimeSubscribe', 'RuntimeUnsubscribe'];
        const supported = () => {
            const ready = mockPostMessage.mock.calls
                .map(([raw]) => JSON.parse(raw))
                .find(reply => reply.type === 'OnWebAppReady');
            return ready.data.supportedWebMessages as string[];
        };

        it('asks the gate once as the view opens, with its trust and runtime permissions', () => {
            const runtimePermissions = new Set(['channel'] as const);
            renderView({ runtimePermissions, trust: 'external' });

            act(() => mockWebViewProps.onLoadStart());

            expect(mockOpenRuntime).toHaveBeenCalledTimes(1);
            expect(mockOpenRuntime).toHaveBeenCalledWith({ trust: 'external', permissions: runtimePermissions });
        });

        it('registers none of them when the gate grants nothing', async () => {
            renderView();

            mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
            await settle();

            expect(supported()).not.toContain('RuntimeHello');
            expect(mockCreateRuntimeBridge).not.toHaveBeenCalled();
        });

        it('registers them for the opened origin and cloud, one bridge per page load, each disposed with it', async () => {
            mockRuntimeAccess = {
                engine: { session: { snapshot: jest.fn(), subscribe: jest.fn() } },
                openedCloudId: 'c1',
                openedPlaceId: 's1',
                granted: new Set(['channel']),
                budget: { take: jest.fn() },
                sends: { take: jest.fn() },
                reactions: { take: jest.fn() },
                consent: { ensure: jest.fn() },
            };
            const view = renderView({ runtimePermissions: new Set(['channel'] as const) });

            mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
            await settle();
            expect(supported()).toEqual(expect.arrayContaining(RUNTIME));
            expect(mockCreateRuntimeBridge).toHaveBeenCalledWith(
                expect.objectContaining({
                    origin: 'https://foo.apps.chatic.io',
                    access: expect.objectContaining({ openedCloudId: 'c1' }),
                })
            );

            act(() => mockWebViewProps.onLoadStart());
            expect(mockCreateRuntimeBridge).toHaveBeenCalledTimes(2);
            expect(mockRuntimeDispose).toHaveBeenCalledTimes(1);

            view.unmount();
            expect(mockRuntimeDispose).toHaveBeenCalledTimes(2);
        });
    });

    it('injects only its own context, under the platform user agent', () => {
        renderView();

        const script = mockWebViewProps.injectedJavaScriptBeforeContentLoaded as string;
        expect(script).toContain("'ChaticSubWebView'");
        expect(script).toContain('\\"orderId\\":7');
        expect(script).toContain('\\"locale\\":\\"ko\\"');
        expect(script).not.toMatch(/CHATIC_APP_|ChaticMessageHandler/);
        expect(mockWebViewProps.injectedJavaScript).toBe(script);
        expect(mockWebViewProps.applicationNameForUserAgent).toBeUndefined();
        expect(mockWebViewProps.userAgent).toBeUndefined();
    });

    describe('safe-area insets', () => {
        const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

        it('tells a page nothing of the insets when the screen pads the view', () => {
            renderView();

            expect(mockWebViewProps.injectedJavaScriptBeforeContentLoaded).not.toContain('--chatic-safe-area-inset');
            expect(mockInjectJavaScript).not.toHaveBeenCalled();
        });

        it('tells an immersive page its insets with every load, at both injection points', () => {
            renderView({ display: 'immersive', insets: INSETS });

            const script = mockWebViewProps.injectedJavaScriptBeforeContentLoaded as string;
            expect(script).toContain("'ChaticSubWebView'");
            expect(script).toContain('"--chatic-safe-area-inset-top", "47px"');
            expect(script).toContain('"--chatic-safe-area-inset-bottom", "34px"');
            expect(mockWebViewProps.injectedJavaScript).toBe(script);
        });

        it('pushes the insets to the page again when they change', () => {
            const view = renderView({ display: 'immersive', insets: INSETS });
            mockInjectJavaScript.mockClear();

            view.rerender(
                <SubWebView
                    viewId="view-1"
                    url={URL_}
                    params={{ orderId: 7 }}
                    permissions={ALL_PERMISSIONS}
                    runtimePermissions={NO_RUNTIME}
                    trust="reviewed"
                    onRequestClose={jest.fn()}
                    display="immersive"
                    insets={{ top: 0, bottom: 21, left: 47, right: 47 }}
                />
            );

            expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
            expect(mockInjectJavaScript.mock.calls[0][0]).toContain('"--chatic-safe-area-inset-left", "47px"');
        });

        const handshakeContext = async () => {
            mockPostMessage.mockClear();
            mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
            await settle();
            const [reply] = mockPostMessage.mock.calls.find(([raw]) => raw.includes('OnWebAppReady')) ?? ['null'];
            return JSON.parse(reply)?.data.subWebView;
        };

        const rotateTo = (view: ReturnType<typeof renderView>, insets: typeof INSETS) =>
            view.rerender(
                <SubWebView
                    viewId="view-1"
                    url={URL_}
                    params={{ orderId: 7 }}
                    permissions={ALL_PERMISSIONS}
                    runtimePermissions={NO_RUNTIME}
                    trust="reviewed"
                    onRequestClose={jest.fn()}
                    display="immersive"
                    insets={insets}
                />
            );

        const contextPushes = () =>
            mockPostMessage.mock.calls
                .map(([raw]) => JSON.parse(raw))
                .filter(message => message.type === 'OnSubWebViewContextChanged')
                .map(message => message.data);

        it('tells an immersive page its display and the insets the custom properties carry', async () => {
            renderView({ display: 'immersive', insets: { ...INSETS, left: Number.NaN, right: -3 } });

            const context = await handshakeContext();
            expect(context.display).toBe('immersive');
            expect(context.safeArea).toEqual({ top: 47, right: 0, bottom: 34, left: 0 });
            const script = mockWebViewProps.injectedJavaScriptBeforeContentLoaded as string;
            expect(script).toContain('"--chatic-safe-area-inset-left", "0px"');
            expect(script).toContain('"--chatic-safe-area-inset-right", "0px"');
            expect(script).toContain('\\"safeArea\\":{\\"top\\":47,\\"right\\":0,\\"bottom\\":34,\\"left\\":0}');
        });

        it.each(['titled', 'clean'] as const)(
            'tells a %s page 0 on every edge, as the shell pads it',
            async display => {
                renderView({ display, insets: INSETS });

                const context = await handshakeContext();
                expect(context.display).toBe(display);
                expect(context.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
            }
        );

        it('pushes a safe-area change once the insets settle, with the whole context', async () => {
            const view = renderView({ display: 'immersive', insets: INSETS });
            await handshakeContext();
            mockPostMessage.mockClear();
            jest.useFakeTimers();
            try {
                rotateTo(view, { top: 20, bottom: 21, left: 47, right: 47 });
                act(() => jest.advanceTimersByTime(SUB_WEBVIEW_SAFE_AREA_SETTLE_MS - 50));
                rotateTo(view, { top: 0, bottom: 21, left: 47, right: 47 });
                act(() => jest.advanceTimersByTime(SUB_WEBVIEW_SAFE_AREA_SETTLE_MS - 50));
                expect(contextPushes()).toEqual([]);

                act(() => jest.advanceTimersByTime(50));
                expect(contextPushes()).toEqual([
                    { locale: 'ko', theme: 'light', safeArea: { top: 0, right: 47, bottom: 21, left: 47 } },
                ]);

                rotateTo(view, { top: 0, bottom: 21, left: 47, right: 47 });
                act(() => jest.advanceTimersByTime(SUB_WEBVIEW_SAFE_AREA_SETTLE_MS * 2));
                expect(contextPushes()).toHaveLength(1);
            } finally {
                jest.useRealTimers();
            }
            expect((await handshakeContext()).safeArea).toEqual({ top: 0, right: 47, bottom: 21, left: 47 });
        });

        it('pushes nothing when a rotation settles back where it started', () => {
            const view = renderView({ display: 'immersive', insets: INSETS });
            jest.useFakeTimers();
            try {
                rotateTo(view, { top: 0, bottom: 21, left: 47, right: 47 });
                act(() => jest.advanceTimersByTime(50));
                rotateTo(view, INSETS);
                act(() => jest.advanceTimersByTime(SUB_WEBVIEW_SAFE_AREA_SETTLE_MS * 2));
            } finally {
                jest.useRealTimers();
            }
            expect(contextPushes()).toEqual([]);
        });

        it('keeps the scroll view from insetting the content itself', () => {
            renderView();

            expect(mockWebViewProps.contentInsetAdjustmentBehavior).toBe('never');
        });
    });

    it('lets every navigation reach its own check', () => {
        renderView();

        expect(mockWebViewProps.originWhitelist).toEqual(['*']);
    });

    it('is inspectable in a development build, as the main WebView is', () => {
        renderView();

        expect(mockWebViewProps.webviewDebuggingEnabled).toBe(true);
    });

    it('is not inspectable in a release build', () => {
        runtime.__DEV__ = false;
        renderView();

        expect(mockWebViewProps.webviewDebuggingEnabled).toBe(false);
    });

    it('answers the page on the origin it was opened on', async () => {
        renderView();

        mockWebViewProps.onMessage(pageMessage('https://foo.apps.chatic.io/orders', 'WebAppReady', {}));
        await settle();

        expect(sentTypes()).toEqual(['OnWebAppReady']);
    });

    it.each(['https://bar.apps.chatic.io/', 'https://evil.example/'])('drops a message from %s', async url => {
        renderView();

        mockWebViewProps.onMessage(pageMessage(url, 'WebAppReady', {}));
        await settle();

        expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('hands a title the page asks for to the screen', async () => {
        const onTitleRequest = jest.fn();
        renderView({ onTitleRequest });

        mockWebViewProps.onMessage(pageMessage(URL_, 'SetSubWebViewTitle', { title: 'Orders' }));
        await settle();

        expect(onTitleRequest).toHaveBeenCalledWith('Orders');
    });

    it("ignores a title the previous load's host answers after a new page started", async () => {
        const onTitleRequest = jest.fn();
        renderView({ onTitleRequest });
        const previousLoadOnMessage = mockWebViewProps.onMessage;

        act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
        onTitleRequest.mockClear();
        previousLoadOnMessage(pageMessage(URL_, 'SetSubWebViewTitle', { title: 'Stale' }));
        await settle();

        expect(onTitleRequest).not.toHaveBeenCalled();
    });

    it("opens the app's share sheet for the page", async () => {
        const { deviceService } = jest.requireMock('../services');
        renderView();

        mockWebViewProps.onMessage(
            pageMessage(URL_, 'OpenShareSheet', { message: 'I scored 12', url: 'https://foo.apps.chatic.io/' })
        );
        await settle();

        expect(deviceService.openShareSheet).toHaveBeenCalledWith({
            title: undefined,
            message: 'I scored 12',
            url: 'https://foo.apps.chatic.io/',
        });
        expect(sentTypes()).toContain('OnOpenShareSheet');
    });

    it('answers the page a key for its opened origin, never the device id', async () => {
        renderView();

        mockWebViewProps.onMessage(pageMessage('https://foo.apps.chatic.io/save', 'GetSubWebViewUserKey', {}));
        await settle();

        const [raw] = mockPostMessage.mock.calls[0];
        expect(JSON.parse(raw)).toEqual(
            expect.objectContaining({
                type: 'OnGetSubWebViewUserKey',
                success: true,
                data: { key: deriveSubWebViewUserKey(MOCK_DEVICE_ID, 'https://foo.apps.chatic.io') },
            })
        );
        expect(raw).not.toContain(MOCK_DEVICE_ID);
    });

    it('answers only what the manifest permits beyond the base set', async () => {
        renderView({ permissions: new Set(['share']) });

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        mockWebViewProps.onMessage(pageMessage(URL_, 'GetSubWebViewUserKey', {}));
        await settle();

        const replies = mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw));
        const ready = replies.find(reply => reply.type === 'OnWebAppReady');
        const key = replies.find(reply => reply.refId === 'r-GetSubWebViewUserKey');
        expect(ready.data.supportedWebMessages).toEqual(expect.arrayContaining(['OpenShareSheet', 'TriggerHaptic']));
        expect(ready.data.supportedWebMessages).not.toContain('GetSubWebViewUserKey');
        expect(key).toEqual(
            expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ code: 'NOT_FOUND' }) })
        );
    });

    it('opens the storage of the opened origin, on the first request that needs it', async () => {
        const { openSubWebViewStorage } = jest.requireMock('../services/subWebView/subWebViewStorageFile');
        openSubWebViewStorage.mockClear();
        renderView({ permissions: new Set() });

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();
        expect(openSubWebViewStorage).not.toHaveBeenCalled();

        mockWebViewProps.onMessage(
            pageMessage('https://foo.apps.chatic.io/other', 'SetSubWebViewStorage', { entries: { level: 3 } })
        );
        await settle();

        expect(openSubWebViewStorage).toHaveBeenCalledWith('https://foo.apps.chatic.io');
        const reply = mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw)).pop();
        expect(reply).toEqual(expect.objectContaining({ type: 'OnSetSubWebViewStorage', success: true }));
    });

    it("writes the page's error report to the app's logs under its origin", async () => {
        const { logger } = jest.requireMock('../services');
        renderView({ permissions: new Set() });

        mockWebViewProps.onMessage(pageMessage(URL_, 'ReportSubWebViewError', { message: 'boom', stack: 'at x' }));
        await settle();

        expect(logger.warn).toHaveBeenCalledWith('WEBVIEW', '[sub] page error', {
            origin: 'https://foo.apps.chatic.io',
            message: 'boom',
            stack: 'at x',
        });
        expect(sentTypes()).toEqual(['OnReportSubWebViewError']);
    });

    it('holds a push for a new page until that page shakes hands', async () => {
        const view = renderView();
        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();
        act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
        mockPostMessage.mockClear();

        mockTheme = 'dark';
        view.rerender(
            <SubWebView
                viewId="view-1"
                url={URL_}
                params={{ orderId: 7 }}
                permissions={ALL_PERMISSIONS}
                onRequestClose={jest.fn()}
            />
        );
        await settle();
        expect(sentTypes()).toEqual([]);

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();
        expect(sentTypes()).toEqual(['OnSubWebViewContextChanged', 'OnWebAppReady']);
    });

    describe('when the page’s process is gone', () => {
        const closeMock = () =>
            (jest.requireMock('../services') as { subWebViewService: { close: jest.Mock } }).subWebViewService.close;

        beforeEach(() => {
            closeMock().mockClear();
            mockReload.mockClear();
            mockAppState = 'active';
        });

        it.each(['onContentProcessDidTerminate', 'onRenderProcessGone'])(
            'closes the view as the shell while the app is in front (%s)',
            callback => {
                renderView();

                act(() => mockWebViewProps[callback]({ nativeEvent: {} }));

                expect(closeMock()).toHaveBeenCalledWith('view-1', 'system');
                expect(mockReload).not.toHaveBeenCalled();
            }
        );

        it('reloads an iOS page once when its process ended in the background, then closes', () => {
            renderView();
            mockAppState = 'background';

            act(() => mockWebViewProps.onContentProcessDidTerminate({ nativeEvent: {} }));
            expect(mockReload).toHaveBeenCalledTimes(1);
            expect(closeMock()).not.toHaveBeenCalled();

            act(() => mockWebViewProps.onContentProcessDidTerminate({ nativeEvent: {} }));
            expect(mockReload).toHaveBeenCalledTimes(1);
            expect(closeMock()).toHaveBeenCalledWith('view-1', 'system');
        });

        it('closes an Android page whose renderer is gone even in the background: it cannot be used again', () => {
            renderView();
            mockAppState = 'background';

            act(() => mockWebViewProps.onRenderProcessGone({ nativeEvent: {} }));

            expect(mockReload).not.toHaveBeenCalled();
            expect(closeMock()).toHaveBeenCalledWith('view-1', 'system');
        });
    });

    it("drops the last page's requested title when a new page starts loading", () => {
        const onTitleRequest = jest.fn();
        renderView({ onTitleRequest });

        act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: 'https://foo.apps.chatic.io/next' } }));

        expect(onTitleRequest).toHaveBeenCalledWith(undefined);
    });

    it('tells the page when the theme changes', async () => {
        const view = renderView();
        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();

        mockTheme = 'dark';
        view.rerender(
            <SubWebView
                viewId="view-1"
                url={URL_}
                params={{ orderId: 7 }}
                permissions={ALL_PERMISSIONS}
                onRequestClose={jest.fn()}
            />
        );
        await settle();

        const pushed = mockPostMessage.mock.calls
            .map(([raw]) => JSON.parse(raw))
            .filter(message => message.type === 'OnSubWebViewContextChanged')
            .map(({ type, success, data }) => ({ type, success, data }));
        expect(pushed).toEqual([
            {
                type: 'OnSubWebViewContextChanged',
                success: true,
                data: { locale: 'ko', theme: 'dark', safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
            },
        ]);
        expect(pushedEventErrors(pushed)).toEqual([]);
    });

    it('loads an allowed page, opens an outside link in the OS, and drops an app scheme', () => {
        renderView();
        const decide = mockWebViewProps.onShouldStartLoadWithRequest as (request: object) => boolean;

        expect(decide({ url: 'https://foo.apps.chatic.io/b', isTopFrame: true })).toBe(true);
        expect(decide({ url: 'https://example.com/', isTopFrame: true })).toBe(false);
        expect(mockOpenURL).toHaveBeenCalledWith('https://example.com/');
        expect(decide({ url: 'chatic://s/home', isTopFrame: true })).toBe(false);
        expect(mockOpenURL).toHaveBeenCalledTimes(1);
    });

    it('reports the context in the handshake reply', async () => {
        renderView();

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();

        const reply = JSON.parse(mockPostMessage.mock.calls[0][0]);
        expect(reply.data.subWebView).toEqual({
            protocolVersion: 1,
            viewId: 'view-1',
            platform: 'android',
            appVersion: '0.30.1',
            locale: 'ko',
            theme: 'light',
            params: { orderId: 7 },
            appLink: 'https://app.chatic.io/apps/foo',
            display: 'clean',
            safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        });
    });

    it('builds the share link from the app id the web opened the page as', async () => {
        renderView({ appId: 'quiz' });

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();

        const reply = JSON.parse(mockPostMessage.mock.calls[0][0]);
        expect(reply.data.subWebView.appLink).toBe('https://app.chatic.io/apps/quiz');
    });

    it('answers a message over 65,536 characters with TOO_LARGE', async () => {
        renderView();

        mockWebViewProps.onMessage(pageMessage(URL_, 'CopyToClipboard', { text: 'x'.repeat(64 * 1024) }));
        await settle();

        const reply = JSON.parse(mockPostMessage.mock.calls[0][0]);
        expect(reply).toEqual(
            expect.objectContaining({ type: 'ERROR', error: expect.objectContaining({ code: 'TOO_LARGE' }) })
        );
    });

    describe('Android back', () => {
        const press = () => act(() => void mockBackListener?.());
        const pushedTypes = () => sentTypes().filter(type => type !== 'OnWebAppReady');

        it('goes back in the view, and closes it with no history left', () => {
            const onRequestClose = jest.fn();
            renderView({ onRequestClose });

            act(() => mockWebViewProps.onNavigationStateChange({ canGoBack: true, loading: false }));
            press();
            expect(mockGoBack).toHaveBeenCalledTimes(1);

            act(() => mockWebViewProps.onNavigationStateChange({ canGoBack: false, loading: false }));
            press();
            expect(onRequestClose).toHaveBeenCalledTimes(1);
        });

        it('is pushed to a page that claimed it, and does nothing else', async () => {
            const onRequestClose = jest.fn();
            renderView({ onRequestClose });
            mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
            mockWebViewProps.onMessage(pageMessage(URL_, 'SetCanGoBack', { canGoBack: true }));
            await settle();
            mockPostMessage.mockClear();

            press();
            await settle();

            const pushed = mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw));
            expect(pushed.map(message => message.type)).toEqual(['OnBackPressed']);
            expect(pushedEventErrors(pushed.map(({ type, success, data }) => ({ type, success, data })))).toEqual([]);
            expect(mockGoBack).not.toHaveBeenCalled();
            expect(onRequestClose).not.toHaveBeenCalled();
        });

        it('forgets the claim when a new page loads', async () => {
            const onRequestClose = jest.fn();
            renderView({ onRequestClose });
            mockWebViewProps.onMessage(pageMessage(URL_, 'SetCanGoBack', { canGoBack: true }));
            await settle();

            act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
            press();

            expect(onRequestClose).toHaveBeenCalledTimes(1);
            expect(pushedTypes()).not.toContain('OnBackPressed');
        });

        it("ignores a claim the previous load's host answers after a new page started", async () => {
            const onRequestClose = jest.fn();
            renderView({ onRequestClose });
            const previousLoadOnMessage = mockWebViewProps.onMessage;

            act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
            previousLoadOnMessage(pageMessage(URL_, 'SetCanGoBack', { canGoBack: true }));
            await settle();
            press();

            expect(onRequestClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('close guard', () => {
        const guard = async () => {
            mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
            mockWebViewProps.onMessage(pageMessage(URL_, 'SetSubWebViewCloseGuard', { enabled: true }));
            await settle();
            mockPostMessage.mockClear();
        };

        it('closes at once when the page has no guard', () => {
            const onRequestClose = jest.fn();
            const ref = React.createRef<SubWebViewHandle>();
            renderView({ onRequestClose, ref });

            act(() => ref.current?.requestClose('control'));

            expect(onRequestClose).toHaveBeenCalledTimes(1);
        });

        it('asks a guarded page instead of closing, then closes on a second request', async () => {
            const onRequestClose = jest.fn();
            const ref = React.createRef<SubWebViewHandle>();
            renderView({ onRequestClose, ref });
            await guard();

            act(() => ref.current?.requestClose('control'));
            await settle();

            const pushed = mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw));
            expect(pushed.map(({ type, data }) => ({ type, data }))).toEqual([
                { type: 'OnSubWebViewCloseRequested', data: { trigger: 'control' } },
            ]);
            expect(pushedEventErrors(pushed.map(({ type, success, data }) => ({ type, success, data })))).toEqual([]);
            expect(onRequestClose).not.toHaveBeenCalled();

            act(() => ref.current?.requestClose('control'));
            expect(onRequestClose).toHaveBeenCalledTimes(1);
        });

        it('asks through Android back too, when back would close', async () => {
            renderView();
            await guard();

            act(() => void mockBackListener?.());
            await settle();

            expect(mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw).data)).toEqual([{ trigger: 'back' }]);
        });

        it('is gone after a new page loads', async () => {
            const onRequestClose = jest.fn();
            const ref = React.createRef<SubWebViewHandle>();
            renderView({ onRequestClose, ref });
            await guard();

            act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
            act(() => ref.current?.requestClose('control'));

            expect(onRequestClose).toHaveBeenCalledTimes(1);
        });
    });

    it("reports the page's title once it has loaded", () => {
        const onTitleChange = jest.fn();
        renderView({ onTitleChange });
        const onChange = mockWebViewProps.onNavigationStateChange as (state: object) => void;

        act(() => {
            onChange({ title: 'Loading…', loading: true, canGoBack: false });
            onChange({ title: 'Notice', loading: false, canGoBack: false });
        });

        expect(onTitleChange.mock.calls).toEqual([['Notice']]);
    });
});

describe('SubWebView device features', () => {
    it('plays media inline, as the main WebView does', () => {
        renderView();

        expect(mockWebViewProps.allowsInlineMediaPlayback).toBe(true);
    });

    it('answers a capture from its own host without WebKit asking, and from another host with a no', () => {
        renderView();

        expect(mockWebViewProps.mediaCapturePermissionGrantType).toBe('grantIfSameHostElseDeny');
    });

    it('answers the device requests for a page with no permissions at all', async () => {
        renderView({ permissions: new Set() });
        await settle();

        await act(async () => {
            await mockWebViewProps.onMessage(pageMessage(URL_, 'GetSubWebViewPermission', { kind: 'camera' }));
        });
        await settle();

        const reply = mockPostMessage.mock.calls
            .map(([raw]) => JSON.parse(raw))
            .find(r => r.type === 'OnGetSubWebViewPermission');
        expect(reply).toEqual(expect.objectContaining({ success: true, data: { state: 'prompt' } }));
    });
});
