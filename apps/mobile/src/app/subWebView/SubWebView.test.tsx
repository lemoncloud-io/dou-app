import React from 'react';
import { act, render } from '@testing-library/react';
import { BRIDGE_VERSION, JsonProtocol } from '@chatic/bridges';

import { pushedEventErrors } from '../webview/hooks/appEventContract';
import { SubWebView } from './SubWebView';

let mockWebViewProps: Record<string, any> = {};
const mockPostMessage = jest.fn();
const mockOpenURL = jest.fn(() => Promise.resolve());
let mockTheme: 'light' | 'dark' = 'light';

jest.mock('react-native-webview', () => {
    const { forwardRef, useImperativeHandle } = jest.requireActual('react');
    return {
        WebView: forwardRef((props: Record<string, unknown>, ref: unknown) => {
            mockWebViewProps = props;
            useImperativeHandle(ref, () => ({ postMessage: mockPostMessage, goBack: jest.fn() }));
            return null;
        }),
    };
});
jest.mock('react-native', () => ({
    BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Linking: { openURL: (url: string) => mockOpenURL(url) },
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('react-native-device-info', () => ({ __esModule: true, default: { getVersion: () => '0.30.1' } }));
jest.mock('../hooks', () => ({
    useResolvedTheme: () => ({ backgroundColor: '#FFFFFF', resolvedTheme: mockTheme }),
}));
jest.mock('../services', () => ({
    logger: { warn: jest.fn() },
    clipboardService: { setText: jest.fn(async () => undefined) },
    subWebViewService: { close: jest.fn(() => ({ ok: true })) },
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

describe('SubWebView', () => {
    beforeEach(() => {
        mockWebViewProps = {};
        mockPostMessage.mockClear();
        mockOpenURL.mockClear();
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
