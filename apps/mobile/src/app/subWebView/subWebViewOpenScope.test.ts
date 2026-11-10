import { renderHook } from '@testing-library/react';
import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { JsonProtocol } from '@chatic/bridges';

// The boundary keeps sub WebView code from reaching the main WebView at run time. This is a test of
// the main WebView's handshake filed with the sub WebView tests; nothing here ships, so nothing couples.
// eslint-disable-next-line no-restricted-imports -- a test file, no runtime import (see above)
import { useAppBridgeHost } from '../webview/hooks/useBaseBridge';

/**
 * The main WebView's handshake is what the web reads before it offers an owner's own link: the web
 * ships before the shell, so it shows the control only where the shell says it opens any https site.
 */

jest.mock('../services/cache/cacheDomainVersions', () => ({
    resolveCacheDomainVersions: jest.fn(async () => ({})),
}));
jest.mock('../services', () => ({ logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('../stores', () => ({
    useDebugSettingsStore: (select: (state: { getResolvedWebviewBaseUrl: () => string }) => unknown) =>
        select({ getResolvedWebviewBaseUrl: () => 'http://localhost:5003' }),
}));
jest.mock('../services/deeplinks/deeplinkUtils', () => ({
    DEEP_LINK_DOMAINS: ['app.chatic.io'],
    CUSTOM_SCHEMES: ['chatic', 'chatic-dev'],
}));

describe("the main WebView's handshake", () => {
    it("says the shell opens any https site, as 'anyHttps'", async () => {
        const sent: string[] = [];
        const webViewRef = {
            current: { postMessage: (message: string) => sent.push(message) },
        } as unknown as RefObject<WebView | null>;
        const { result } = renderHook(() => useAppBridgeHost(webViewRef));

        await result.current.appBridgeHost.handleMessage(
            JsonProtocol.encode({ type: 'WebAppReady', refId: 'ready', data: {} } as never) as string
        );

        const reply = sent.map(raw => JsonProtocol.decode(raw) as any).find(message => message.refId === 'ready');
        expect(reply?.data.subWebViewOpenScope).toBe('anyHttps');
    });
});
