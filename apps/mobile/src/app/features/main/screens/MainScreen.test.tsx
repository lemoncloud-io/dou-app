import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { MainScreen } from './MainScreen';

type WebViewProps = { onError: (event: { nativeEvent: { description: string } }) => void };

let webViewProps: WebViewProps | null = null;
const mockWebViewMounts = jest.fn();
const mockOnLoadFailed = jest.fn();

jest.mock('react-native', () => ({
    View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../../../webview', () => ({
    AppWebView: (props: WebViewProps) => {
        webViewProps = props;
        mockWebViewMounts();
        return <div data-testid="webview" />;
    },
}));

jest.mock('../../core/components', () => ({
    DeepLinkErrorView: () => <div data-testid="deeplink-error" />,
    WebViewErrorView: ({ onRetry, reason }: { onRetry: () => void; reason?: string | null }) => (
        <div data-testid="webview-error">
            <span>{reason}</span>
            <button onClick={onRetry}>retry</button>
        </div>
    ),
}));

jest.mock('../../../webview/hooks/useWebViewNavigation', () => ({
    useWebViewNavigation: () => ({ setNavCanGoBack: jest.fn() }),
}));

jest.mock('../../../webview/hooks/useDeepLinkNavigation', () => ({
    useDeepLinkNavigation: () => ({ deepLinkError: false, deepLinkErrorReason: null, handleDismissError: jest.fn() }),
}));

jest.mock('../../../webview/hooks', () => ({
    useAppBridge: () => ({ bridge: {}, onMessage: jest.fn() }),
}));

jest.mock('../../../services', () => ({
    bootMetricsService: { mark: jest.fn() },
    bootSplashService: { onWebAppReady: jest.fn(), onLoadFailed: () => mockOnLoadFailed() },
    logger: { debug: jest.fn() },
}));

jest.mock('../../../hooks', () => ({
    useResolvedTheme: () => ({ backgroundColor: '#fff' }),
}));

jest.mock('../../../customZip', () => ({
    useCustomZipBootGate: () => ({ isRestoringCustomZip: false }),
}));

jest.mock('../../../stores', () => {
    const { create } = jest.requireActual('zustand');
    const useDebugRuntimeStore = create((set: any) => ({
        webViewReloadToken: 0,
        updateWebViewState: () => undefined,
        requestWebViewReload: () => set((state: any) => ({ webViewReloadToken: state.webViewReloadToken + 1 })),
    }));
    const useDebugSettingsStore = (selector: (state: any) => unknown) =>
        selector({ getResolvedWebviewBaseUrl: () => 'https://app.example' });
    return { useDebugRuntimeStore, useDebugSettingsStore };
});

const renderScreen = () => render(<MainScreen {...({ route: { params: {} } } as any)} />);

const failLoad = (description: string) =>
    act(() => {
        webViewProps?.onError({ nativeEvent: { description } });
    });

describe('MainScreen web page load failure', () => {
    beforeEach(() => {
        webViewProps = null;
        mockWebViewMounts.mockClear();
        mockOnLoadFailed.mockClear();
    });

    // A failed load used to leave the mounted WebView blank with no way to retry.
    it('replaces the WebView with the retry view when the page fails to load', () => {
        renderScreen();

        failLoad('net::ERR_INTERNET_DISCONNECTED');

        expect(screen.queryByTestId('webview')).toBeNull();
        expect(screen.getByTestId('webview-error').textContent).toContain('net::ERR_INTERNET_DISCONNECTED');
        expect(mockOnLoadFailed).toHaveBeenCalledTimes(1);
    });

    it('remounts the WebView and clears the error on retry', () => {
        renderScreen();
        failLoad('net::ERR_CONNECTION_REFUSED');
        mockWebViewMounts.mockClear();

        fireEvent.click(screen.getByText('retry'));

        expect(screen.queryByTestId('webview-error')).toBeNull();
        expect(screen.getByTestId('webview')).toBeTruthy();
        expect(mockWebViewMounts).toHaveBeenCalled();
    });
});
