import { isNative } from './utils';

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
