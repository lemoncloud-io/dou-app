import type { TransportPlatformPorts } from '../platform';

/**
 * The jsdom page the tests run in, typed by hand: this package compiles without the DOM's types, and
 * a test fixture is no reason to bring them back.
 */
interface TestPage {
    navigator: { onLine: boolean; userAgent: string };
    addEventListener(type: 'online' | 'offline', listener: () => void): void;
    removeEventListener(type: 'online' | 'offline', listener: () => void): void;
    CHATIC_APP_PLATFORM?: string;
}

const page = (): TestPage => globalThis as unknown as TestPage;

/**
 * Transport ports for a test, behaving like the jsdom page the tests run in: `navigator.onLine` and
 * the window's `online`/`offline` events, the shell global and the user agent off `window`. So a test
 * that drives `navigator.onLine` keeps driving the link verdict. No socket: a case that reaches the
 * socket factory has to say what it opens. Override any port a case is about.
 */
export const fakeTransportPorts = (overrides: Partial<TransportPlatformPorts> = {}): TransportPlatformPorts => ({
    online: {
        read: () => page().navigator.onLine,
        subscribe: listener => {
            page().addEventListener('online', listener);
            page().addEventListener('offline', listener);
            return () => {
                page().removeEventListener('online', listener);
                page().removeEventListener('offline', listener);
            };
        },
    },
    device: () => ({ appPlatform: page().CHATIC_APP_PLATFORM, userAgent: page().navigator.userAgent }),
    createSocket: () => {
        throw new Error('[test] this case opens a socket but gave no createSocket port');
    },
    ...overrides,
});
