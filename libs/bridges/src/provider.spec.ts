import { BridgeProvider, isNative } from './provider';
import { MockWebBridgeClient, WebBridgeClient } from './web';

describe('BridgeProvider DI Container', () => {
    beforeEach(() => {
        jest.useFakeTimers();

        // Reset provider cached instances
        BridgeProvider.getInstance().reset();

        // Clean up window environment
        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();

        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
    });

    it('should act as a singleton and return the same provider instance', () => {
        const p1 = BridgeProvider.getInstance();
        const p2 = BridgeProvider.getInstance();
        expect(p1).toBe(p2);
    });

    it('should construct WebBridgeClient in a browser even before the native bridge is injected', () => {
        const client = BridgeProvider.getInstance().getWebClient();
        expect(client).toBeInstanceOf(WebBridgeClient);
    });

    it('should construct WebBridgeClient in a native environment', () => {
        (window as any).ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = BridgeProvider.getInstance().getWebClient();
        expect(client).toBeInstanceOf(WebBridgeClient);
    });

    it('should return the same webClient instance (singleton)', () => {
        const provider = BridgeProvider.getInstance();
        const client1 = provider.getWebClient();
        const client2 = provider.getWebClient();
        expect(client1).toBe(client2);
    });

    it('should not replace an early WebBridgeClient with a mock when the native bridge appears later', () => {
        const provider = BridgeProvider.getInstance();
        const clientBeforeInjection = provider.getWebClient();

        (window as any).ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const clientAfterInjection = provider.getWebClient();

        expect(clientBeforeInjection).toBeInstanceOf(WebBridgeClient);
        expect(clientAfterInjection).toBe(clientBeforeInjection);
        expect(clientAfterInjection).not.toBeInstanceOf(MockWebBridgeClient);
    });

    it('should create and return the singleton AppBridgeHost instance', () => {
        const provider = BridgeProvider.getInstance();
        const mockSend = jest.fn();
        const host1 = provider.getAppHost(mockSend);
        const host2 = provider.getAppHost(mockSend);

        expect(host1).toBe(host2);
        expect(host1).toBeDefined();
    });
});

describe('isNative() utility', () => {
    beforeEach(() => {
        jest.useFakeTimers();

        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();

        if (typeof window !== 'undefined') {
            delete (window as any).ReactNativeWebView;
            delete (window as any).ChaticMessageHandler;
            delete (window as any).webkit;
        }
    });

    it('should return false in a non-native environment', () => {
        expect(isNative()).toBe(false);
    });

    it('should return true when ReactNativeWebView.postMessage is present', () => {
        (window as any).ReactNativeWebView = { postMessage: jest.fn() };
        expect(isNative()).toBe(true);
    });

    it('should return true when ChaticMessageHandler.postMessage is present', () => {
        (window as any).ChaticMessageHandler = { postMessage: jest.fn() };
        expect(isNative()).toBe(true);
    });

    it('should return true when webkit messageHandler is present', () => {
        (window as any).webkit = {
            messageHandlers: { ChaticMessageHandler: { postMessage: jest.fn() } },
        };
        expect(isNative()).toBe(true);
    });
});
