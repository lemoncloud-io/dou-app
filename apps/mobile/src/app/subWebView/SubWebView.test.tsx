import React from 'react';
import { act, render } from '@testing-library/react';
import { BRIDGE_VERSION, JsonProtocol } from '@chatic/bridges';

import { pushedEventErrors } from '../webview/hooks/appEventContract';
import { SubWebView, type SubWebViewHandle } from './SubWebView';
import { deriveSubWebViewUserKey } from './subWebViewUserKey';

let mockWebViewProps: Record<string, any> = {};
const mockPostMessage = jest.fn();
const mockGoBack = jest.fn();
let mockBackListener: (() => boolean) | undefined;
const mockOpenURL = jest.fn(() => Promise.resolve());
let mockTheme: 'light' | 'dark' = 'light';

jest.mock('react-native-webview', () => {
    const { forwardRef, useImperativeHandle } = jest.requireActual('react');
    return {
        WebView: forwardRef((props: Record<string, unknown>, ref: unknown) => {
            mockWebViewProps = props;
            useImperativeHandle(ref, () => ({ postMessage: mockPostMessage, goBack: mockGoBack }));
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
}));
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
    deviceService: { openShareSheet: jest.fn(async () => ({ action: 'sharedAction' })) },
}));
jest.mock('../stores', () => ({
    useLanguageStore: (select: (state: { preference: string }) => unknown) => select({ preference: 'ko' }),
    resolveAppLanguage: (preference: string, device: string) => (preference === 'system' ? device : preference),
}));
jest.mock('../utils/device', () => ({ getAppLanguage: () => 'en' }));
jest.mock('../bridge', () => ({ HapticBridge: { trigger: jest.fn(() => true) } }));

const URL_ = 'https://foo.apps.chatic.io/a';

const renderView = (props: Partial<React.ComponentProps<typeof SubWebView>> = {}) =>
    render(<SubWebView viewId="view-1" url={URL_} params={{ orderId: 7 }} onRequestClose={jest.fn()} {...props} />);

const pageMessage = (url: string, type: string, data: unknown) => ({
    nativeEvent: { url, data: JsonProtocol.encode({ type, refId: `r-${type}`, version: BRIDGE_VERSION, data } as any) },
});

/** Lets the host's async handling reach `postMessage`. */
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

const sentTypes = () => mockPostMessage.mock.calls.map(([raw]) => JSON.parse(raw).type);

// React Native defines `__DEV__`; this suite mocks React Native, so it sets the global itself.
const runtime = globalThis as { __DEV__?: boolean };

describe('SubWebView', () => {
    beforeEach(() => {
        runtime.__DEV__ = true;
        mockWebViewProps = {};
        mockPostMessage.mockClear();
        mockGoBack.mockClear();
        mockOpenURL.mockClear();
        mockBackListener = undefined;
        mockTheme = 'light';
    });

    // None of the main WebView's identity or channel: its own context script, its own user agent.
    it('injects only its own context, under the platform user agent', () => {
        renderView();

        const script = mockWebViewProps.injectedJavaScriptBeforeContentLoaded as string;
        expect(script).toContain("'ChaticSubWebView'");
        expect(script).toContain('\\"orderId\\":7');
        expect(script).toContain('\\"locale\\":\\"ko\\"');
        expect(script).not.toMatch(/CHATIC_APP_|ChaticMessageHandler/);
        // The same script again at load end, for Android, where the first run can trail the page.
        expect(mockWebViewProps.injectedJavaScript).toBe(script);
        expect(mockWebViewProps.applicationNameForUserAgent).toBeUndefined();
        expect(mockWebViewProps.userAgent).toBeUndefined();
    });

    // react-native-webview checks this list before `onShouldStartLoadWithRequest` and hands anything
    // that fails it to the OS — a narrower list would send `chatic://` back into the app unchecked.
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

    // A page the view navigated to — another allowlisted one too — and a frame elsewhere get nothing.
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

    // The previous load's host can still be handed a request after the next load started.
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

    // Keyed on the origin the view was opened on, whatever page of it asks; the id itself stays here.
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

    // A reloaded page gets a fresh host: nothing is pushed to it before its own handshake.
    it('holds a push for a new page until that page shakes hands', async () => {
        const view = renderView();
        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();
        act(() => mockWebViewProps.onLoadStart({ nativeEvent: { url: URL_ } }));
        mockPostMessage.mockClear();

        mockTheme = 'dark';
        view.rerender(<SubWebView viewId="view-1" url={URL_} params={{ orderId: 7 }} onRequestClose={jest.fn()} />);
        await settle();
        expect(sentTypes()).toEqual([]);

        mockWebViewProps.onMessage(pageMessage(URL_, 'WebAppReady', {}));
        await settle();
        expect(sentTypes()).toEqual(['OnSubWebViewContextChanged', 'OnWebAppReady']);
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
        view.rerender(<SubWebView viewId="view-1" url={URL_} params={{ orderId: 7 }} onRequestClose={jest.fn()} />);
        await settle();

        const pushed = mockPostMessage.mock.calls
            .map(([raw]) => JSON.parse(raw))
            .filter(message => message.type === 'OnSubWebViewContextChanged')
            .map(({ type, success, data }) => ({ type, success, data }));
        expect(pushed).toEqual([
            { type: 'OnSubWebViewContextChanged', success: true, data: { locale: 'ko', theme: 'dark' } },
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

    // The handshake carries the context, so a page need not race the global on Android.
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
        });
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
