import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { MainScreen } from './MainScreen';

type WebViewProps = {
    onError: (event: { nativeEvent: { description: string } }) => void;
    onLoadStart: (event: { nativeEvent: { url: string } }) => void;
    source: { uri: string };
};

let webViewProps: WebViewProps | null = null;
const mockWebViewMounts = jest.fn();
const mockOnLoadFailed = jest.fn();
const mockUseDeepLinkNavigation = jest.fn();
let mockRestartNote: { reason: string; homeSearch?: string } | null = null;

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
    useDeepLinkNavigation: (...args: unknown[]) => {
        mockUseDeepLinkNavigation(...args);
        return { deepLinkError: false, deepLinkErrorReason: null, handleDismissError: jest.fn() };
    },
}));

jest.mock('../../../webview/hooks', () => ({
    useAppBridge: () => ({ bridge: {}, onMessage: jest.fn() }),
}));

jest.mock('../../../services', () => ({
    bootMetricsService: { mark: jest.fn() },
    bootSplashService: { onWebAppReady: jest.fn(), onLoadFailed: () => mockOnLoadFailed() },
    logger: { debug: jest.fn() },
}));

jest.mock('../../../services/appRestart', () => ({
    appRestart: { note: () => mockRestartNote },
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

describe('MainScreen after the app restarted itself', () => {
    beforeEach(() => {
        webViewProps = null;
        mockRestartNote = null;
        mockUseDeepLinkNavigation.mockClear();
    });

    it('opens the base address and follows cold-start links on an ordinary launch', () => {
        renderScreen();

        expect(webViewProps?.source).toEqual({ uri: 'https://app.example' });
        expect(mockUseDeepLinkNavigation).toHaveBeenLastCalledWith(expect.anything(), { skipColdStart: false });
    });

    // A session the app's runtime held ended: the page boots as one that has just signed out.
    it('opens home with the address the session ended with, and skips the cold-start replay', () => {
        mockRestartNote = { reason: 'session-ended', homeSearch: 'logout=1&reason=logout' };

        renderScreen();

        expect(webViewProps?.source).toEqual({ uri: 'https://app.example?logout=1&reason=logout' });
        expect(mockUseDeepLinkNavigation).toHaveBeenLastCalledWith(expect.anything(), { skipColdStart: true });
    });

    // A page booted with `logout=1` empties the vault: a later mount repeating it would sign out a
    // session started since the restart.
    it('carries the home query on the first load only, not into a later mount', () => {
        mockRestartNote = { reason: 'session-ended', homeSearch: 'logout=1' };
        renderScreen();
        expect(webViewProps?.source).toEqual({ uri: 'https://app.example?logout=1' });

        act(() => {
            webViewProps?.onLoadStart({ nativeEvent: { url: 'https://app.example?logout=1' } });
        });
        failLoad('net::ERR_CONNECTION_RESET');
        fireEvent.click(screen.getByText('retry'));

        expect(webViewProps?.source).toEqual({ uri: 'https://app.example' });
    });

    it('keeps the home query on the mounted WebView once its load has started', () => {
        mockRestartNote = { reason: 'session-ended', homeSearch: 'logout=1' };
        const { rerender } = renderScreen();
        const firstSource = webViewProps?.source;

        act(() => {
            webViewProps?.onLoadStart({ nativeEvent: { url: 'https://app.example?logout=1' } });
        });
        rerender(<MainScreen {...({ route: { params: {} } } as any)} />);

        // The same object: a changed source would navigate the live WebView a second time.
        expect(webViewProps?.source).toBe(firstSource);
    });

    it('opens the base address after an owner switch, still skipping the replay', () => {
        mockRestartNote = { reason: 'session-owner-changed' };

        renderScreen();

        expect(webViewProps?.source).toEqual({ uri: 'https://app.example' });
        expect(mockUseDeepLinkNavigation).toHaveBeenLastCalledWith(expect.anything(), { skipColdStart: true });
    });
});
