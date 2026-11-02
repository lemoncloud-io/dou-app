import React from 'react';
import { render } from '@testing-library/react';

import { SubWebView } from './SubWebView';

let mockWebViewProps: Record<string, any> = {};
const mockOpenURL = jest.fn(() => Promise.resolve());

jest.mock('react-native-webview', () => {
    const { forwardRef } = jest.requireActual('react');
    return {
        WebView: forwardRef((props: Record<string, unknown>, _ref: unknown) => {
            mockWebViewProps = props;
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
jest.mock('../hooks', () => ({ useResolvedTheme: () => ({ backgroundColor: '#FFFFFF' }) }));
jest.mock('../services', () => ({ logger: { warn: jest.fn() } }));

describe('SubWebView', () => {
    beforeEach(() => {
        mockWebViewProps = {};
        mockOpenURL.mockClear();
    });

    // No `onMessage` means react-native-webview injects no `window.ReactNativeWebView`, and no
    // injected script means none of the main WebView's globals (device and install ids, the bridge
    // handler): the page has no way to reach the app.
    it('gives the page no bridge and no injected script', () => {
        render(<SubWebView url="https://foo.apps.chatic.io/a" onRequestClose={jest.fn()} />);

        expect(mockWebViewProps.source).toEqual({ uri: 'https://foo.apps.chatic.io/a' });
        expect(mockWebViewProps.onMessage).toBeUndefined();
        expect(mockWebViewProps.injectedJavaScript).toBeUndefined();
        expect(mockWebViewProps.injectedJavaScriptBeforeContentLoaded).toBeUndefined();
        expect(mockWebViewProps.applicationNameForUserAgent).toBeUndefined();
        expect(mockWebViewProps.userAgent).toBeUndefined();
    });

    // react-native-webview checks this list before `onShouldStartLoadWithRequest` and hands anything
    // that fails it to the OS — a narrower list would send `chatic://` back into the app unchecked.
    it('lets every navigation reach its own check', () => {
        render(<SubWebView url="https://foo.apps.chatic.io/a" onRequestClose={jest.fn()} />);

        expect(mockWebViewProps.originWhitelist).toEqual(['*']);
    });

    it('loads an allowed page, opens an outside link in the OS, and drops an app scheme', () => {
        render(<SubWebView url="https://foo.apps.chatic.io/a" onRequestClose={jest.fn()} />);
        const decide = mockWebViewProps.onShouldStartLoadWithRequest as (request: object) => boolean;

        expect(decide({ url: 'https://foo.apps.chatic.io/b', isTopFrame: true })).toBe(true);
        expect(decide({ url: 'https://example.com/', isTopFrame: true })).toBe(false);
        expect(mockOpenURL).toHaveBeenCalledWith('https://example.com/');
        expect(decide({ url: 'chatic://s/home', isTopFrame: true })).toBe(false);
        expect(mockOpenURL).toHaveBeenCalledTimes(1);
    });

    it("reports the page's title once it has loaded", () => {
        const onTitleChange = jest.fn();
        render(
            <SubWebView url="https://foo.apps.chatic.io/a" onRequestClose={jest.fn()} onTitleChange={onTitleChange} />
        );
        const onChange = mockWebViewProps.onNavigationStateChange as (state: object) => void;

        onChange({ title: 'Loading…', loading: true, canGoBack: false });
        onChange({ title: 'Notice', loading: false, canGoBack: false });

        expect(onTitleChange.mock.calls).toEqual([['Notice']]);
    });
});
