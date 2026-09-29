import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

import { useAppBridgeHost } from './useBaseBridge';

const mockResolve = jest.fn();

jest.mock('../../services/cache/cacheDomainVersions', () => ({
    resolveCacheDomainVersions: (...args: unknown[]) => mockResolve(...args),
}));

// The real host pulls in the bridge protocol stack; only the config it receives matters here.
const hostConfigs: any[] = [];
jest.mock('@chatic/bridges', () => ({
    AppBridgeHost: jest.fn().mockImplementation(config => {
        hostConfigs.push(config);
        return { handleMessage: jest.fn() };
    }),
}));

jest.mock('../../services', () => ({ logger: { warn: jest.fn() } }));
jest.mock('../../stores', () => ({
    useDebugSettingsStore: (select: (state: { getResolvedWebviewBaseUrl: () => string }) => unknown) =>
        select({ getResolvedWebviewBaseUrl: () => 'http://localhost:5003' }),
}));
jest.mock('../../services/deeplinks/deeplinkUtils', () => ({
    DEEP_LINK_DOMAINS: ['app.chatic.io'],
    CUSTOM_SCHEMES: ['chatic', 'chatic-dev'],
}));

const webViewRef = { current: null } as RefObject<WebView | null>;
const messageFrom = (url: string) => ({ nativeEvent: { url, data: '{"type":"Ping"}' } }) as any;

beforeEach(() => {
    jest.clearAllMocks();
    hostConfigs.length = 0;
    mockResolve.mockResolvedValue({ chat: 1 });
});

describe('useAppBridgeHost', () => {
    // The web reads the measurement once, when the data runtime assembles its cache storages. A
    // reply that lands after that point leaves a domain on web storage for the whole session, so
    // the measurement is started at mount — in parallel with the WebView's bundle load — rather
    // than serially inside the handshake.
    it('starts measuring the cache contract at mount, before the web asks', () => {
        renderHook(() => useAppBridgeHost(webViewRef));

        expect(mockResolve).toHaveBeenCalledTimes(1);
    });

    it('warms once across re-renders', () => {
        const { rerender } = renderHook(() => useAppBridgeHost(webViewRef));
        rerender();
        rerender();

        expect(mockResolve).toHaveBeenCalledTimes(1);
    });

    // The resolver never rejects, but the warm-up is fire-and-forget either way — a mount must not
    // be able to produce an unhandled rejection.
    it('survives a rejecting resolver without breaking the mount', () => {
        mockResolve.mockRejectedValue(new Error('unexpected'));

        expect(() => renderHook(() => useAppBridgeHost(webViewRef))).not.toThrow();
    });

    it('hands the host the same resolver plus the static fallback report', () => {
        renderHook(() => useAppBridgeHost(webViewRef));

        const config = hostConfigs[0];
        expect(typeof config.resolveCacheDomainVersions).toBe('function');
        expect(config.supportedCacheTypes).toContain('invite');
        expect(typeof config.cacheSchemaVersion).toBe('number');
    });

    // A page the WebView navigated to on another origin still runs in the same WebView and can post.
    it('hands the host messages from the web the WebView was pointed at', () => {
        const { result } = renderHook(() => useAppBridgeHost(webViewRef));

        result.current.onMessage(messageFrom('http://localhost:5003/home'));

        expect(result.current.appBridgeHost.handleMessage).toHaveBeenCalledWith('{"type":"Ping"}');
    });

    it('drops messages from any other origin', () => {
        const { result } = renderHook(() => useAppBridgeHost(webViewRef));

        result.current.onMessage(messageFrom('https://evil.example/'));

        expect(result.current.appBridgeHost.handleMessage).not.toHaveBeenCalled();
    });
});
