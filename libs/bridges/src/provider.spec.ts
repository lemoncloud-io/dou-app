import { BridgeProvider, isNative, webClient } from './provider';
import { WebBridgeClient } from './web';

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
        BridgeProvider.getInstance().restoreDefaults();
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
        const client = BridgeProvider.getInstance().getActiveWebClient();
        expect(client).toBeInstanceOf(WebBridgeClient);
    });

    it('should construct WebBridgeClient in a native environment', () => {
        (window as any).ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const client = BridgeProvider.getInstance().getActiveWebClient();
        expect(client).toBeInstanceOf(WebBridgeClient);
    });

    it('should return the same stable webClient proxy instance', () => {
        const provider = BridgeProvider.getInstance();
        const client1 = provider.getWebClient();
        const client2 = provider.getWebClient();
        expect(client1).toBe(client2);
    });

    it('should not replace an early WebBridgeClient with a mock when the native bridge appears later', () => {
        const provider = BridgeProvider.getInstance();
        const clientBeforeInjection = provider.getActiveWebClient();

        (window as any).ReactNativeWebView = {
            postMessage: jest.fn(),
        };

        const clientAfterInjection = provider.getActiveWebClient();

        expect(clientBeforeInjection).toBeInstanceOf(WebBridgeClient);
        expect(clientAfterInjection).toBe(clientBeforeInjection);
    });

    it('should allow injecting a web client factory for bridge simulation environments', () => {
        const provider = BridgeProvider.getInstance();
        const injectedClient = {
            post: jest.fn(),
            request: jest.fn(),
            onEvent: jest.fn(),
        } as any;

        provider.configure({
            createWebClient: () => injectedClient,
        });

        expect(provider.getActiveWebClient()).toBe(injectedClient);
    });

    it('should replace the active web client at runtime while keeping the exported proxy stable', () => {
        const provider = BridgeProvider.getInstance();
        const proxy = provider.getWebClient();
        const originalClient = provider.getActiveWebClient();
        const injectedClient = {
            post: jest.fn(),
            request: jest.fn(),
            onEvent: jest.fn(),
        } as any;

        const restore = provider.useBridgeEnvironment({ webClient: injectedClient });

        expect(provider.getWebClient()).toBe(proxy);
        expect(provider.getActiveWebClient()).toBe(injectedClient);

        webClient.post({ type: 'Ping', data: { payload: 'runtime-switch' } });
        expect(injectedClient.post).toHaveBeenCalledWith({ type: 'Ping', data: { payload: 'runtime-switch' } });

        restore();
        expect(provider.getActiveWebClient()).toBe(originalClient);
    });

    it('should rebind exported proxy event subscriptions when the active web client changes', () => {
        const provider = BridgeProvider.getInstance();
        const unsubscribeA = jest.fn();
        const unsubscribeB = jest.fn();
        const clientA = {
            post: jest.fn(),
            request: jest.fn(),
            onEvent: jest.fn(() => unsubscribeA),
        } as any;
        const clientB = {
            post: jest.fn(),
            request: jest.fn(),
            onEvent: jest.fn(() => unsubscribeB),
        } as any;
        const handler = jest.fn();

        const restoreA = provider.useBridgeEnvironment({ webClient: clientA });
        const unsubscribe = webClient.onEvent('OnReceiveNotification' as any, handler);

        expect(clientA.onEvent).toHaveBeenCalledWith('OnReceiveNotification', handler);

        const restoreB = provider.useBridgeEnvironment({ webClient: clientB });

        expect(unsubscribeA).toHaveBeenCalledTimes(1);
        expect(clientB.onEvent).toHaveBeenCalledWith('OnReceiveNotification', handler);

        unsubscribe();
        expect(unsubscribeB).toHaveBeenCalledTimes(1);

        restoreB();
        restoreA();
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
