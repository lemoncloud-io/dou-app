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

const webViewRef = { current: null } as RefObject<WebView | null>;

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
});
