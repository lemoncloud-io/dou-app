import { Linking, Platform } from 'react-native';

import { DeepLinkManager } from './DeepLinkManager';

type UrlHandler = (event: { url: string }) => void;

const urlHandlers: UrlHandler[] = [];

jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: {},
    Linking: {
        getInitialURL: jest.fn(),
        addEventListener: jest.fn((_event: string, handler: UrlHandler) => {
            urlHandlers.push(handler);
            return { remove: jest.fn() };
        }),
    },
}));

const getInitialURL = Linking.getInitialURL as jest.Mock;

const emitUrl = (url: string) => {
    for (const handler of [...urlHandlers]) handler({ url });
};

// Lets the capture pass both initial-URL reads so the late wait is armed before
// the test moves the clock or emits — acting earlier would hit nothing.
const armLateWait = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('DeepLinkManager cold start capture', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        urlHandlers.length = 0;
        Platform.OS = 'android';
        getInitialURL.mockReset();
        getInitialURL.mockResolvedValue(null);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns null when no url arrives before the late wait expires', async () => {
        const manager = new DeepLinkManager();
        const pending = manager.getInitialUrl();
        await armLateWait();

        jest.advanceTimersByTime(500);

        await expect(pending).resolves.toBeNull();
    });

    // A killed-state link tap that the OS delivers as a url event inside the late
    // wait used to clear the timeout without settling the wait: getInitialUrl hung
    // and the cold-start dispatch never ran.
    it('returns the url event that lands inside the late wait instead of hanging', async () => {
        const manager = new DeepLinkManager();
        manager.subscribe(() => undefined);
        const pending = manager.getInitialUrl();
        await armLateWait();

        emitUrl('chatic://chats/c1');
        jest.advanceTimersByTime(500);

        await expect(pending).resolves.toBe('chatic://chats/c1');
    });

    // The late url already reaches the cold-start dispatch through getInitialUrl;
    // forwarding it to the router listener too navigated to it a second time.
    it('does not forward a url claimed by the late wait to the router listener', async () => {
        const manager = new DeepLinkManager();
        const listener = jest.fn();
        manager.subscribe(listener);
        const pending = manager.getInitialUrl();
        await armLateWait();

        emitUrl('chatic://chats/c1');
        jest.advanceTimersByTime(500);

        await expect(pending).resolves.toBe('chatic://chats/c1');
        expect(listener).not.toHaveBeenCalled();
    });

    it('forwards a url event that arrives after the cold start settled', async () => {
        const manager = new DeepLinkManager();
        const listener = jest.fn();
        manager.subscribe(listener);
        const pending = manager.getInitialUrl();
        await armLateWait();
        jest.advanceTimersByTime(500);
        await expect(pending).resolves.toBeNull();

        emitUrl('chatic://chats/c2');

        expect(listener).toHaveBeenCalledWith('chatic://chats/c2');
    });

    it('settles the wait when unsubscribed mid-capture', async () => {
        const manager = new DeepLinkManager();
        const unsubscribe = manager.subscribe(() => undefined);
        const pending = manager.getInitialUrl();
        await armLateWait();

        unsubscribe();
        jest.advanceTimersByTime(500);

        await expect(pending).resolves.toBeNull();
    });
});
